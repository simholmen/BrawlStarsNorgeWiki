"""Pure set-grouping logic for Brawl Stars Ranked (soloRanked) battlelogs.

No network calls, no database access, no file writes. Every function here takes plain
Python data (dicts/lists straight out of parsed battlelog JSON) and returns plain Python
data, so it can be exercised directly by ``rankedstats/test_sets.py`` against real fixture
files without touching Supabase or the Brawl Stars API.

Key, non-obvious facts this module encodes (see
``notes/claude-specs/research/rankedstats-context.md`` for the underlying analysis):

- ``battleTime`` is the END of a battle, not the start. ``started_at`` for a game/set is
  reconstructed as ``battle_time - duration``.
- A "set" (best-of-3, or a single game below Mythic I) is identified primarily by
  ``event.id`` plus the exact 6-tag participant set, NOT by a time gap. Within-set gaps
  (55-229s, observed) overlap the smallest observed between-set gap (95s), so a time
  threshold alone cannot separate sets. ``MAX_INTRA_SET_GAP`` below is only an outer
  sanity bound, generous relative to what has ever been observed.
- ``battle.teams`` array order is relative to whichever player's battlelog was fetched.
  Two roster players who played in the same match must not end up with mirrored team
  indices in storage, hence ``canonical_teams``, which reorders teams deterministically
  by sorted tag list rather than trusting API order.
- Brawler (and rank tier) never changes within a set: the draft happens once per match.
  Participant brawler/rank data therefore belongs to the group as a whole, not to each
  individual game inside it.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import NamedTuple, Optional


# Outer sanity bound on the gap between two consecutive games that are still considered
# part of the same set, in seconds. This is NOT the primary set-boundary signal -- that is
# `event.id` + the 6-tag participant set. 900s (15 minutes) is generous versus the largest
# within-set gap ever observed (229s) while comfortably excluding a genuinely new session.
MAX_INTRA_SET_GAP = 900

# A "set" never grows past 3 games (best-of-3: first to 2 wins). This cap is a defensive
# guard only -- no fixture has ever produced a 4th matching game -- but if one ever showed
# up, it must start a brand new group rather than silently growing past 3.
MAX_GAMES_PER_SET = 3

# Rank tier value at which the format switches from a single game to best-of-3
# (Mythic I). Anything strictly below this plays a single-game "set".
MYTHIC_I_RANK_VALUE = 13


class CanonicalTeams(NamedTuple):
    """Deterministic, order-independent view of a single battle's two teams.

    Attributes:
        team0_tags: tuple of the 3 player tags on the canonical "team 0", i.e. whichever
            of the two raw teams has the lexicographically smaller sorted tag list.
        team1_tags: tuple of the 3 player tags on the other team.
        participants: mapping of every one of the 6 tags to that player's brawler payload
            for this battle, shaped as
            ``{"brawler_id": int, "brawler_name": str, "brawler_power": int,
              "rank_value": int}``.
            ``rank_value`` is taken verbatim from ``brawler.trophies`` in the battlelog
            entry. For ``soloRanked`` battles this field is NOT a real trophy count -- the
            API overloads it as a 1-22 rank tier value.
    """

    team0_tags: tuple[str, str, str]
    team1_tags: tuple[str, str, str]
    participants: dict[str, dict]


class RawGame(NamedTuple):
    """A single battlelog entry, reduced to what a set needs to remember per game.

    Attributes:
        battle_time: parsed, UTC-aware ``datetime`` of the battle's END (see module
            docstring -- this is proven, not assumed).
        battle_time_raw: the original ``battleTime`` string exactly as it appeared in the
            battlelog JSON (e.g. ``"20260720T103754.000Z"``). Kept verbatim because
            ``dedupe_key``/``set_key`` are defined over this exact string, not a
            re-formatted ISO string.
        duration: battle duration in seconds, as reported by the API.
        result: ``"victory"`` / ``"defeat"`` / ``"draw"`` relative to the log owner, or
            ``None`` if the field was absent from the source item.
        winner_index: canonical team index (0 or 1) that won this game, or ``None`` for a
            draw or an item with no ``result``.
        star_player_tag: tag of the battle's star player, or ``None`` if absent.
    """

    battle_time: datetime
    battle_time_raw: str
    duration: int
    result: Optional[str]
    winner_index: Optional[int]
    star_player_tag: Optional[str]


def is_ranked(item: dict) -> bool:
    """Return True only for well-formed soloRanked (Ranked mode) battlelog entries.

    Filters on ``battle.type == "soloRanked"``. Note that Brawl Stars API's plain
    ``"ranked"`` type is the trophy ladder, not Ranked -- it is deliberately NOT accepted
    here.

    Defensively also requires ``battle.teams`` to be exactly 2 teams of exactly 3 players
    each; any other shape is rejected by returning False rather than raising, since
    malformed/unexpected shapes should be silently skipped by callers, not crash a poll.
    """

    battle = item.get("battle")
    if not isinstance(battle, dict):
        return False

    if battle.get("type") != "soloRanked":
        return False

    teams = battle.get("teams")
    if not isinstance(teams, list) or len(teams) != 2:
        return False

    for team in teams:
        if not isinstance(team, list) or len(team) != 3:
            return False
        for player in team:
            if not isinstance(player, dict) or "tag" not in player:
                return False

    return True


def parse_battle_time(s: str) -> datetime:
    """Parse a battlelog ``battleTime`` string into a UTC-aware ``datetime``.

    IMPORTANT: this timestamp is the END of the battle, not the start. This was proven by
    gap analysis across 60 within-set consecutive game pairs (see
    ``notes/claude-specs/research/rankedstats-context.md``): the gap between two
    consecutive ``battleTime`` values matches the *next* game's duration plus a small
    constant matchmaking/loading overhead, not the previous game's duration. Do not treat
    this value as a battle start time anywhere downstream.
    """

    naive = datetime.strptime(s, "%Y%m%dT%H%M%S.%fZ")
    return naive.replace(tzinfo=timezone.utc)


def canonical_teams(teams: list[list[dict]]) -> CanonicalTeams:
    """Reorder a battle's two teams into a deterministic, log-owner-independent order.

    ``battle.teams`` array order is relative to whichever player's battlelog was fetched,
    so the same real-world match can appear with its two teams swapped depending on which
    roster player's log produced the entry. To make team indices comparable across
    different players' logs (required for cross-player dedupe and for consistently
    identifying "team 0" for a given set), team 0 is defined as whichever of the two teams
    has the lexicographically smaller SORTED tag list; team 1 is the other.

    Args:
        teams: ``battle["teams"]``, expected to be exactly 2 lists of exactly 3 player
            dicts, each with at least a ``"tag"`` key and a ``"brawler"`` dict.

    Returns:
        A ``CanonicalTeams`` namedtuple -- see its docstring for the exact shape.
    """

    raw_team_a, raw_team_b = teams[0], teams[1]

    sorted_tags_a = sorted(player["tag"] for player in raw_team_a)
    sorted_tags_b = sorted(player["tag"] for player in raw_team_b)

    if sorted_tags_a <= sorted_tags_b:
        canonical_team0, canonical_team1 = raw_team_a, raw_team_b
    else:
        canonical_team0, canonical_team1 = raw_team_b, raw_team_a

    participants: dict[str, dict] = {}
    for player in canonical_team0 + canonical_team1:
        brawler = player.get("brawler", {})
        participants[player["tag"]] = {
            "brawler_id": brawler.get("id"),
            "brawler_name": brawler.get("name"),
            "brawler_power": brawler.get("power"),
            "rank_value": brawler.get("trophies"),
        }

    team0_tags = tuple(player["tag"] for player in canonical_team0)
    team1_tags = tuple(player["tag"] for player in canonical_team1)

    return CanonicalTeams(team0_tags=team0_tags, team1_tags=team1_tags, participants=participants)


def dedupe_key(battle_time_iso: str, all_tags: list[str]) -> str:
    """Stable identifier for a single battle, proven unique across a 669-battle corpus.

    ``duration`` is deliberately excluded from the hash input -- research found it adds no
    disambiguating value over ``battle_time_iso`` + the sorted set of all 6 participant
    tags.

    Args:
        battle_time_iso: the raw ``battleTime`` string as it appears in the battlelog JSON
            (e.g. ``"20260720T103754.000Z"``), NOT a re-formatted ISO 8601 string.
        all_tags: the 6 participant tags for this battle, any order (this function sorts
            them itself).
    """

    payload = battle_time_iso + "|" + "|".join(sorted(all_tags))
    return hashlib.sha256(payload.encode()).hexdigest()


def winner_index(item: dict, owner_tag: str, canonical: CanonicalTeams) -> Optional[int]:
    """Resolve which canonical team (0, 1, or neither) won a single battle.

    Locates ``owner_tag`` (the player whose battlelog this item came from) inside the
    canonical team tuple to determine which canonical index the log owner sits on, then
    maps ``battle.result`` onto that: ``"victory"`` means the owner's own canonical team
    won, ``"defeat"`` means the other canonical team won, ``"draw"`` or a missing
    ``result`` key both resolve to ``None`` (no winner).

    Raises:
        ValueError: if ``owner_tag`` is not present in either canonical team. This should
            never happen for a legitimately-fetched battlelog item (the log owner is
            always one of the 6 participants), so treat it as a real bug rather than
            malformed input to silently skip.
    """

    if owner_tag in canonical.team0_tags:
        owner_index = 0
    elif owner_tag in canonical.team1_tags:
        owner_index = 1
    else:
        raise ValueError(f"owner_tag {owner_tag!r} not found in either canonical team")

    result = item["battle"].get("result")

    if result == "victory":
        return owner_index
    if result == "defeat":
        return 1 - owner_index
    return None


def _all_six_tags(canonical: CanonicalTeams) -> frozenset[str]:
    """All 6 participant tags for a battle, as a frozenset for order-independent comparison."""

    return frozenset(canonical.team0_tags) | frozenset(canonical.team1_tags)


def group_into_sets(items: list[dict], owner_tag: str) -> list[dict]:
    """Group a battlelog owner's soloRanked entries into best-of-3 (or single-game) sets.

    Steps:
        1. Filter to ``is_ranked(item)`` only -- non-soloRanked entries are dropped.
        2. Sort ascending by ``parse_battle_time`` (the Brawl Stars API returns battlelog
           items newest-first; this function does not trust the caller's input order).
        3. Walk the sorted list, starting a new group whenever any of the following is
           true relative to the current group:
             - ``event["id"]`` differs from the current group's ``event_id``, OR
             - the frozenset of all 6 participant tags differs from the current group's
               tag set, OR
             - the gap since the previous game's END (``battle_time``) exceeds
               ``MAX_INTRA_SET_GAP`` seconds, OR
             - the current group already has ``MAX_GAMES_PER_SET`` (3) games (a defensive
               cap -- never observed in real data, but a would-be 4th matching game starts
               a fresh group rather than appending).
           Time alone is deliberately NOT the primary signal: within-set gaps observed in
           research (55-229s) overlap the smallest observed between-set gap (95s), so
           ``event.id`` + tag set is what actually separates sets.
        4. Per group, record: ``event_id``, ``mode`` (``event["mode"]``), ``map``
           (``event["map"]``), the canonical team tags, each of the 6 participants'
           brawler id/name/power and ``rank_value`` (taken from the group's first game --
           brawler and rank are constant within a set, per research), and the ordered list
           of raw games.

    Args:
        items: battlelog items exactly as returned by the Brawl Stars API
            (``response["items"]``), in any order.
        owner_tag: the tag of the player whose battlelog ``items`` came from (with
            leading ``#``). Used to resolve each game's winner relative to that player.

    Returns:
        A list of group dicts, ordered ascending by the group's first game's
        ``battle_time``, each shaped as::

            {
                "event_id": int,
                "mode": str,
                "map": str,
                "team0_tags": (tag, tag, tag),
                "team1_tags": (tag, tag, tag),
                "participants": {
                    tag: {
                        "brawler_id": int,
                        "brawler_name": str,
                        "brawler_power": int,
                        "rank_value": int,
                    },
                    ...  # all 6 tags
                },
                "games": [RawGame, RawGame, ...],  # ascending by battle_time, len 1..3
            }

        ``summarize_set`` consumes exactly this shape.
    """

    ranked_items = [item for item in items if is_ranked(item)]
    ranked_items.sort(key=lambda item: parse_battle_time(item["battleTime"]))

    groups: list[dict] = []
    current_group: Optional[dict] = None
    current_tag_set: Optional[frozenset[str]] = None
    previous_battle_time: Optional[datetime] = None

    for item in ranked_items:
        event = item["event"]
        canonical = canonical_teams(item["battle"]["teams"])
        battle_time = parse_battle_time(item["battleTime"])
        tag_set = _all_six_tags(canonical)

        starts_new_group = (
            current_group is None
            or event["id"] != current_group["event_id"]
            or tag_set != current_tag_set
            or (battle_time - previous_battle_time).total_seconds() > MAX_INTRA_SET_GAP
            or len(current_group["games"]) >= MAX_GAMES_PER_SET
        )

        if starts_new_group:
            if current_group is not None:
                groups.append(current_group)

            current_group = {
                "event_id": event["id"],
                "mode": event["mode"],
                "map": event["map"],
                "team0_tags": canonical.team0_tags,
                "team1_tags": canonical.team1_tags,
                "participants": canonical.participants,
                "games": [],
            }
            current_tag_set = tag_set

        raw_game = RawGame(
            battle_time=battle_time,
            battle_time_raw=item["battleTime"],
            duration=item["battle"].get("duration"),
            result=item["battle"].get("result"),
            winner_index=winner_index(item, owner_tag, canonical),
            star_player_tag=(item["battle"].get("starPlayer") or {}).get("tag"),
        )
        current_group["games"].append(raw_game)
        previous_battle_time = battle_time

    if current_group is not None:
        groups.append(current_group)

    return groups


def summarize_set(group: dict, now: Optional[datetime] = None) -> dict:
    """Derive set-level stats from a ``group_into_sets`` group.

    Args:
        group: one group dict as produced by ``group_into_sets``.
        now: the "current time" used to evaluate the "stale open set" completion rule.
            Defaults to ``datetime.now(timezone.utc)``; injectable for testing.

    Returns:
        A dict shaped as::

            {
                "event_id": int,
                "mode": str,
                "map": str,
                "team0_tags": (tag, tag, tag),
                "team1_tags": (tag, tag, tag),
                "participants": {tag: {...brawler/rank_value...}, ...},  # from the group
                "started_at": datetime,       # first game's battle_time - its duration
                "ended_at": datetime,         # last game's battle_time
                "games_played": int,          # 1..3
                "team0_wins": int,
                "team1_wins": int,
                "winning_team_index": int | None,  # 0, 1, or None (no side reached 2 wins)
                "is_complete": bool,
                "set_key": str,               # dedupe_key of the group's earliest game
                "games": [RawGame, ...],       # passthrough, ascending by battle_time
            }

    Set completion rules (verbatim from the plan's Schema section):
        - Complete if ``max(team0_wins, team1_wins) >= 2``.
        - OR complete if ``games_played == 1`` and every participant's ``rank_value`` is
          below Mythic I (13) -- sub-Mythic Ranked is a single-game format, so one game
          IS a complete set.
        - OR complete if ``ended_at`` is more than 2 hours in the past relative to ``now``
          -- a set that has not grown since we last saw it is not going to.
        - Otherwise incomplete (open, awaiting a later poll).
    """

    if now is None:
        now = datetime.now(timezone.utc)

    games: list[RawGame] = group["games"]
    first_game = games[0]
    last_game = games[-1]

    started_at = first_game.battle_time - timedelta(seconds=first_game.duration)
    ended_at = last_game.battle_time

    team0_wins = sum(1 for game in games if game.winner_index == 0)
    team1_wins = sum(1 for game in games if game.winner_index == 1)
    games_played = len(games)

    is_below_mythic = all(
        participant["rank_value"] < MYTHIC_I_RANK_VALUE
        for participant in group["participants"].values()
    )

    if team0_wins >= 2:
        winning_team_index: Optional[int] = 0
    elif team1_wins >= 2:
        winning_team_index = 1
    elif games_played == 1 and is_below_mythic:
        # Sub-Mythic Ranked is a single-game format -- a set is decided by whoever won
        # that one game, not by reaching 2 wins. Falls back to the game's own
        # winner_index, which is itself None for a genuine single-game draw.
        winning_team_index = first_game.winner_index
    else:
        winning_team_index = None

    is_complete = (
        max(team0_wins, team1_wins) >= 2
        or (games_played == 1 and is_below_mythic)
        or (now - ended_at) > timedelta(hours=2)
    )

    all_tags = list(group["team0_tags"]) + list(group["team1_tags"])
    set_key = dedupe_key(first_game.battle_time_raw, all_tags)

    return {
        "event_id": group["event_id"],
        "mode": group["mode"],
        "map": group["map"],
        "team0_tags": group["team0_tags"],
        "team1_tags": group["team1_tags"],
        "participants": group["participants"],
        "started_at": started_at,
        "ended_at": ended_at,
        "games_played": games_played,
        "team0_wins": team0_wins,
        "team1_wins": team1_wins,
        "winning_team_index": winning_team_index,
        "is_complete": is_complete,
        "set_key": set_key,
        "games": games,
    }
