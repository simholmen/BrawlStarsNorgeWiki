"""Dependency-free assert script for rankedstats/toplists.py, run with plain ``python3``:

    python3 rankedstats/test_toplists.py

Only the pure functions (no network, no database).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rankedstats.toplists import (  # noqa: E402
    account_progress,
    catalogue_rows,
    collect_tags,
    new_tags,
    normalize_tag,
    owned_buffie_kinds,
    stats_row,
)


def test_normalize_tag():
    assert normalize_tag("2gy22jur") == "#2GY22JUR"
    assert normalize_tag(" #2GY22JUR ") == "#2GY22JUR"
    assert normalize_tag("#OOPS") is None  # O is not a tag character
    assert normalize_tag("") is None
    assert normalize_tag(None) is None


def test_collect_tags():
    people = [{"bsid": "2GY22JUR"}, {"bsid": "yq29980"}, {"bsid": "bad tag"}, {"bsid": None}]
    profiles = [
        {"tag": "#2GY22JUR", "active": True, "main_tag": None},  # also a wiki person: once only
        {"tag": "#9YRVPPGCC", "active": True, "main_tag": None},
        {"tag": "#8Q0YGP8P", "active": True, "main_tag": "#2GY22JUR"},  # mini: left out
        {"tag": "#22UYPCCJG", "active": False, "main_tag": None},  # removed: left out
    ]
    extras = [{"tag": "#RRCLPJVP", "active": True}, {"tag": "#R8RP0Y0U", "active": False}]
    assert collect_tags(people, profiles, extras) == ["#2GY22JUR", "#9YRVPPGCC", "#RRCLPJVP", "#YQ29980"]


def test_stats_row():
    row = stats_row(
        "#2GY22JUR",
        {"name": "Zimma", "wins_3v3": 45115, "fame": 192530, "exp_level": 349, "exp_points": 618581},
        "2026-11-26T00:00:00+00:00",
    )
    assert row["tag"] == "#2GY22JUR"
    assert row["profile_name"] == "Zimma"
    assert row["wins_3v3"] == 45115
    assert row["fame"] == 192530
    assert (row["exp_level"], row["exp_points"]) == (349, 618581)
    assert row["wins_solo"] is None
    assert row["fetched_at"] == "2026-11-26T00:00:00+00:00"


SHELLY = {
    "id": 16000000, "name": "SHELLY", "power": 11,
    "starPowers": [{}, {}], "gadgets": [{}, {}], "gears": [{}] * 8, "hyperCharges": [{}],
    "buffies": {"gadget": True, "starPower": True, "hyperCharge": False},
}
COLT = {"id": 16000001, "name": "COLT", "power": 7, "starPowers": [{}], "gadgets": [], "gears": [{}] * 2,
        "hyperCharges": [], "buffies": {"gadget": False, "starPower": False, "hyperCharge": False}}


def test_account_progress():
    p = account_progress([SHELLY, COLT])
    assert p == {
        "brawlers_owned": 2,
        "owned_levels": 18,
        "owned_star_powers": 3,
        "owned_gadgets": 2,
        "owned_gears": 8,  # 8 gears on SHELLY count as 6, plus 2 on COLT
        "owned_hypercharges": 1,
        "owned_buffies": 2,
    }, p
    assert account_progress([])["brawlers_owned"] == 0
    assert stats_row("#2GY22JUR", {"brawlers": [COLT]}, "t")["owned_levels"] == 7


def test_buffie_detection():
    assert owned_buffie_kinds([SHELLY, COLT]) == {16000000: {"gadget", "starPower"}}
    catalogue = [
        {"id": 16000000, "name": "SHELLY", "starPowers": [{}, {}], "gadgets": [{}, {}], "gears": [{}] * 7, "hyperCharges": [{}]},
        {"id": 16000001, "name": "COLT", "starPowers": [{}, {}], "gadgets": [{}, {}], "gears": [{}] * 6, "hyperCharges": [{}]},
        {"id": 16000002, "name": "BULL", "starPowers": [{}, {}], "gadgets": [{}, {}], "gears": [{}] * 6, "hyperCharges": []},
    ]
    detected = owned_buffie_kinds([SHELLY])
    existing = {16000001: {"buffie_gadget": True, "buffie_star_power": False, "buffie_hypercharge": False}}
    overrides = {"BULL": {"starPower": True}, "SHELLY": {"gadget": False}}
    rows = {r["name"]: r for r in catalogue_rows(catalogue, detected, existing, overrides, "t")}
    assert rows["SHELLY"]["gears"] == 6
    assert (rows["SHELLY"]["buffie_gadget"], rows["SHELLY"]["buffie_star_power"]) == (False, True)  # override wins
    assert rows["COLT"]["buffie_gadget"] is True  # detected earlier, kept
    assert rows["BULL"]["buffie_star_power"] is True and rows["BULL"]["hypercharges"] == 0


def test_released_detection():
    catalogue = [
        {"id": 1, "name": "SHELLY"},
        {"id": 2, "name": "COLT"},
        {"id": 3, "name": "NEWBIE"},
        {"id": 4, "name": "LATER"},
    ]
    existing = {2: {"released": True}}  # detected on an earlier run
    rows = {
        r["name"]: r["released"]
        for r in catalogue_rows(catalogue, {}, existing, {}, "t", owned_ids={1}, brawler_overrides={"LATER": True})
    }
    assert rows == {"SHELLY": True, "COLT": True, "NEWBIE": False, "LATER": True}, rows


def test_new_tags():
    from datetime import datetime, timedelta, timezone

    now = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)
    tags = ["#AAA", "#BBB", "#CCC", "#DDD"]
    failed = {
        "#CCC": (now - timedelta(minutes=5)).isoformat(),  # failed recently: wait
        "#DDD": (now - timedelta(minutes=90)).isoformat(),  # failed long ago: try again
    }
    assert new_tags(tags, {"#AAA"}, failed, now) == ["#BBB", "#DDD"]
    assert new_tags(tags, set(tags), {}, now) == []


if __name__ == "__main__":
    test_normalize_tag()
    test_collect_tags()
    test_stats_row()
    test_account_progress()
    test_buffie_detection()
    test_released_detection()
    test_new_tags()
    print("toplists: all assertions passed")
