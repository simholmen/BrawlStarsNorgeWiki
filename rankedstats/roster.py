"""Load the roster of tracked players from docs/_personer/*.md front matter.

Mirrors the front-matter parsing approach used in
winratefetching/extract_names_and_tags.py (find the `---` fence pair, then
yaml.safe_load the block between the fences) without importing from that
folder, so rankedstats/ stays self-contained.
"""

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


def load_roster():
    """Build the roster of tracked players from docs/_personer/*.md.

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
        slug = str(name).strip().lower().replace(" ", "_")

        roster.append({
            "tag": tag,
            "name": str(name).strip(),
            "slug": slug,
        })

    return roster


if __name__ == "__main__":
    entries = load_roster()
    print(f"Loaded {len(entries)} roster entries")
    for entry in entries:
        print(entry)
