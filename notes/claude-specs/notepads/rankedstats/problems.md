# uproblems - rankedstats
> Cumulative intelligence for subagents. APPEND ONLY.

## [2026-08-24T00:00:00Z] Task: task-3-roster-bs_api

- BLOCKER (relevant to Task 8, live ingestion): live call to `fetch_battlelog('#YQ29980')` from
  this sandbox returned HTTP 403 `accessDenied.invalidIp` — "API key does not allow access from IP
  178.232.180.174". Brawl Stars API keys are IP-bound (confirmed, not just suspected per plan's
  Open Questions section). The BRAWLSTARS_API_KEY in root `.env` is allow-listed for a DIFFERENT
  IP than this sandbox's current egress IP.
- Implication: Task 8 (first real ingestion run) cannot succeed from this sandbox unless either
  (a) this sandbox's IP is added to the key's allow-list at developer.brawlstars.com, or
  (b) `python3 rankedstats/ingest.py` is run instead from the user's own machine (the one the key
  was originally allow-listed for, presumably where winratefetching/tournamentfetching normally
  run).
- The code path itself (retry/backoff, 403 error message) is verified correct — this is purely an
  external IP allow-list mismatch, not a bug.
