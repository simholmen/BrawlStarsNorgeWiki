  // =========================================================================================
  // === INIT ===
  // =========================================================================================

  // Wrap the map/brawler/teammate sections in the Task 9 collapsible-panel component, ONCE at
  // page load — never rebuilt on a later renderAll(). Each panel reuses the existing
  // #map-content/#brawler-content/#teammate-content div in-place as its bodyEl, so renderAll()'s
  // own `document.getElementById("map-content")` etc. calls (which run on every render) keep
  // working completely unmodified — they just now target a div nested one level deeper, inside
  // the panel's `.panel-body` wrapper. The old static `<h2>` per-section title is dropped from
  // the DOM here (`clearElement` below removes it) since the panel header renders the title
  // itself.
  const mapPanel = makeCollapsiblePanel({
    id: "map-panel",
    title: LABELS.mapSectionTitle,
    tint: "var(--tint-map)",
    rightText: "0 " + LABELS.rowsOverThreshold,
    bodyEl: document.getElementById("map-content"),
  });
  clearElement(document.getElementById("map-section"));
  document.getElementById("map-section").appendChild(mapPanel);

  const brawlerPanel = makeCollapsiblePanel({
    id: "brawler-panel",
    title: LABELS.brawlerSectionTitle,
    tint: "var(--tint-brawler)",
    rightText: "0 " + LABELS.rowsOverThreshold,
    bodyEl: document.getElementById("brawler-content"),
  });
  clearElement(document.getElementById("brawler-section"));
  document.getElementById("brawler-section").appendChild(brawlerPanel);

  const teammatePanel = makeCollapsiblePanel({
    id: "teammate-panel",
    title: LABELS.teammateSectionTitle,
    tint: "var(--tint-mates)",
    rightText: "0 " + LABELS.rowsOverThreshold,
    bodyEl: document.getElementById("teammate-content"),
  });
  clearElement(document.getElementById("teammate-section"));
  document.getElementById("teammate-section").appendChild(teammatePanel);

  // Task 14: same pattern as the 3 panels above, wrapping #recent-section's existing
  // #recent-content div. Unlike the other 3 panels, the recent list has no min-sets "rows over
  // threshold" concept, so rightText starts (and stays) empty — nothing ever writes to
  // `#recent-panel .panel-right-text` afterwards.
  const recentPanel = makeCollapsiblePanel({
    id: "recent-panel",
    title: LABELS.recentSectionTitle,
    tint: "var(--tint-recent)",
    rightText: "",
    bodyEl: document.getElementById("recent-content"),
  });
  clearElement(document.getElementById("recent-section"));
  document.getElementById("recent-section").appendChild(recentPanel);

  // Leaderboard panel (no player selected) — same wrap-in-place pattern as the 4 above, reusing
  // --tint-map since it is never shown simultaneously with the map panel.
  const leaderboardPanel = makeCollapsiblePanel({
    id: "leaderboard-panel",
    title: LABELS.leaderboardSectionTitle,
    tint: "var(--tint-map)",
    rightText: "",
    bodyEl: document.getElementById("leaderboard-content"),
  });
  clearElement(document.getElementById("leaderboard-section"));
  document.getElementById("leaderboard-section").appendChild(leaderboardPanel);

  // Combined recent matches panel (no player selected) — same wrap-in-place pattern as the
  // leaderboard panel above, reusing --tint-recent since it is never shown simultaneously with
  // the per-player recent panel.
  const combinedRecentPanel = makeCollapsiblePanel({
    id: "combined-recent-panel",
    title: LABELS.combinedRecentSectionTitle,
    tint: "var(--tint-recent)",
    rightText: "",
    bodyEl: document.getElementById("combined-recent-content"),
  });
  clearElement(document.getElementById("combined-recent-section"));
  document.getElementById("combined-recent-section").appendChild(combinedRecentPanel);

  // Both sections start `display: none` in the static markup (there's nothing to show until the
  // roster + bulk set-row fetch below resolves) — show them now with skeleton content instead of
  // leaving the page blank for that fetch's duration. loadLeaderboardData's eventual renderAll()
  // replaces both containers' contents and re-derives visibility itself, so this is only ever the
  // pre-first-render state.
  document.getElementById("leaderboard-section").style.display = "";
  document.getElementById("combined-recent-section").style.display = "";
  renderSkeletonTable(
    document.getElementById("leaderboard-content"),
    [LABELS.leaderboardRankColumn, LABELS.playerLabel, LABELS.tableSets, LABELS.tableWins, LABELS.tableLosses, LABELS.tableDraws, LABELS.tableTrend, LABELS.tableWinrate],
    1,
    8
  );
  renderSkeletonRecentList(document.getElementById("combined-recent-content"), 6, true);

  loadPlayers().then(function (trackedPlayers) {
    loadLeaderboardData(trackedPlayers);

    // Restore the player named by ?player=TAG (e.g. after a refresh) without pushing a new
    // history entry — we're already "at" this URL, not navigating to it.
    const initialTag = playerTagFromUrl();
    if (initialTag) {
      suppressUrlPush = true;
      selectPlayer(initialTag);
      suppressUrlPush = false;
    }
  });

