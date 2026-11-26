"""Daily refresh of the wiki's Topplister (/topplister/, supabase/migrations/021_toplists.sql).

Fetches the live Brawl Stars profile of every account on the toplists and stores the numbers
the page ranks by (3v3 wins, solo/duo Showdown wins, fame, highest ranked elo, and what the
account owns for "Maxet konto") in `toplist_stats`, one row per account. It also refreshes
`brawler_catalogue` (migration 022): what every brawler can have, from /v1/brawlers, plus which
buffies exist. The API doesn't say that, so a buffie counts as existing once any account here
owns it (and stays so), adjusted by BUFFIE_OVERRIDES below. Meant to run once a day from cron on the droplet (the
Brawl Stars API key is IP-bound to it):

    10 4 * * * cd /root/BrawlStarsNorgeWiki && /usr/bin/python3 rankedstats/toplists.py >> rankedstats/logs/toplists.log 2>&1

The accounts are the same set the page shows (web/lib/toplists.ts), from three sources:
    - wiki people with a valid tag (`people.bsid`),
    - active main ranked profiles (`ranked_profiles`, minis left out: same person twice),
    - extra accounts editors added on the page (`toplist_players`, active rows).

One account failing (bad tag, API hiccup) is logged and skipped; the run exits non-zero only
when nothing could be fetched at all.

    python3 rankedstats/toplists.py            # fetch and store
    python3 rankedstats/toplists.py --dry-run  # list the accounts, fetch nothing
    python3 rankedstats/toplists.py --new      # only accounts with no numbers yet (cron, every minute)

`--new` is how a player added on the site gets numbers within a minute or two: it fetches only
accounts without a `toplist_stats` row, once; after that they're in the daily run like everyone.

    * * * * * cd /root/BrawlStarsNorgeWiki && [ -f rankedstats/toplists.py ] && flock -n /tmp/toplists-new.lock /usr/bin/python3 rankedstats/toplists.py --new >> rankedstats/logs/toplists.log 2>&1
"""

from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from rankedstats import supa  # noqa: E402
from rankedstats.bs_api import fetch_brawler_catalogue, fetch_player_profile  # noqa: E402

TAG_RE = re.compile(r"^#[0289PYLQGRJCUV]{3,14}$")
PAUSE_SECONDS = 0.3  # between API calls; ~100 accounts take well under a minute

# --new mode: tags whose fetch failed, so a mistyped tag isn't retried every minute.
FAILED_STATE = REPO_ROOT / "rankedstats" / "logs" / "toplists_new_failed.json"
RETRY_MINUTES = 60

MAX_GEARS = 6 # some brawlers have 7-8 gears (being removed); count at most 6 per brawler

# Buffie kind in the API -> brawler_catalogue column.
BUFFIE_COLUMNS = {"gadget": "buffie_gadget", "starPower": "buffie_star_power", "hyperCharge": "buffie_hypercharge"}

# Manual corrections to buffie detection, by brawler name as the API spells it (upper case).
# True = the buffie exists even though nobody here owns it yet; False = it doesn't, whatever was
# detected. Example: {"SHELLY": {"hyperCharge": True}}
BUFFIE_OVERRIDES: dict = {}

# Same for whole brawlers (migration 023): /v1/brawlers also lists brawlers that can't be unlocked
# yet, so a brawler counts as released once any account here owns it. True = released although
# nobody here has it yet; False = not released, whatever was detected. Example: {"KAZE": True}
BRAWLER_OVERRIDES: dict = {}


def normalize_tag(raw) -> str | None:
    """'2gy22jur' / '#2GY22JUR ' -> '#2GY22JUR'; None when it isn't a valid Brawl Stars tag."""
    if not raw:
        return None
    tag = "#" + str(raw).strip().lstrip("#").upper()
    return tag if TAG_RE.match(tag) else None


def collect_tags(people: list, profiles: list, extras: list) -> list:
    """The accounts on the toplists, sorted and without duplicates.

    Args:
        people: rows with "bsid" (wiki people; bsid is stored without '#').
        profiles: ranked_profiles rows with "tag", "active", "main_tag".
        extras: toplist_players rows with "tag", "active".
    """
    tags = set()
    for p in people:
        tag = normalize_tag(p.get("bsid"))
        if tag:
            tags.add(tag)
    for r in profiles:
        if r.get("active") and not r.get("main_tag"):
            tag = normalize_tag(r.get("tag"))
            if tag:
                tags.add(tag)
    for r in extras:
        if r.get("active"):
            tag = normalize_tag(r.get("tag"))
            if tag:
                tags.add(tag)
    return sorted(tags)


