"""Manual entrypoint: pull each roster player's battlelog and write ranked sets to Supabase.

Run manually (no scheduler is wired up by this module):

    python3 rankedstats/ingest.py

Per roster player, this implements the following algorithm. Nothing below performs a
`delete`; convergence and idempotency come entirely from `ignore-duplicates` battle
inserts, `merge-duplicates` player/participant upserts, and the "attach to an existing
open set" logic in step 4 -- re-running this script immediately after a successful run is
a no-op.

    1. Fetch the player's battlelog, group it into sets (`group_into_sets`), and derive
       each set's summary stats (`summarize_set`).
    2. Upsert every participant tag seen across all of this player's sets into `players`
       (merge `name`/`updated_at`). Roster tags get `is_tracked = true`; non-roster tags
       omit `is_tracked` entirely so an existing `true` is never merged back to `false`.
    3. For each set, compute every game's `dedupe_key` and check whether any of them are
       already stored in `battles`. If so, reuse that game's `set_id` for the whole set --
       this is what makes a set assembled across multiple polls converge onto one row.
    4. Otherwise, look for an existing OPEN `ranked_sets` row (same `event_id`, same 6-tag
       participant set, `is_complete = false`, `ended_at` within `MAX_INTRA_SET_GAP` of the
       new set's earliest game) to attach to instead of creating a duplicate set.
    5. Otherwise, insert a new `ranked_sets` row (`on_conflict=set_key`) from the set
       summary's computed fields.
    6. Upsert all 6 `set_participants` rows for the set (`on_conflict=set_id,player_tag`).
    7. Insert the set's `battles` rows (`on_conflict=dedupe_key`, ignore-duplicates) -- the
       real idempotency guard against double-counting a match two roster players shared.
    8. Re-query ALL battles currently stored for that `set_id` (not just the ones just
       inserted) and recompute/PATCH `games_played`, `team0_wins`, `team1_wins`,
       `winning_team_index`, `is_complete`, and `ended_at` (= max stored `battle_time`)
       from that authoritative set of rows. `set_key` and `started_at` are never touched
       here or anywhere after the initial insert in step 5 -- only `ended_at` tracks new
       data as later games are attached to an open set across polls.
    9. Sweep: mark any `is_complete = false` set whose `ended_at` is more than 2 hours old
       as complete.

A single player's failure is caught, logged, and does not stop the run; `main()` returns a
non-zero exit code if any player errored, 0 otherwise.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from rankedstats import supa  # noqa: E402
from rankedstats.bs_api import fetch_battlelog  # noqa: E402
from rankedstats.roster import load_roster  # noqa: E402
from rankedstats.sets import (  # noqa: E402
    MAX_INTRA_SET_GAP,
    MYTHIC_I_RANK_VALUE,
    dedupe_key,
    group_into_sets,
    summarize_set,
)

STALE_OPEN_SET_AGE = timedelta(hours=2)


def main() -> int:
    """Run the ingest for every roster player, print per-player and total summaries.

    Returns:
        0 if every roster player was processed without error, 1 if any player errored.
    """

    roster = load_roster()
    roster_tags = {entry["tag"] for entry in roster}
    roster_name_by_tag = {entry["tag"]: entry["name"] for entry in roster}

    totals = {
        "players_processed": 0,
        "players_errored": 0,
        "sets_seen": 0,
        "sets_new": 0,
        "sets_updated": 0,
        "games_inserted": 0,
        "games_skipped": 0,
    }

    for entry in roster:
        tag = entry["tag"]
        name = entry["name"]

        try:
            player_summary = ingest_player(tag, roster_tags, roster_name_by_tag)
        except Exception as exc:
            totals["players_errored"] += 1
            print(f"ERROR processing {name} ({tag}): {exc}")
            continue

        totals["players_processed"] += 1
        for key in ("sets_seen", "sets_new", "sets_updated", "games_inserted", "games_skipped"):
            totals[key] += player_summary[key]

        print(
            f"{name} ({tag}): sets_seen={player_summary['sets_seen']} "
            f"sets_new={player_summary['sets_new']} sets_updated={player_summary['sets_updated']} "
            f"games_inserted={player_summary['games_inserted']} "
            f"games_skipped={player_summary['games_skipped']}"
        )

    print(
        "TOTALS: "
        f"players_processed={totals['players_processed']} "
        f"players_errored={totals['players_errored']} "
        f"sets_seen={totals['sets_seen']} sets_new={totals['sets_new']} "
        f"sets_updated={totals['sets_updated']} games_inserted={totals['games_inserted']} "
        f"games_skipped={totals['games_skipped']}"
    )

    return 1 if totals["players_errored"] > 0 else 0


def ingest_player(tag: str, roster_tags: set, roster_name_by_tag: dict) -> dict:
    """Fetch and ingest one roster player's battlelog. Steps 1-9 of the module docstring.

    Args:
        tag: the roster player's tag, including leading `#`.
        roster_tags: the full set of every roster player's tag (used to decide which
            upserted `players` rows get `is_tracked = true`).
        roster_name_by_tag: tag -> roster display name, used as a fallback when a
            participant's live battlelog name cannot be determined.

    Returns:
        dict with keys sets_seen, sets_new, sets_updated, games_inserted, games_skipped.
    """

    summary = {
        "sets_seen": 0,
        "sets_new": 0,
        "sets_updated": 0,
        "games_inserted": 0,
        "games_skipped": 0,
    }

    items = fetch_battlelog(tag)
    groups = group_into_sets(items, owner_tag=tag)

    if not groups:
        sweep_stale_sets()
        return summary

    tag_to_name = build_tag_to_name(items)
    upsert_players_for_groups(groups, tag_to_name, roster_tags, roster_name_by_tag)

    for group in groups:
        set_summary = summarize_set(group)
        summary["sets_seen"] += 1

        set_result = ingest_set(set_summary)

        if set_result["is_new"]:
            summary["sets_new"] += 1
        else:
            summary["sets_updated"] += 1

        summary["games_inserted"] += set_result["games_inserted"]
        summary["games_skipped"] += set_result["games_skipped"]

    sweep_stale_sets()

    return summary


def build_tag_to_name(items: list) -> dict:
    """Build a tag -> live in-game display name map from raw battlelog items.

    `rankedstats.sets.canonical_teams` deliberately does not keep each player's display
    name (only brawler/rank data), so this reads it directly from the same raw
    `battle.teams` structure. Guards defensively against malformed shapes instead of
    raising, matching the tolerant style of `sets.is_ranked`.
    """

    tag_to_name: dict[str, str] = {}

    for item in items:
        battle = item.get("battle")
        if not isinstance(battle, dict):
            continue

        teams = battle.get("teams")
        if not isinstance(teams, list):
            continue

        for team in teams:
            if not isinstance(team, list):
                continue
            for player in team:
                if not isinstance(player, dict):
                    continue
                player_tag = player.get("tag")
                player_name = player.get("name")
                if player_tag and player_name:
                    tag_to_name[player_tag] = player_name

    return tag_to_name


def upsert_players_for_groups(
    groups: list, tag_to_name: dict, roster_tags: set, roster_name_by_tag: dict
) -> None:
    """Upsert every participant tag seen across `groups` into `players`. Step 2.

    Roster-tag rows and non-roster-tag rows are sent as two separate upsert calls so that
    `is_tracked` can be included for roster tags and omitted entirely for non-roster tags
    (merge-duplicates only touches columns present in the payload, so omitting the column
    is what prevents an existing `true` from ever being merged back to `false`).
    """

    all_tags: set = set()
    for group in groups:
        all_tags.update(group["team0_tags"])
        all_tags.update(group["team1_tags"])

    now_iso = datetime.now(timezone.utc).isoformat()

    roster_rows = []
    other_rows = []

    for player_tag in sorted(all_tags):
        display_name = tag_to_name.get(player_tag) or roster_name_by_tag.get(player_tag) or player_tag
        row = {"tag": player_tag, "name": display_name, "updated_at": now_iso}

        if player_tag in roster_tags:
            row["is_tracked"] = True
            roster_rows.append(row)
        else:
            other_rows.append(row)

    if roster_rows:
        supa.upsert("players", roster_rows, on_conflict="tag")

    if other_rows:
        supa.upsert("players", other_rows, on_conflict="tag")


def ingest_set(set_summary: dict) -> dict:
    """Write one set (and its games) to Supabase. Steps 3-8 of the module docstring.

    Returns:
        dict with keys is_new (bool), games_inserted (int), games_skipped (int).
    """

    all_tags = list(set_summary["team0_tags"]) + list(set_summary["team1_tags"])
    game_dedupe_keys = [
        dedupe_key(game.battle_time_raw, all_tags) for game in set_summary["games"]
    ]

    existing_set_id = find_set_id_via_stored_battles(game_dedupe_keys)
    is_new_set = False

    if existing_set_id is None:
        existing_set_id = find_open_set_to_attach(set_summary, all_tags)

    if existing_set_id is None:
        existing_set_id = insert_new_ranked_set(set_summary)
        is_new_set = True

    upsert_set_participants(existing_set_id, set_summary)

    inserted_battle_rows = insert_battles(existing_set_id, set_summary, game_dedupe_keys)
    games_inserted = len(inserted_battle_rows)
    games_skipped = len(set_summary["games"]) - games_inserted

    recompute_and_patch_set(existing_set_id, set_summary["participants"])

    return {
        "is_new": is_new_set,
        "games_inserted": games_inserted,
        "games_skipped": games_skipped,
    }


def find_set_id_via_stored_battles(game_dedupe_keys: list) -> str | None:
    """Step 3: if any of this set's games are already stored, return their shared set_id."""

    if not game_dedupe_keys:
        return None

    keys_csv = ",".join(game_dedupe_keys)
    matching_battles = supa.select(
        "battles", {"select": "set_id,dedupe_key", "dedupe_key": f"in.({keys_csv})"}
    )

    if not matching_battles:
        return None

    return matching_battles[0]["set_id"]


