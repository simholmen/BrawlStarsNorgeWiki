"""Thin PostgREST wrapper for the Supabase project backing Ranked Stats.

Env loading mirrors the approach used in rankedstats/bs_api.py's `load_api_key`: the
environment variable takes precedence, falling back to a manual line-by-line parse of the
repo root `.env`, with no extra env-file-parsing dependency added. Both `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` are read lazily, inside functions, never at import time, so that
`import rankedstats.supa` succeeds even before a Supabase project has been provisioned.

Only `requests` is used for HTTP -- no `supabase-py` client library.
"""

import os
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"


def _read_env_file_value(key: str) -> str:
    """Manually parse REPO_ROOT/.env for a single key, mirroring bs_api.py's load_api_key.

    Blank lines and lines starting with `#` are skipped, each remaining line is split on
    the first `=`, and surrounding quotes are stripped from the value. Returns an empty
    string if the file or the key is not found.
    """

    if not ENV_PATH.exists():
        return ""

    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            file_key, value = line.split("=", 1)
            if file_key.strip() == key:
                return value.strip().strip('"').strip("'")

    return ""


def get_config() -> dict:
    """Resolve SUPABASE_URL and SUPABASE_SECRET_KEY, environment taking precedence over `.env`.

    Returns:
        dict: {"url": str, "secret_key": str}. Either value may be an empty string if not
        configured; callers that actually need to talk to Supabase should check for that
        and raise a clear error at call time, not at import time.
    """

    url = os.environ.get("SUPABASE_URL", "").strip()
    if not url:
        url = _read_env_file_value("SUPABASE_URL")

    secret_key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not secret_key:
        secret_key = _read_env_file_value("SUPABASE_SECRET_KEY")

    return {"url": url, "secret_key": secret_key}


def _require_config() -> dict:
    """Like get_config(), but raises a clear error if either value is missing.

    Called from inside upsert/select/patch (not at import time), so importing this module
    never requires Supabase credentials to be present.
    """

    config = get_config()
    if not config["url"] or not config["secret_key"]:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Set them in the environment or "
            f"in {ENV_PATH}."
        )
    return config


def _table_url(base_url: str, table: str) -> str:
    """Build the PostgREST endpoint URL for a given table."""

    return f"{base_url}/rest/v1/{table}"


def _headers(secret_key: str, extra: dict = None) -> dict:
    """Build the standard PostgREST auth headers, optionally merged with extra headers."""

    headers = {
        "apikey": secret_key,
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _raise_with_body(response: requests.Response):
    """Call raise_for_status(), but first print the response body if it's an error.

    PostgREST error bodies are informative (they typically contain a `message`/`details`/
    `hint` JSON object explaining exactly what constraint or column caused the failure), so
    swallowing them makes debugging much harder. This prints the body before re-raising.
    """

    if response.status_code >= 400:
        print(f"PostgREST error {response.status_code}: {response.text}")
    response.raise_for_status()


def upsert(table: str, rows: list, on_conflict: str, ignore_duplicates: bool = False) -> list:
    """Upsert (insert-or-merge) rows into a PostgREST table.

    Args:
        table: table name, e.g. "players".
        rows: list of dicts, each shaped as a row for `table`.
        on_conflict: comma-separated column name(s) identifying the unique constraint to
            upsert against, e.g. "tag" or "set_id,player_tag".
        ignore_duplicates: if True, uses `resolution=ignore-duplicates` (a conflicting row
            is left untouched -- used for the append-only `battles` insert, the true
            idempotency guard against double-counting). If False (default), uses
            `resolution=merge-duplicates` (a conflicting row has its payload columns
            merged in -- used everywhere else, e.g. refreshing `players.name`/`updated_at`).

    Returns:
        list[dict]: the rows as returned by PostgREST (`return=representation`).
    """

    config = _require_config()
    resolution = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"

    url = _table_url(config["url"], table)
    headers = _headers(
        config["secret_key"],
        extra={"Prefer": f"return=representation,resolution={resolution}"},
    )
    params = {"on_conflict": on_conflict}

    response = requests.post(url, headers=headers, params=params, json=rows, timeout=30)
    _raise_with_body(response)

    return response.json()


def select(table: str, params: dict) -> list:
    """Run a PostgREST GET (select) query against a table.

    Args:
        table: table name, e.g. "battles".
        params: query string parameters exactly as PostgREST expects them, e.g.
            {"select": "*", "dedupe_key": "in.(abc,def)"}.

    Returns:
        list[dict]: the matching rows.
    """

    config = _require_config()

    url = _table_url(config["url"], table)
    headers = _headers(config["secret_key"])

    response = requests.get(url, headers=headers, params=params, timeout=30)
    _raise_with_body(response)

    return response.json()


def patch(table: str, filters: dict, payload: dict) -> list:
    """Run a PostgREST PATCH (update) against rows matching `filters`.

    Args:
        table: table name, e.g. "ranked_sets".
        filters: query string parameters selecting which rows to update, e.g.
            {"id": "eq.<uuid>"}.
        payload: JSON body with the columns to update.

    Returns:
        list[dict]: the updated rows as returned by PostgREST (`return=representation`).
    """

    config = _require_config()

    url = _table_url(config["url"], table)
    headers = _headers(config["secret_key"], extra={"Prefer": "return=representation"})

    response = requests.patch(url, headers=headers, params=filters, json=payload, timeout=30)
    _raise_with_body(response)

    return response.json()