def account_progress(brawlers: list) -> dict:
    """What an account owns, summed over its brawlers ("Maxet konto", migration 022)."""
    totals = {
        "brawlers_owned": 0,
        "owned_levels": 0,
        "owned_star_powers": 0,
        "owned_gadgets": 0,
        "owned_gears": 0,
        "owned_hypercharges": 0,
        "owned_buffies": 0,
    }
    for b in brawlers or []:
        totals["brawlers_owned"] += 1
        totals["owned_levels"] += int(b.get("power") or 0)
        totals["owned_star_powers"] += len(b.get("starPowers") or [])
        totals["owned_gadgets"] += len(b.get("gadgets") or [])
        totals["owned_gears"] += min(len(b.get("gears") or []), MAX_GEARS)
        totals["owned_hypercharges"] += len(b.get("hyperCharges") or [])
        totals["owned_buffies"] += sum(1 for v in (b.get("buffies") or {}).values() if v is True)
    return totals


def owned_buffie_kinds(brawlers: list) -> dict:
    """{brawler_id: {"gadget", "starPower", ...}} for the buffies this account owns."""
    found = {}
    for b in brawlers or []:
        kinds = {k for k, v in (b.get("buffies") or {}).items() if v is True and k in BUFFIE_COLUMNS}
        if kinds:
            found[b["id"]] = kinds
    return found


def catalogue_rows(
    catalogue: list,
    detected: dict,
    existing: dict,
    overrides: dict,
    now_iso: str,
    owned_ids: set = frozenset(),
    brawler_overrides: dict = None,
) -> list:
    """brawler_catalogue rows.

    Args:
        catalogue: /v1/brawlers items.
        detected: {brawler_id: set of buffie kinds} owned by any account this run.
        existing: {brawler_id: stored row}; a buffie or brawler once detected stays detected.
        overrides: BUFFIE_OVERRIDES.
        owned_ids: brawler ids owned by any account this run (released brawlers).
        brawler_overrides: BRAWLER_OVERRIDES.
    """
    brawler_overrides = brawler_overrides or {}
    rows = []
    for item in catalogue:
        bid = item["id"]
        name = item.get("name") or str(bid)
        row = {
            "brawler_id": bid,
            "name": name,
            "star_powers": len(item.get("starPowers") or []),
            "gadgets": len(item.get("gadgets") or []),
            "gears": min(len(item.get("gears") or []), MAX_GEARS),
            "hypercharges": len(item.get("hyperCharges") or []),
            "updated_at": now_iso,
        }
        before = existing.get(bid) or {}
        row["released"] = bool(before.get("released")) or bid in owned_ids
        if name.upper() in brawler_overrides:
            row["released"] = bool(brawler_overrides[name.upper()])
        for kind, column in BUFFIE_COLUMNS.items():
            value = bool(before.get(column)) or kind in detected.get(bid, set())
            if kind in overrides.get(name.upper(), {}):
                value = bool(overrides[name.upper()][kind])
            row[column] = value
        rows.append(row)
    return rows


def stats_row(tag: str, profile: dict, now_iso: str) -> dict:
    """A toplist_stats row from fetch_player_profile's result."""
    return {
        **account_progress(profile.get("brawlers") or []),
        "tag": tag,
        "profile_name": profile.get("name"),
        "club_name": profile.get("club_name"),
        "icon_id": profile.get("icon_id"),
        "trophies": profile.get("trophies"),
        "wins_3v3": profile.get("wins_3v3"),
        "wins_solo": profile.get("wins_solo"),
        "wins_duo": profile.get("wins_duo"),
        "fame": profile.get("fame"),
        "fame_tier_name": profile.get("fame_tier_name"),
        "highest_ranked_elo": profile.get("highest_ranked_elo"),
        "highest_ranked_rank": profile.get("highest_ranked_rank"),
        "highest_ranked_rank_name": profile.get("highest_ranked_rank_name"),
        "exp_level": profile.get("exp_level"),
        "exp_points": profile.get("exp_points"),
        "fetched_at": now_iso,
    }


def load_tags() -> list:
    people = supa.select("people", {"select": "bsid", "bsid": "not.is.null"})
    profiles = supa.select("ranked_profiles", {"select": "tag,active,main_tag"})
    extras = supa.select("toplist_players", {"select": "tag,active"})
    tags = collect_tags(people, profiles, extras)
    if not tags:
        raise RuntimeError("No accounts found for the toplists; refusing to run")
    return tags


def new_tags(tags: list, stored: set, failed: dict, now: datetime, retry_minutes: int = RETRY_MINUTES) -> list:
    """The accounts --new should fetch: no toplist_stats row yet, and not a recent failure.

    Args:
        tags: every account on the toplists (load_tags).
        stored: tags that already have a toplist_stats row.
        failed: {tag: ISO time of the last failed fetch} from the state file.
    """
    out = []
    for tag in tags:
        if tag in stored:
            continue
        last = failed.get(tag)
        if last:
            try:
                if (now - datetime.fromisoformat(last)).total_seconds() < retry_minutes * 60:
                    continue
            except ValueError:
                pass
        out.append(tag)
    return out