def find_open_set_to_attach(set_summary: dict, all_tags: list) -> str | None:
    """Step 4: look for an existing incomplete set with the same event and participants.

    Only reached when none of the new set's games were already stored (step 3 found no
    match), meaning this could be a continuation of an open set that this poll's
    battlelog window no longer includes the earlier game(s) for.
    """

    open_candidates = supa.select(
        "ranked_sets",
        {
            "select": "id,ended_at",
            "event_id": f"eq.{set_summary['event_id']}",
            "is_complete": "eq.false",
        },
    )

    if not open_candidates:
        return None

    new_group_earliest_time = set_summary["games"][0].battle_time
    target_tag_set = frozenset(all_tags)

    for candidate in open_candidates:
        candidate_ended_at = parse_postgres_timestamp(candidate["ended_at"])
        gap_seconds = abs((new_group_earliest_time - candidate_ended_at).total_seconds())

        if gap_seconds > MAX_INTRA_SET_GAP:
            continue

        candidate_participants = supa.select(
            "set_participants",
            {"select": "player_tag", "set_id": f"eq.{candidate['id']}"},
        )
        candidate_tag_set = frozenset(row["player_tag"] for row in candidate_participants)

        if candidate_tag_set == target_tag_set:
            return candidate["id"]

    return None


