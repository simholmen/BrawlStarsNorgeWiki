# Decisions - Ranked Stats Redesign
> Cumulative intelligence for subagents. APPEND ONLY.

## [2026-08-25T00:00:00Z] Orchestrator: execution-order deviation from plan's wave parallelism

- Decided: `rankedstats/stats.html` is a single, tightly-coupled, hand-rolled page with **no test
  runner and no headless browser** to catch a botched concurrent merge. The plan's Waves 2-5 tag
  several tasks as safely parallel, but in practice almost every task after Task 1 edits the same
  `<script>` block or the same `<body>` structure.
- Decision: run Task 1 and Task 3 in true parallel (fully disjoint files: stats.html/stats.css vs.
  a brand-new migrations/007 file). Every subsequent task (2,4,5,6,7,8,9,10,11,12,13,14,15) is
  executed **sequentially**, one Agent() call at a time, in this dependency-respecting order:
  1, 3 (parallel) -> 4 -> 12 -> 2 -> 5 -> 9 -> 6 -> 7 -> 11 -> 8 -> 13 -> 10 -> 14 -> 15.
- Why this order: satisfies every edge in the plan's Dependency Matrix while keeping each step a
  pure textual addition to the previous step's output — no simultaneous edits to the same file
  region. Verification checkpoints happen at logical boundaries: after {1,3}; after {4,12,2,5};
  after {9,6,7,11}; after {8,13,10}; after {14,15}.
- Each task's delegation prompt will include the current file's exact state summary and remind the
  agent to re-Read stats.html/stats.css fresh before editing (do not trust stale line numbers from
  the plan text once earlier tasks have landed).