def main_new() -> int:
    """--new: fetch just the accounts that have no numbers yet (just added on the site), once.

    Runs every minute from cron; quiet when there's nothing to do. A tag that fails (mistyped,
    API hiccup) is retried at most every RETRY_MINUTES, tracked in FAILED_STATE.
    """
    now = datetime.now(timezone.utc)
    tags = load_tags()
    stored = {
        normalize_tag(r.get("tag"))
        for r in supa.select("toplist_stats", {"select": "tag"})
    }
    try:
        failed = json.loads(FAILED_STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        failed = {}
    todo = new_tags(tags, stored, failed, now)
    if not todo:
        return 0

    rows = []
    for i, tag in enumerate(todo):
        if i:
            time.sleep(PAUSE_SECONDS)
        try:
            profile = fetch_player_profile(tag)
        except Exception as exc:
            failed[tag] = datetime.now(timezone.utc).isoformat()
            print(f"WARN: {tag}: {exc}")
            continue
        failed.pop(tag, None)
        rows.append(stats_row(tag, profile, datetime.now(timezone.utc).isoformat()))
    if rows:
        supa.upsert("toplist_stats", rows, on_conflict="tag")

    # Forget failures for tags that are no longer on the lists.
    failed = {t: v for t, v in failed.items() if t in set(tags)}
    try:
        FAILED_STATE.parent.mkdir(parents=True, exist_ok=True)
        FAILED_STATE.write_text(json.dumps(failed, indent=1), encoding="utf-8")
    except OSError as exc:
        print(f"WARN: could not save {FAILED_STATE}: {exc}")
    print(
        f"===== {now.isoformat(timespec='seconds')} toplists --new: stored {len(rows)}"
        f" ({', '.join(r['tag'] for r in rows) or '-'}), failed {len(todo) - len(rows)} ====="
    )
    return 0


def main(argv: list) -> int:
    if "--new" in argv:
        return main_new()
    started = datetime.now(timezone.utc)
    tags = load_tags()
    print(f"===== {started.isoformat(timespec='seconds')} toplists: {len(tags)} accounts =====")
    if "--dry-run" in argv:
        for tag in tags:
            print(tag)
        return 0

    # What every brawler can have. If this fails the run still stores the players' numbers; the
    # page keeps using the catalogue from the last good run.
    try:
        catalogue = fetch_brawler_catalogue()
    except Exception as exc:
        catalogue = []
        print(f"WARN: brawler catalogue: {exc}")

    rows, failed = [], []
    detected: dict = {}
    owned_ids: set = set()
    for i, tag in enumerate(tags):
        if i:
            time.sleep(PAUSE_SECONDS)
        try:
            profile = fetch_player_profile(tag)
        except Exception as exc:  # one bad account never stops the rest
            failed.append(tag)
            print(f"WARN: {tag}: {exc}")
            continue
        rows.append(stats_row(tag, profile, datetime.now(timezone.utc).isoformat()))
        owned_ids.update(b["id"] for b in profile.get("brawlers") or [] if "id" in b)
        for bid, kinds in owned_buffie_kinds(profile.get("brawlers") or []).items():
            detected.setdefault(bid, set()).update(kinds)

    # One upsert in chunks: fewer round trips than one per account.
    for start in range(0, len(rows), 50):
        supa.upsert("toplist_stats", rows[start:start + 50], on_conflict="tag")

    if catalogue:
        existing = {
            row["brawler_id"]: row
            for row in supa.select(
                "brawler_catalogue", {"select": "brawler_id,released," + ",".join(BUFFIE_COLUMNS.values())}
            )
        }
        cat_rows = catalogue_rows(
            catalogue,
            detected,
            existing,
            BUFFIE_OVERRIDES,
            datetime.now(timezone.utc).isoformat(),
            owned_ids,
            BRAWLER_OVERRIDES,
        )
        supa.upsert("brawler_catalogue", cat_rows, on_conflict="brawler_id")
        with_buffies = sum(1 for r in cat_rows if any(r[c] for c in BUFFIE_COLUMNS.values()))
        unreleased = [r["name"] for r in cat_rows if not r["released"]]
        print(
            f"catalogue: {len(cat_rows)} brawlers, {len(cat_rows) - len(unreleased)} released"
            f" (not yet: {', '.join(unreleased) or '-'}), {with_buffies} with buffies"
        )

    took = (datetime.now(timezone.utc) - started).total_seconds()
    print(f"stored {len(rows)}, failed {len(failed)} ({', '.join(failed) or '-'}) in {took:.0f}s")
    return 1 if not rows else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
