"""Fetch battle logs from the live Brawl Stars API.

Env loading and retry/backoff mirror the approach used in
tournamentfetching/fetch_tournament_stats_once.py (`load_api_key` and
`get_json`) without importing from that folder, so rankedstats/ stays
self-contained.
"""

import json
import os
import time
import urllib.parse
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"
FETCHRESULT_DIR = Path(__file__).resolve().parent / "fetchresult"

BATTLELOG_URL_TEMPLATE = "https://api.brawlstars.com/v1/players/{encoded_tag}/battlelog"
RETRY_STATUS_CODES = {429, 502, 503, 504, 520}


def load_api_key():
    """Load BRAWLSTARS_API_KEY from the environment, falling back to .env.

    The environment variable takes precedence over the .env file. The .env
    file is parsed manually, without any extra dependency: blank lines and
    lines starting with `#` are skipped, each remaining line is split on
    the first `=`, and surrounding quotes are stripped from the value.

    Returns:
        str: the API key, or an empty string if it could not be found.
    """
    env_key = os.environ.get("BRAWLSTARS_API_KEY", "").strip()
    if env_key:
        return env_key

    if not ENV_PATH.exists():
        return ""

    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "BRAWLSTARS_API_KEY":
                return value.strip().strip('"').strip("'")

    return ""


def fetch_battlelog(tag: str) -> list:
    """Fetch a player's battle log from the live Brawl Stars API.

    Args:
        tag: the player tag, including the leading `#` (e.g. "#YQ29980").

    Returns:
        list[dict]: the "items" array from the API response.

    Raises:
        RuntimeError: if no API key is configured, or the API returns 403.
        requests.HTTPError: for any other non-retryable HTTP error.
        requests.RequestException: for network errors that persist through
            all retry attempts.
    """
    api_key = load_api_key()
    if not api_key:
        raise RuntimeError(
            "Missing BRAWLSTARS_API_KEY. Set it in the environment or in "
            f"{ENV_PATH}."
        )

    encoded_tag = urllib.parse.quote(tag, safe="")
    url = BATTLELOG_URL_TEMPLATE.format(encoded_tag=encoded_tag)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }

    attempts = 4
    last_error = None
    response = None

    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, headers=headers, timeout=30)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(2 ** (attempt - 1))
                continue
            raise

        if response.status_code == 200:
            break

        if response.status_code == 403:
            raise RuntimeError(
                "403 from Brawl Stars API — check BRAWLSTARS_API_KEY and "
                "that this machine's IP is allow-listed for the key (keys "
                "are IP-bound)."
            )

        if response.status_code in RETRY_STATUS_CODES and attempt < attempts:
            time.sleep(2 ** (attempt - 1))
            continue

        response.raise_for_status()

    if response is None or response.status_code != 200:
        if last_error:
            raise last_error
        raise RuntimeError("Unknown error while fetching Brawl Stars battlelog")

    payload = response.json()
    items = payload["items"]

    _write_debug_response(tag, payload)

    return items


def _write_debug_response(tag: str, payload: dict):
    """Optionally cache the raw API response for debugging.

    Writes to rankedstats/fetchresult/battlelog_{slug}.json, where slug is
    derived from the tag itself (since fetch_battlelog only receives a
    tag, not a player name). This is this folder's own fetchresult
    directory, never winratefetching/docs/fetchresult/.
    """
    FETCHRESULT_DIR.mkdir(parents=True, exist_ok=True)
    slug = tag.lstrip("#").lower()
    out_path = FETCHRESULT_DIR / f"battlelog_{slug}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    import sys

    tag_arg = sys.argv[1] if len(sys.argv) > 1 else "#YQ29980"
    battles = fetch_battlelog(tag_arg)
    print(f"Fetched {len(battles)} battles for {tag_arg}")
