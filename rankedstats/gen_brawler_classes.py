"""Generate docs/rankedstats/brawler_classes.js from the live BrawlAPI brawler list.

This is a maintainer-run, build-time generator — it is never invoked from the
browser at page load. Run it manually whenever Supercell ships new brawlers
(or whenever BrawlAPI backfills a previously-"Unknown" class), and commit the
regenerated `brawler_classes.js` alongside this script:

    python3 rankedstats/gen_brawler_classes.py

It fetches `https://api.brawlapi.com/v1/brawlers` (keyless, no auth header
required — see notes/claude-specs/research/brawl-stars-brawler-class-mapping.md
for the live-verified endpoint shape), builds a `brawler_id -> class name`
mapping, and writes it out as a plain `<script>`-friendly JS file (two global
`const`s, no module syntax) for docs/rankedstats/stats.html to load directly.
The published static site lives entirely under `docs/rankedstats/` (see that
folder's own copy of stats.html/stats.css/images/) — this repo's `rankedstats/`
folder holds only the Supabase ingest pipeline, not a second copy of the page.

Retry/backoff mirrors the style used by `fetch_battlelog` in
rankedstats/bs_api.py (same retryable status-code set, same
`2 ** (attempt - 1)` second backoff, same attempt cap) without importing from
that module, so this script stays self-contained.
"""

import json
import time
from pathlib import Path

import requests

BRAWLERS_URL = "https://api.brawlapi.com/v1/brawlers"
RETRY_STATUS_CODES = {429, 502, 503, 504, 520}
MAX_ATTEMPTS = 4

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "docs" / "rankedstats" / "brawler_classes.js"

UNCLASSIFIED_LABEL = "Unclassified"
BRAWLER_CLASS_ORDER = [
    "Damage Dealer",
    "Marksman",
    "Assassin",
    "Support",
    "Controller",
    "Artillery",
    "Tank",
    UNCLASSIFIED_LABEL,
]

# BrawlAPI still reports `class: "Unknown"` upstream for these brawlers (verified
# 2026-08-25) even though their class is public knowledge — these are the newer
# brawlers a maintainer looked up manually (e.g. via a Brawl Stars class-guide
# article) and hand-entered here so `stats.html`'s by-class grouping doesn't
# dump them all into "Unclassified". Only consulted as a fallback when upstream
# itself has no real class (see `build_class_map`), so once BrawlAPI backfills a
# real class for an id, its own value wins and the override below is simply
# never reached for that id.
MANUAL_CLASS_OVERRIDES = {
    16000089: "Controller",    # Meeple
    16000090: "Tank",          # Ollie
    16000092: "Controller",    # Finx
    16000093: "Support",       # Jae-Yong
    16000094: "Assassin",      # Kaze
    16000095: "Assassin",      # Alli
    16000096: "Tank",          # Trunk
    16000097: "Damage Dealer", # Mina
    16000098: "Controller",    # Ziggy
    16000099: "Marksman",      # Pierce
    16000100: "Assassin",      # Gigi
    16000101: "Support",       # Glowy
    16000102: "Controller",    # Sirius
    16000103: "Damage Dealer", # Najia
    16000104: "Tank",          # Damian
    16000105: "Assassin",      # Starr Nova
    16000106: "Tank",          # Bolt
    16000107: "Assassin",      # Nori
    16000108: "Support",       # Wendy
}


def fetch_brawlers() -> list:
    """Fetch the full brawler list from the live BrawlAPI endpoint.

    Returns:
        list[dict]: one dict per brawler, in BrawlAPI's native shape (each
            entry has at least `id`, `name`, and an optional `class` object
            with a `name` field).

    Raises:
        requests.HTTPError: for a non-retryable HTTP error status.
        requests.RequestException: for network errors that persist through
            all retry attempts.
        RuntimeError: if the response JSON does not have the expected shape.
    """
    last_error = None
    response = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = requests.get(BRAWLERS_URL, timeout=30)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
                continue
            raise

        if response.status_code == 200:
            break

        if response.status_code in RETRY_STATUS_CODES and attempt < MAX_ATTEMPTS:
            time.sleep(2 ** (attempt - 1))
            continue

        response.raise_for_status()

    if response is None or response.status_code != 200:
        if last_error:
            raise last_error
        raise RuntimeError("Unknown error while fetching BrawlAPI brawler list")

    payload = response.json()

    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict) and isinstance(payload.get("list"), list):
        return payload["list"]

    raise RuntimeError(
        "Unexpected BrawlAPI response shape: expected a JSON array or an "
        "object with a 'list' array, got: " + type(payload).__name__
    )


