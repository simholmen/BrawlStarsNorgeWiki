"""Load the roster of tracked players.

The roster lives in the Supabase table `ranked_profiles` (supabase/migrations/016_ranked_profiles.sql),
managed by editors on the site under "Ranked-profiler". `load_roster()` reads the active rows.
(Before wiki-migration Phase 2 it came from the front matter of docs/_personer/*.md; those files
are gone, see git history.)

    python -m rankedstats.roster   # print the roster ingest will use
"""


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


if __name__ == "__main__":
    entries = load_roster()
    print(f"Loaded {len(entries)} roster entries")
    for entry in entries:
        print(entry)