def insert_new_ranked_set(set_summary: dict) -> str:
    """Step 5: insert a brand new `ranked_sets` row, keyed by `set_key`.

    `set_key` is set here and never rewritten again -- later steps (and later polls that
    converge onto this same set via step 3 or step 4) must not touch it.
    """

    new_set_row = {
        "set_key": set_summary["set_key"],
        "event_id": set_summary["event_id"],
        "mode": set_summary["mode"],
        "map": set_summary["map"],
        "started_at": set_summary["started_at"].isoformat(),
        "ended_at": set_summary["ended_at"].isoformat(),
        "games_played": set_summary["games_played"],
        "team0_wins": set_summary["team0_wins"],
        "team1_wins": set_summary["team1_wins"],
        "winning_team_index": set_summary["winning_team_index"],
        "is_complete": set_summary["is_complete"],
    }

    inserted_rows = supa.upsert("ranked_sets", [new_set_row], on_conflict="set_key")
    return inserted_rows[0]["id"]


def upsert_set_participants(set_id: str, set_summary: dict) -> None:
    """Step 6: upsert all 6 participants for this set."""

    participant_rows = []

    for team_index, team_tags in (
        (0, set_summary["team0_tags"]),
        (1, set_summary["team1_tags"]),
    ):
        for player_tag in team_tags:
            participant = set_summary["participants"][player_tag]
            participant_rows.append(
                {
                    "set_id": set_id,
                    "player_tag": player_tag,
                    "team_index": team_index,
                    "brawler_id": participant["brawler_id"],
                    "brawler_name": participant["brawler_name"],
                    "brawler_power": participant["brawler_power"],
                    "rank_value": participant["rank_value"],
                }
            )

    supa.upsert("set_participants", participant_rows, on_conflict="set_id,player_tag")