def build_class_map(brawlers: list) -> dict:
    """Build a `brawler_id -> class name` mapping from raw BrawlAPI entries.

    Upstream's own `"Unknown"` class (used for brawlers BrawlAPI hasn't
    tagged yet) and any brawler missing a `class` object entirely first fall
    back to `MANUAL_CLASS_OVERRIDES`, and only normalize to the literal
    string "Unclassified" if there's no override either — so stats.html
    always has a bucket to group untagged brawlers into instead of erroring.

    Args:
        brawlers: the raw list of brawler dicts from `fetch_brawlers()`.

    Returns:
        dict[int, str]: brawler id -> class name (one of the 7 known class
            names, or "Unclassified").
    """
    class_map = {}

    for brawler in brawlers:
        brawler_id = brawler["id"]
        class_info = brawler.get("class")
        class_name = class_info.get("name") if class_info else None

        if not class_name or class_name == "Unknown":
            class_map[brawler_id] = MANUAL_CLASS_OVERRIDES.get(
                brawler_id, UNCLASSIFIED_LABEL
            )
            continue

        class_map[brawler_id] = class_name

    return class_map


def write_output_file(class_map: dict):
    """Write `class_map` out as docs/rankedstats/brawler_classes.js.

    The file is a plain script (not an ES module) so docs/rankedstats/stats.html
    can load it with a bare `<script src="brawler_classes.js"></script>`
    tag, no bundler required. Keys are written as sorted, unquoted numeric
    literals so the file stays deterministic across regenerations.

    Args:
        class_map: the `brawler_id -> class name` mapping from
            `build_class_map()`.
    """
    sorted_ids = sorted(class_map.keys())

    lines = [
        "// GENERATED FILE — do not hand-edit.",
        "// Regenerate with: python3 rankedstats/gen_brawler_classes.py",
        "// Source: https://api.brawlapi.com/v1/brawlers",
        "",
        "const BRAWLER_CLASSES = {",
    ]

    for brawler_id in sorted_ids:
        class_name = class_map[brawler_id]
        lines.append(f"  {brawler_id}: {json.dumps(class_name)},")

    lines.append("};")
    lines.append("")

    class_order_json = json.dumps(BRAWLER_CLASS_ORDER)
    lines.append(f"const BRAWLER_CLASS_ORDER = {class_order_json};")
    lines.append("")

    # Also mirror both consts onto globalThis explicitly. In a real
    # `<script src="brawler_classes.js">` tag this is redundant (top-level
    # `const` in one classic script is already visible as a bare identifier
    # to later script tags in the same document), but the explicit mirror
    # keeps these two names reachable as true globals in any other script
    # host/runtime that wraps or evals this file's contents instead of
    # loading it as a real <script> tag.
    lines.append("globalThis.BRAWLER_CLASSES = BRAWLER_CLASSES;")
    lines.append("globalThis.BRAWLER_CLASS_ORDER = BRAWLER_CLASS_ORDER;")
    lines.append("")

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    fetched_brawlers = fetch_brawlers()
    brawler_class_map = build_class_map(fetched_brawlers)
    write_output_file(brawler_class_map)

    unclassified_count = sum(
        1 for class_name in brawler_class_map.values() if class_name == UNCLASSIFIED_LABEL
    )
    print(
        f"Wrote {OUTPUT_PATH} with {len(brawler_class_map)} brawlers "
        f"({unclassified_count} Unclassified)."
    )
