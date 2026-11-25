"""Load the roster of tracked players.

Since wiki-migration Phase 2 the roster lives in the Supabase table `ranked_profiles`
(supabase/migrations/016_ranked_profiles.sql), managed by editors on the site under
"Ranked-profiler". `load_roster()` reads the active rows from there.

The old source, `bsid` + `name` in docs/_personer/*.md front matter, is kept as
`load_roster_from_markdown()` for comparison only: those files are frozen since Phase 4.

    python -m rankedstats.roster            # print the roster ingest will use
    python -m rankedstats.roster --compare  # diff it against the Markdown roster
"""

import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
PERSONER_DIR = REPO_ROOT / "docs" / "_personer"


def _parse_front_matter(path: Path):
    """Read a markdown file and return its YAML front matter as a dict.

    Returns an empty dict if the file does not start with a `---` fence or
    has no closing fence.
    """
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    if not lines or lines[0].strip() != "---":
        return {}

    end = 1
    while end < len(lines) and lines[end].strip() != "---":
        end += 1

    if end >= len(lines):
        return {}

    front_matter_text = "".join(lines[1:end])
    data = yaml.safe_load(front_matter_text)
    if not isinstance(data, dict):
        return {}

    return data


def _slug(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def load_roster():
    """Read the roster of tracked players from the `ranked_profiles` table (active rows only).

    Raises instead of returning an empty list when the table can't be read, so a Supabase
    outage stops the ingest run rather than looking like "nobody is tracked any more".

    Returns:
        list[dict]: a list of {"tag": str, "name": str, "slug": str} entries, sorted by name.
        `tag` includes the leading `#`.
    """
    from rankedstats import supa

    rows = supa.select(
        "ranked_profiles",
        {"select": "tag,name", "active": "eq.true", "order": "name.asc"},
    )
    if not rows:
        raise RuntimeError("ranked_profiles returned no active players; refusing to run with an empty roster")

    return [
        {"tag": row["tag"].strip().upper(), "name": row["name"].strip(), "slug": _slug(row["name"])}
        for row in rows
    ]


def load_roster_from_markdown():
    """Build the roster of tracked players from docs/_personer/*.md (pre-Phase-2 source).

    For every markdown file in docs/_personer, parse the YAML front matter
    and, if both `bsid` and `name` are present, build a roster entry with
    the tag prefixed by `#` (the .md files store bsid without the leading
    `#`, but the Brawl Stars API and the rest of this system expect it).

    Returns:
        list[dict]: a list of {"tag": str, "name": str, "slug": str}
        entries. Files missing `bsid` or `name` are skipped, not raised.
    """
    roster = []

    if not PERSONER_DIR.is_dir():
        return roster

    for path in sorted(PERSONER_DIR.glob("*.md")):
        data = _parse_front_matter(path)

        bsid = data.get("bsid", "")
        name = data.get("name", "")

        if not bsid or not str(bsid).strip():
            continue

        if not name or not str(name).strip():
            continue

        tag = "#" + str(bsid).strip()
        slug = _slug(str(name))

        roster.append({
            "tag": tag,
            "name": str(name).strip(),
            "slug": slug,
        })

    return roster


def _compare() -> int:
    db = {e["tag"]: e["name"] for e in load_roster()}
    md = {e["tag"]: e["name"] for e in load_roster_from_markdown()}
    print(f"ranked_profiles: {len(db)} active, Markdown: {len(md)}")
    only_db = sorted(db.keys() - md.keys())
    only_md = sorted(md.keys() - db.keys())
    renamed = sorted(t for t in db.keys() & md.keys() if db[t] != md[t])
    for t in only_db:
        print(f"  only in ranked_profiles: {t} {db[t]}")
    for t in only_md:
        print(f"  only in Markdown:        {t} {md[t]}")
    for t in renamed:
        print(f"  name differs:            {t} {md[t]!r} -> {db[t]!r}")
    if not (only_db or only_md or renamed):
        print("  identical")
    return 0


if __name__ == "__main__":
    if "--compare" in sys.argv[1:]:
        sys.exit(_compare())
    entries = load_roster()
    print(f"Loaded {len(entries)} roster entries")
    for entry in entries:
        print(entry)