def insert_battles(set_id: str, set_summary: dict, game_dedupe_keys: list) -> list:
    """Step 7: append-only insert of this set's games, ignoring already-stored duplicates.

    Returns only the rows PostgREST actually inserted (conflicting rows are silently
    skipped, not returned, under `resolution=ignore-duplicates`), so the length of the
    return value is exactly how many NEW games this call added.
    """

    new_battle_rows = []

    for game_index, game in enumerate(set_summary["games"]):
        new_battle_rows.append(
            {
                "set_id": set_id,
                "game_number": game_index + 1,
                "battle_time": game.battle_time.isoformat(),
                "duration": game.duration,
                "winning_team_index": game.winner_index,
                "star_player_tag": game.star_player_tag,
                "dedupe_key": game_dedupe_keys[game_index],
            }
        )

    return supa.upsert(
        "battles", new_battle_rows, on_conflict="dedupe_key", ignore_duplicates=True
    )


def recompute_and_patch_set(set_id: str, participants: dict) -> None:
    """Step 8: recompute set-level stats from ALL stored battles, then PATCH.

    Re-queries every battle currently stored for `set_id` (not just the ones this call
    just inserted) so that a set assembled across two separate polls converges on the
    correct totals. Patches `games_played`, `team0_wins`, `team1_wins`,
    `winning_team_index`, `is_complete`, and `ended_at` -- `set_key` and `started_at`
    (the set's EARLIEST-game identity fields) are never touched here, since the plan
    fixes them at insert time; `ended_at` (the LATEST-game field) is deliberately the
    odd one out and is recomputed every call so it always reflects the freshest known
    game for the set, even when step 4 attaches a later game across two polls.
    """

    stored_battles = supa.select("battles", {"select": "*", "set_id": f"eq.{set_id}"})

    games_played = len(stored_battles)
    team0_wins = sum(1 for battle in stored_battles if battle["winning_team_index"] == 0)
    team1_wins = sum(1 for battle in stored_battles if battle["winning_team_index"] == 1)

    is_below_mythic = all(
        participant["rank_value"] < MYTHIC_I_RANK_VALUE for participant in participants.values()
    )

    if team0_wins >= 2:
        winning_team_index = 0
    elif team1_wins >= 2:
        winning_team_index = 1
    elif games_played == 1 and is_below_mythic:
        # Sub-Mythic Ranked is a single-game format -- a set is decided by whoever won
        # that one game, not by reaching 2 wins. Mirrors the same fallback in
        # sets.summarize_set.
        winning_team_index = stored_battles[0]["winning_team_index"]
    else:
        winning_team_index = None

    latest_battle_time = max(
        parse_postgres_timestamp(battle["battle_time"]) for battle in stored_battles
    )
    now = datetime.now(timezone.utc)

    is_complete = (
        max(team0_wins, team1_wins) >= 2
        or (games_played == 1 and is_below_mythic)
        or (now - latest_battle_time) > STALE_OPEN_SET_AGE
    )

    supa.patch(
        "ranked_sets",
        {"id": f"eq.{set_id}"},
        {
            "games_played": games_played,
            "team0_wins": team0_wins,
            "team1_wins": team1_wins,
            "winning_team_index": winning_team_index,
            "is_complete": is_complete,
            # ended_at tracks the latest known game and is recomputed every call so it
            # never goes stale when step 4 attaches a later game across two polls;
            # started_at/set_key are the earliest-game identity fields and stay fixed
            # once set (see insert_new_ranked_set) -- this asymmetry is intentional.
            "ended_at": latest_battle_time.isoformat(),
            "updated_at": now.isoformat(),
        },
    )


def sweep_stale_sets() -> None:
    """Step 9: mark any open set whose `ended_at` is more than 2 hours old as complete."""

    cutoff = datetime.now(timezone.utc) - STALE_OPEN_SET_AGE
    stale_sets = supa.select(
        "ranked_sets",
        {"select": "id", "is_complete": "eq.false", "ended_at": f"lt.{cutoff.isoformat()}"},
    )

    for stale_set in stale_sets:
        supa.patch(
            "ranked_sets",
            {"id": f"eq.{stale_set['id']}"},
            {"is_complete": True, "updated_at": datetime.now(timezone.utc).isoformat()},
        )


def parse_postgres_timestamp(value: str) -> datetime:
    """Parse a PostgREST-returned timestamptz string into a UTC-aware datetime."""

    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


if __name__ == "__main__":
    sys.exit(main())
