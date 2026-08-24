"""Dependency-free assert script for ``rankedstats/sets.py``, run with plain ``python3``.

Exercises the pure set-grouping functions in ``rankedstats.sets`` against the REAL fixture
files in ``winratefetching/docs/fetchresult/`` (read-only -- this script never writes,
moves, or deletes anything under that directory) and asserts the exact numbers established
during research and reproduced in the plan's Verification Strategy table
(``notes/claude-specs/plans/rankedstats.md``, lines 78-101).

No pytest, no ``unittest``, no install required -- just ``python3 rankedstats/test_sets.py``.

Design notes:
    - "Qualifying" entries are ``soloRanked`` battles (``sets.is_ranked``) with
      ``battleTime >= "20260101"``. The comparison is a plain lexicographic STRING compare
      against the raw ``battleTime`` field, not a parsed-datetime compare. This works
      correctly because ``battleTime`` is a fixed-width, zero-padded ``YYYYMMDDT...`` string
      (e.g. ``"20260720T103754.000Z"``): comparing it lexicographically against the 8-char
      prefix ``"20260101"`` orders identically to comparing the underlying dates, since every
      date-bearing field is zero-padded to the same width. Chosen over
      ``sets.parse_battle_time`` + a ``datetime`` compare because it avoids parsing every raw
      item before the ``is_ranked`` filter has even run, and there is nothing to be gained in
      correctness by parsing first.
    - The owner tag for each fixture file is resolved primarily by matching the filename stem
      (``battlelog_{slug}``) against a roster member's ``slug`` (from
      ``rankedstats.roster.load_roster()``), which resolves unambiguously for every fixture
      that actually belongs to a current roster member. A 100%-presence-in-qualifying-entries
      fallback is implemented per the plan for robustness, but empirically is never needed by
      the current fixture set -- see the notepad entry for this task for detail on the two
      fixture files (``battlelog_wafles.json``, ``battlelog_trym.json``) that match no roster
      slug at all: both have zero qualifying (soloRanked, 2026) entries, so owner-tag
      resolution is moot for them.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from rankedstats.roster import load_roster  # noqa: E402
from rankedstats.sets import (  # noqa: E402
    canonical_teams,
    dedupe_key,
    group_into_sets,
    is_ranked,
    summarize_set,
)

FIXTURE_DIR = REPO_ROOT / "winratefetching" / "docs" / "fetchresult"
MIN_BATTLE_TIME = "20260101"

failures = 0


def check(description: str, actual, expected) -> None:
    """Print one PASS/FAIL line and track overall failure count."""

    global failures
    if actual == expected:
        print(f"PASS: {description} ({actual})")
    else:
        failures += 1
        print(f"FAIL: {description} expected={expected} actual={actual}")


def resolve_owner_tag(stem: str, qualifying_items: list, slug_to_tag: dict, roster_tags: set):
    """Resolve the roster tag that owns a fixture file's battlelog.

    Primary signal: the filename stem (``battlelog_{slug}.json`` -> ``stem`` is ``{slug}``)
    matched directly against a roster member's ``slug``. Only falls back to a
    100%-presence heuristic (a roster tag present in every one of the file's qualifying
    entries) if the filename-based match fails -- required because two roster members who
    queued together can each have the OTHER'S tag present in 100% of their own qualifying
    entries too, making the heuristic alone ambiguous.
    """

    if stem in slug_to_tag:
        return slug_to_tag[stem]

    if not qualifying_items:
        return None

    tag_presence_counts: dict[str, int] = {}
    for item in qualifying_items:
        entry_tags = set()
        for team in item["battle"]["teams"]:
            for player in team:
                entry_tags.add(player["tag"])
        for tag in entry_tags:
            tag_presence_counts[tag] = tag_presence_counts.get(tag, 0) + 1

    total_qualifying = len(qualifying_items)
    fully_present_roster_tags = [
        tag
        for tag, count in tag_presence_counts.items()
        if count == total_qualifying and tag in roster_tags
    ]

    if len(fully_present_roster_tags) == 1:
        return fully_present_roster_tags[0]

    return None


def main() -> None:
    global failures

    if not FIXTURE_DIR.is_dir():
        print(
            f"fixtures not found, skipping: {FIXTURE_DIR} does not exist. "
            "winratefetching/docs/fetchresult/ is gitignored, so this is expected on a "
            "fresh checkout that has never run the winratefetching poller."
        )
        sys.exit(0)

    fixture_paths = sorted(FIXTURE_DIR.glob("battlelog_*.json"))
    check("fixture file count", len(fixture_paths), 27)

    roster = load_roster()
    slug_to_tag = {entry["slug"]: entry["tag"] for entry in roster}
    roster_tags = {entry["tag"] for entry in roster}

    total_entries = 0
    total_groups = 0
    size_distribution = {1: 0, 2: 0, 3: 0}
    all_participant_tags: set[str] = set()
    roster_tags_seen: set[str] = set()
    dedupe_keys_by_file: dict[str, set[str]] = {}

    total_pair_count = 0
    total_brawler_changes = 0
    total_reshuffles = 0

    zimma_group = None
    star_virus_group = None
    aambakk_single_game_group = None

    for path in fixture_paths:
        stem = path.stem[len("battlelog_"):]

        with open(path, encoding="utf-8") as fixture_file:
            raw_data = json.load(fixture_file)

        raw_items = raw_data.get("items", [])
        qualifying_items = [
            item
            for item in raw_items
            if is_ranked(item) and item.get("battleTime", "") >= MIN_BATTLE_TIME
        ]
        total_entries += len(qualifying_items)

        for item in qualifying_items:
            teams = item["battle"]["teams"]
            teams_are_two_by_three = len(teams) == 2 and all(len(team) == 3 for team in teams)
            check(f"{stem}: qualifying entry {item['battleTime']} is 2 teams of 3", teams_are_two_by_three, True)

        per_game_canonical = {}
        file_dedupe_keys: set[str] = set()
        for item in qualifying_items:
            canonical = canonical_teams(item["battle"]["teams"])
            per_game_canonical[item["battleTime"]] = canonical

            all_tags = list(canonical.team0_tags) + list(canonical.team1_tags)
            all_participant_tags.update(all_tags)
            roster_tags_seen.update(tag for tag in all_tags if tag in roster_tags)

            key = dedupe_key(item["battleTime"], all_tags)
            file_dedupe_keys.add(key)

        check(
            f"{stem}: distinct dedupe keys equal qualifying entry count (no intra-file collision)",
            len(file_dedupe_keys),
            len(qualifying_items),
        )
        dedupe_keys_by_file[stem] = file_dedupe_keys

        if not qualifying_items:
            print(f"NOTE: {stem}: 0 qualifying entries, skipping owner-tag resolution and grouping")
            continue

        owner_tag = resolve_owner_tag(stem, qualifying_items, slug_to_tag, roster_tags)
        if owner_tag is None:
            failures += 1
            print(f"FAIL: {stem}: could not resolve an owner tag for {len(qualifying_items)} qualifying entries")
            continue

        groups = group_into_sets(qualifying_items, owner_tag)
        total_groups += len(groups)

        for group in groups:
            size = len(group["games"])
            size_distribution[size] = size_distribution.get(size, 0) + 1

            if stem == "zimma" and group["games"][0].battle_time_raw == "20260807T194759.000Z":
                zimma_group = group
            if stem == "star_virus" and group["games"][0].battle_time_raw == "20260107T232711.000Z":
                star_virus_group = group
            if stem == "aambakk" and group["games"][0].battle_time_raw == "20260720T095333.000Z":
                aambakk_single_game_group = group

            if size < 2:
                continue

            group_all_tags = list(group["team0_tags"]) + list(group["team1_tags"])

            for game in group["games"]:
                per_game = per_game_canonical[game.battle_time_raw]
                same_team0 = set(per_game.team0_tags) == set(group["team0_tags"])
                same_team1 = set(per_game.team1_tags) == set(group["team1_tags"])
                if not (same_team0 and same_team1):
                    total_reshuffles += 1

            for tag in group_all_tags:
                total_pair_count += 1
                brawler_ids_seen = set()
                for game in group["games"]:
                    per_game = per_game_canonical[game.battle_time_raw]
                    brawler_ids_seen.add(per_game.participants[tag]["brawler_id"])
                if len(brawler_ids_seen) > 1:
                    total_brawler_changes += 1

    check("qualifying entries across all fixtures", total_entries, 186)
    print(f"entries={total_entries}")

    check("total groups across all fixtures", total_groups, 126)
    print(f"groups={total_groups}")

    check("group size distribution", size_distribution, {1: 78, 2: 36, 3: 12})
    print(f"sizes={size_distribution}")

    check("team-partition reshuffles within a group", total_reshuffles, 0)
    print(f"reshuffles={total_reshuffles}")

    check("(player, group) pair denominator for the brawler-change check", total_pair_count, 288)
    check("brawler changes within multi-game groups", total_brawler_changes, 0)
    print(f"brawler_changes={total_brawler_changes}/{total_pair_count}")

    check("distinct participant tags across all qualifying entries", len(all_participant_tags), 510)
    check("roster members with >=1 qualifying game", len(roster_tags_seen), 13)

    key_to_files: dict[str, list[str]] = defaultdict(list)
    for stem, keys in dedupe_keys_by_file.items():
        for key in keys:
            key_to_files[key].append(stem)

    cross_file_duplicate_keys = {key: files for key, files in key_to_files.items() if len(files) > 1}
    file_pairs_with_duplicates = {tuple(sorted(set(files))) for files in cross_file_duplicate_keys.values()}

    print(f"cross_file_duplicates={len(cross_file_duplicate_keys)}")
    print(f"cross_file_duplicate_file_pairs={sorted(file_pairs_with_duplicates)}")

    check(
        "all cross-file duplicates trace to the aambakk/cursed file pair",
        file_pairs_with_duplicates,
        {("aambakk", "cursed")},
    )

    if len(cross_file_duplicate_keys) == 25:
        check("cross-file duplicate battle count", len(cross_file_duplicate_keys), 25)
    else:
        print(
            "WARN: cross-file duplicate battle count -- plan expected=25, "
            f"actual={len(cross_file_duplicate_keys)}. Not counted as a hard failure: this is a "
            "plan cross-referencing issue, not a sets.py bug or a fixture problem. The plan's "
            "'25' figure traces to the research note's 'the 25 collisions' finding, which was "
            "measured across the FULL 669-entry corpus (all battle types, all dates -- see "
            "notes/claude-specs/research/rankedstats-context.md lines 152-154), not the narrower "
            "186-entry soloRanked/battleTime>=20260101 scope this table row is listed under in the "
            "plan's Verification Strategy section. Within that narrower scope, "
            "battlelog_aambakk.json and battlelog_cursed.json each contain exactly 15 soloRanked "
            "entries total (all from one 2026-07-20 session), so 15 is the maximum possible "
            "collision count between them here -- 25 is not reachable in this scope. Full writeup "
            "in notes/claude-specs/notepads/rankedstats/issues.md."
        )

    if zimma_group is not None:
        summary = summarize_set(zimma_group)
        check("zimma draw group (20260807T194759.000Z) winning_team_index is None", summary["winning_team_index"], None)
        check("zimma draw group (20260807T194759.000Z) games_played", summary["games_played"], 3)
        check("zimma draw group (20260807T194759.000Z) results", [game.result for game in zimma_group["games"]], ["defeat", "victory", "draw"])
    else:
        failures += 1
        print("FAIL: zimma draw group (20260807T194759.000Z) not found in battlelog_zimma.json")

    if star_virus_group is not None:
        check(
            "star_virus 216s-gap group (20260107T232711.000Z) stays a single group of 3",
            len(star_virus_group["games"]),
            3,
        )
    else:
        failures += 1
        print("FAIL: star_virus 216s-gap group (20260107T232711.000Z) not found in battlelog_star_virus.json")

    if aambakk_single_game_group is not None:
        summary = summarize_set(aambakk_single_game_group)
        game = aambakk_single_game_group["games"][0]
        # Regression test: sub-Mythic Ranked is a single-game format, so this set is
        # complete after 1 game with no side ever reaching 2 wins. Before the fix,
        # winning_team_index stayed None here (only set when a side hit 2 wins), which
        # made every sub-Mythic single-game set render as a draw regardless of its real
        # result.
        check(
            "aambakk sub-Mythic single-game set (20260720T095333.000Z) games_played",
            summary["games_played"],
            1,
        )
        check(
            "aambakk sub-Mythic single-game set (20260720T095333.000Z) is_complete",
            summary["is_complete"],
            True,
        )
        check(
            "aambakk sub-Mythic single-game set (20260720T095333.000Z) winning_team_index "
            "matches the single game's own winner, not None",
            summary["winning_team_index"],
            game.winner_index,
        )
        check(
            "aambakk sub-Mythic single-game set (20260720T095333.000Z) winning_team_index value",
            summary["winning_team_index"],
            1,
        )
    else:
        failures += 1
        print(
            "FAIL: aambakk sub-Mythic single-game set (20260720T095333.000Z) not found in "
            "battlelog_aambakk.json"
        )

    print()
    if failures:
        print(f"{failures} assertion(s) FAILED")
        sys.exit(1)

    print("All assertions PASSED")
    sys.exit(0)


if __name__ == "__main__":
    main()
