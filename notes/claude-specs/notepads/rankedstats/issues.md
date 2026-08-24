# uissues - rankedstats
> Cumulative intelligence for subagents. APPEND ONLY.

## [2026-08-24T00:00:00Z] Task: 5 — plan's Verification Strategy table has a stale/mis-scoped number

- **Not a bug in `rankedstats/sets.py`.** `rankedstats/test_sets.py` (Task 5) independently
  re-derived every number in the plan's Verification Strategy table
  (`notes/claude-specs/plans/rankedstats.md` lines 87-100) against the real fixtures and got an
  EXACT match on every row except one: **"Cross-file duplicate battles | 25, all aambakk/cursed"**.
  The true, currently-measured value (soloRanked, `battleTime >= 20260101`, across all 27 fixture
  files) is **15**, not 25. The "all aambakk/cursed" part of the claim is still correct — all 15
  duplicates trace to that one file pair, no others.
- **Root cause**: the plan's "25" was carried over from
  `notes/claude-specs/research/rankedstats-context.md` lines 152-154, which measured "25
  collisions" across the FULL 669-entry corpus (ALL battle types — `ranked` 423, `soloRanked` 209,
  `tournament` 17, `friendly` 14, absent 6 — and ALL dates, per research doc line 101), not the
  186-entry `soloRanked` + `battleTime >= 20260101` scope that the plan's table row is listed under
  in the Verification Strategy section. Under that narrower, ingestion-relevant scope,
  `battlelog_aambakk.json` and `battlelog_cursed.json` each contain EXACTLY 15 `soloRanked` entries
  total (all from one 2026-07-20 session) — 15 is therefore the mathematical ceiling for collisions
  between this file pair in this scope; 25 was never reachable here. This looks like a plan-authoring
  cross-reference slip (a broader-corpus research stat copied into a narrower-scope verification
  table row), not a fixture data-quality problem and not anything wrong with `sets.py`'s
  `dedupe_key`/grouping logic.
- **What I did about it**: `test_sets.py` asserts the TRUE measured value (15) as its PASS condition
  and separately prints a `WARN:` line (not a hard `FAIL:`) spelling out this exact discrepancy, so
  the script still exits `0` (all of the acceptance-criteria's required literal substrings —
  `entries=186`, `groups=126`, `sizes={1: 78, 2: 36, 3: 12}`, `reshuffles=0`,
  `brawler_changes=0/288` — are unaffected and all present/correct) while remaining fully honest
  about the divergence rather than silently asserting a fabricated `25`.
- **Suggested follow-up for the orchestrator**: if the Verification Strategy table in
  `notes/claude-specs/plans/rankedstats.md` is ever revised, correct the "Cross-file duplicate
  battles" row from `25` to `15` (or annotate it as scope-dependent) so future re-runs of this test
  script against a stable/pinned fixture snapshot don't need to re-derive this explanation. No code
  change needed to `rankedstats/sets.py` or `rankedstats/test_sets.py` — this is purely a
  documentation/plan correction.

## [2026-08-24T00:00:00Z] Task: orchestrator-note-task5

- Non-blocking plan documentation discrepancy (already logged by Task 5's own agent): the plan's
  Verification Strategy table row "Cross-file duplicate battles | 25, all aambakk/cursed" does not
  match the actual in-scope (soloRanked, battleTime>=20260101) measured value of 15. Root cause: the
  plan's "25" was carried over from the research doc's finding across the FULL 669-entry corpus (all
  battle types/dates), not the narrower 186-entry table scope. The "all aambakk/cursed" attribution
  is correct; only the count differs. test_sets.py correctly asserts the true measured value (15) and
  prints a WARN rather than forcing a false pass. No action needed — informational only, does not
  affect any task's acceptance criteria (Task 5's actual required literal-substring checks were
  entries=186, groups=126, sizes={1:78,2:36,3:12}, reshuffles=0, brawler_changes=0/288, all of which
  passed independently verified by the orchestrator).

## [2026-08-24T00:00:00Z] Task: 6 — `python3 rankedstats/ingest.py` fails with ModuleNotFoundError

- **Bug**: `python3 rankedstats/ingest.py` (invoked from the repo root as documented) failed with
  `ModuleNotFoundError: No module named 'rankedstats'` because when Python runs a script directly
  via `python3 path/to/script.py`, it puts the script's own directory (here: `rankedstats/`) at
  `sys.path[0]`, not the repo root. This differs from `python3 -c "import rankedstats.ingest"`,
  which implicitly puts the CWD (repo root) on the path — that's why `-c`-based checks passed.
- **Root cause**: absolute imports like `from rankedstats import supa` try to find a package named
  `rankedstats` inside the directory that's at `sys.path[0]`. When `sys.path[0]` is the `rankedstats/`
  script directory itself, Python can't find a nested `rankedstats/` package inside it, so the import
  fails.
- **Fix applied**: mirror the pattern from `rankedstats/test_sets.py` (lines 33-49): insert the
  repo root into `sys.path[0]` BEFORE the rankedstats imports occur. Specifically, after stdlib
  imports, compute `REPO_ROOT = Path(__file__).resolve().parent.parent`, call
  `sys.path.insert(0, str(REPO_ROOT))`, then add `# noqa: E402` comments on all post-insert
  `from rankedstats` lines.
- **Verification**: `python3 rankedstats/ingest.py` now passes import validation and reaches the
  main logic (fails later on the expected, separate Brawl Stars API 403 IP-allowlist issue, not on
  import). Regression check `python3 -c "import rankedstats.ingest"` still passes.
- **Future entrypoints**: any other `.py` file in `rankedstats/` that serves as a direct script
  entrypoint (invoked as `python3 rankedstats/newscript.py` from the repo root) must apply this
  same `sys.path.insert(0, REPO_ROOT)` pattern before attempting `from rankedstats` imports.
