  // =========================================================================================
  // === DATA LAYER ===
  // === Single fetch per player selection: `loadPlayerData` issues exactly 3 PostgREST requests,
  // === one per row-level view added in 007_redesign_views.sql, and stores the raw, unaggregated
  // === rows in STATE. Every filter change (mode/period/min-sets/brawler/class) is handled
  // === entirely client-side by `applyFilters` + `aggregate`, then re-rendered by `renderAll` —
  // === no further network requests are ever issued after the initial 3.
  // =========================================================================================

  let STATE = {
    tag: null,
    setRows: [],
    mateRows: [],
    rankHistory: [],
    // Live, periodic (~30 min) snapshots of the player's Ranked season/rank/elo, straight
    // from the player-profile API endpoint — a continuous elo number, unlike rankHistory's
    // coarse 1-22 tier value derived per completed set. Preferred over rankHistory for the
    // hero badge/chart whenever at least 1 (badge) or 2 (chart) rows exist; renderHero/
    // renderEloChart fall back to rankHistory/renderRankChart otherwise (e.g. a player with
    // no snapshots yet).
    rankSnapshots: [],
    filter: { kind: null, value: null },
    // Independent of `filter` (brawler/class) — an array of tier_names ("Pro"/"Masters"/
    // "Legendary"/"Mythic"/"Diamond"), any number of which can be active at once (an empty array
    // means no rank filter). Kept separate rather than folded into `filter.kind` because the two
    // are meant to combine (e.g. a brawler AND one or more ranks at once), not act as mutually-
    // exclusive alternatives the way "brawler" vs "class" do.
    rankFilter: [],
    mode: "All modes",
    period: "This season",
    // Only read when period === "Custom" (see periodCutoffDate/periodUpperBoundDate below) — a
    // plain "YYYY-MM-DD" string straight from the date input's own `.value`, or null when that
    // side of the range hasn't been picked yet (an open-ended custom range on that end).
    customFrom: null,
    customTo: null,
    minSets: 3,
    collapsed: {},
    // Keyed by class name (a BRAWLER_CLASS_ORDER entry). `true` means that class's row in the
    // sidebar tree is currently expanded (child brawler rows visible); `false` or absent (the
    // default) means collapsed. Never read/written by applyFilters/aggregate — only by
    // renderBrawlerTree() in the SIDEBAR FILTERS section below.
    expandedClasses: {},

    // --- leaderboard (no player selected) --- bulk fetch across every tracked player, loaded
    // once at init; rosterByTag maps tag -> display name for the leaderboard's aggregate()
    // labelFn; rosterIconByTag maps tag -> profile icon id (null if unknown), read by
    // buildRowIconCell via profileIconUrl(); leaderboardPage is 1-indexed;
    // leaderboardFilterSignature/leaderboardExcludedCount are internal bookkeeping for
    // renderLeaderboard()/updateMinSetsHint().
    allSetRows: [],
    // Every set PARTICIPANT (teammates + opponents included, tracked or not) across every set our
    // tracked roster played — the same v_player_set_rows view as allSetRows, just fetched without
    // the `.in("player_tag", trackedTags)` restriction (see loadLeaderboardData, stats-
    // leaderboard.js). Only consumed by the Statistikk/Kart map-expansion breakdown
    // (buildMapExpandBrawlerRows, stats-tables.js), scoped down to one map's own set_ids at read
    // time — never re-aggregated wholesale the way allSetRows is.
    allParticipantRows: [],
    // The default view (Felles leaderboard, "Denne sesongen") only ever needs the CURRENT
    // season's rows, so loadLeaderboardData's initial fetch scopes allSetRows/allParticipantRows
    // down to whichever ranked_season_id this comes back as — keeping first paint fast and roughly
    // constant-time as more seasons pile up in the DB, instead of growing with the site's entire
    // history forever. null until that first lightweight lookup resolves. See ensureFullHistoryLoaded
    // (stats-leaderboard.js) for how/when the two arrays above get upgraded to every row ever
    // recorded (needed by any period other than "This season").
    currentSeasonId: null,
    // false until ensureFullHistoryLoaded's fetch has completed and allSetRows/allParticipantRows
    // hold every row (not just the current season's) — read by renderPeriodChips' click handler
    // (stats-sidebar-filters.js) to decide whether selecting a non-"This season" period needs to
    // await that fetch first.
    fullHistoryLoaded: false,
    rosterByTag: new Map(),
    rosterIconByTag: new Map(),
    leaderboardPage: 1,
    leaderboardFilterSignature: null,
    leaderboardExcludedCount: 0,
    leaderboardLoadError: null,
    // column: one of "label"/"sets"/"wins"/"losses"/"draws"/"winrate", or null for the default
    // ranking (winrate desc, sets desc tiebreak) computeLeaderboardRows() already applies.
    leaderboardSort: { column: null, direction: null },

    // --- combined recent matches (no player selected) --- same STATE.allSetRows bulk fetch as
    // the leaderboard table, just flattened to individual sets instead of grouped per player;
    // combinedRecentPage is 1-indexed, combinedRecentFilterSignature is the same
    // "reset page to 1 when filters change" bookkeeping pattern as leaderboardFilterSignature.
    combinedRecentPage: 1,
    combinedRecentFilterSignature: null,

    // --- browsing view (no player selected) — "leaderboard" (default) or "maps", toggled by the
    // --- two icon buttons in the hero (#view-btn-leaderboard/#view-btn-maps, stats-leaderboard.js)
    // --- and read by setMainSectionsVisible/renderHeroEmptyState below and
    // --- updateFilterVisibilityForView (stats-sidebar-filters.js). Meaningless while a player is
    // --- selected (STATE.tag !== null), same as the other "no player selected" fields above.
    browseView: "leaderboard",
  };

  // === "This season" period cutoff — the current season is whichever ranked_season_id is the
  // === highest ever observed across the whole roster's SETS (STATE.allSetRows, from
  // === v_player_set_rows.ranked_season_id — stamped by ingest.py on every set going forward,
  // === backfilled for older ones by migrations/010_ranked_season_id.sql), and its start is the
  // === earliest started_at any tracked player has a set for in that season, subject to the
  // === cluster check below. This is necessarily a global (not per-player) boundary: a player who
  // === hasn't queued Ranked yet this season has no set row for it at all, so their own data alone
  // === can't date the season's start.
  // ===
  // === Deliberately NOT derived from player_rank_snapshots.fetched_at (the earlier approach):
  // === that table only records whatever season is CURRENT at each ~30-min poll, so its
  // === earliest row for the current season is just "whenever ingestion happened to first poll
  // === during it" — for a season that had already been running a while before snapshot
  // === collection started, that date is long after the season's real start, which under-counts
  // === "This season" results (a season underway when polling began looked like it had just
  // === started). ranked_season_id on the sets themselves has no such lag.
  // ===
  // === CLUSTERING: a real rollover stamps a burst of sets across many tracked players within a
  // === short window as they queue up in the new season. But insert_new_ranked_set (ingest.py)
  // === stamps a set with the CURRENT season on the player's profile at the moment it's first
  // === INSERTED — so a set that's ingested late (e.g. after a tracking gap for that player) can
  // === get stamped with the new season id despite having actually been played days earlier, in
  // === the old season. One such straggler, sorted first by started_at, would otherwise drag the
  // === whole boundary back to its own (wrong) date — this happened for real: a single Silver set
  // === for one player landed 5 days before every other season-49 row and pulled "This season" in
  // === by 5 days for everyone. So the earliest started_at only counts as the season start if it's
  // === followed by at least CLUSTER_MIN_SIZE - 1 more of that season's sets within
  // === CLUSTER_WINDOW_MS — an isolated earlier row is skipped as noise instead.
  // ===
  // === Returns null when no set has a season id yet (chip then behaves like "All time"). ===
  const SEASON_CLUSTER_WINDOW_MS = 6 * 60 * 60 * 1000;
  const SEASON_CLUSTER_MIN_SIZE = 3;

  function currentSeasonStartDate() {
    let currentSeasonId = null;
    STATE.allSetRows.forEach(function (row) {
      if (row.ranked_season_id !== null && row.ranked_season_id !== undefined) {
        if (currentSeasonId === null || row.ranked_season_id > currentSeasonId) {
          currentSeasonId = row.ranked_season_id;
        }
      }
    });

    if (currentSeasonId === null) {
      return null;
    }

    const startTimes = STATE.allSetRows
      .filter(function (row) {
        return row.ranked_season_id === currentSeasonId;
      })
      .map(function (row) {
        return new Date(row.started_at);
      })
      .sort(function (a, b) {
        return a - b;
      });

    for (let i = 0; i < startTimes.length; i++) {
      const windowEnd = startTimes[i].getTime() + SEASON_CLUSTER_WINDOW_MS;
      let clusterSize = 1;
      for (let j = i + 1; j < startTimes.length && startTimes[j].getTime() <= windowEnd; j++) {
        clusterSize++;
      }
      if (clusterSize >= SEASON_CLUSTER_MIN_SIZE) {
        return startTimes[i];
      }
    }

    // Every row for this season is isolated (e.g. a brand new season with only a couple of sets
    // recorded so far) — fall back to the plain earliest rather than returning null.
    return startTimes[0];
  }

  // === Shared by applyFilters/filterRankHistoryByPeriod/filterRankSnapshotsByPeriod/
  // === filterByModeAndPeriod below — resolves STATE.period to a cutoff Date (rows older than
  // === this are dropped), or null for "All time"/an as-yet-undated "This season"/a "Custom"
  // === range with no "from" date picked yet. ===
  function periodCutoffDate() {
    if (STATE.period === "All time") {
      return null;
    }
    if (STATE.period === "This season") {
      return currentSeasonStartDate();
    }
    if (STATE.period === "Custom") {
      return STATE.customFrom ? new Date(STATE.customFrom) : null;
    }
    const daysBack = STATE.period === "Last 7 days" ? 7 : 30;
    return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  }

  // === Sibling to periodCutoffDate() above, called alongside it at every one of that function's
  // === own call sites — every period EXCEPT "Custom" is open-ended going forward (there's no
  // === reason to ever exclude a set for being too RECENT), so this only ever returns non-null
  // === once a "Custom" "to" date is picked. Returns the START of the day AFTER STATE.customTo
  // === (an exclusive upper bound: callers filter `< this`) so the "to" date's own calendar day is
  // === fully included regardless of what time within it a set actually ended. ===
  function periodUpperBoundDate() {
    if (STATE.period !== "Custom" || !STATE.customTo) {
      return null;
    }
    const upperBound = new Date(STATE.customTo);
    upperBound.setDate(upperBound.getDate() + 1);
    return upperBound;
  }

  async function loadPlayerData(tag) {
    const mapContainer = document.getElementById("map-content");
    const brawlerContainer = document.getElementById("brawler-content");
    const teammateContainer = document.getElementById("teammate-content");
    const recentContainer = document.getElementById("recent-content");
    const allContainers = [
      mapContainer,
      brawlerContainer,
      teammateContainer,
      recentContainer,
    ];

    renderSkeletonTable(
      mapContainer,
      [LABELS.tableMap, LABELS.tableSets, LABELS.tableWins, LABELS.tableLosses, LABELS.tableDraws, LABELS.tableTrend, LABELS.tableWinrate],
      0,
      6
    );
    renderSkeletonTable(
      brawlerContainer,
      [LABELS.tableBrawler, LABELS.tableSets, LABELS.tableWins, LABELS.tableLosses, LABELS.tableDraws, LABELS.tableTrend, LABELS.tableWinrate],
      0,
      6
    );
    renderSkeletonTable(
      teammateContainer,
      [LABELS.tableTeammate, LABELS.tableTag, LABELS.tableSetsTogether, LABELS.tableWins, LABELS.tableTrend, LABELS.tableWinrate],
      0,
      6
    );
    renderSkeletonRecentList(recentContainer, 6, false);
    clearElement(document.getElementById("match-detail-content"));

    // Paginated via fetchAllRows (stats-leaderboard.js), not plain requests — these were left as
    // single requests under the assumption that a single tracked player's own rows would stay
    // comfortably under PostgREST's 1000-row page cap, but a heavily-played player breaks that:
    // confirmed for real against this project, one player had 1652 v_player_teammate_rows (each
    // set contributes one row per teammate, so this fills up roughly 2x as fast as set rows do).
    // The plain fetch silently truncated at row 1000 in default (non-deterministic) order, which
    // for that player happened to land entirely on older sets — so their Teammates panel came up
    // completely empty under "This season" despite having played plenty of sets with teammates
    // recently; every row that mattered had been dropped before it ever reached the browser.
    // Each query below sorts by whatever column(s) uniquely identify its rows for this one
    // player_tag, so paginated .range() calls can't return duplicate or skipped rows (see
    // fetchAllRows' own comment for why an unordered paginated fetch is unsafe).
    const [setRowsResult, mateRowsResult, rankHistoryResult, rankSnapshotsResult] =
      await Promise.all([
        fetchAllRows(function () {
          return sb
            .from("v_player_set_rows")
            .select("*")
            .eq("player_tag", tag)
            .order("set_id", { ascending: true });
        }),
        fetchAllRows(function () {
          return sb
            .from("v_player_teammate_rows")
            .select("*")
            .eq("player_tag", tag)
            .order("set_id", { ascending: true })
            .order("teammate_tag", { ascending: true });
        }),
        // v_player_rank_history exposes no set_id (007_redesign_views.sql), so ended_at is the
        // best available deterministic-enough key — two of one player's own sets sharing the same
        // ended_at is not a real-world concern.
        fetchAllRows(function () {
          return sb
            .from("v_player_rank_history")
            .select("*")
            .eq("player_tag", tag)
            .order("ended_at", { ascending: true });
        }),
        // player_rank_snapshots' primary key is (player_tag, fetched_at) — 009_player_rank_snapshots.sql.
        fetchAllRows(function () {
          return sb
            .from("v_player_rank_snapshots")
            .select("*")
            .eq("player_tag", tag)
            .order("fetched_at", { ascending: true });
        }),
      ]);

    const firstError =
      setRowsResult.error ||
      mateRowsResult.error ||
      rankHistoryResult.error ||
      rankSnapshotsResult.error;
    if (firstError) {
      allContainers.forEach(function (container) {
        setStatus(container, "error", LABELS.errorPrefix + firstError.message);
      });
      return;
    }

    const setRows = setRowsResult.data || [];
    const mateRows = mateRowsResult.data || [];
    const rankHistory = rankHistoryResult.data || [];
    const rankSnapshots = rankSnapshotsResult.data || [];

    if (
      setRows.length === 0 &&
      mateRows.length === 0 &&
      rankHistory.length === 0 &&
      rankSnapshots.length === 0
    ) {
      allContainers.forEach(function (container) {
        setStatus(container, "empty", LABELS.noSetsRecorded);
      });
      return;
    }

    STATE.tag = tag;
    STATE.setRows = setRows;
    STATE.mateRows = mateRows;
    STATE.rankHistory = rankHistory;
    STATE.rankSnapshots = rankSnapshots;

    renderAll();
  }

  function applyFilters(rows) {
    let filteredRows = rows;

    const cutoffDate = periodCutoffDate();
    if (cutoffDate !== null) {
      filteredRows = filteredRows.filter(function (row) {
        return new Date(row.ended_at) >= cutoffDate;
      });
    }
    const upperBoundDate = periodUpperBoundDate();
    if (upperBoundDate !== null) {
      filteredRows = filteredRows.filter(function (row) {
        return new Date(row.ended_at) < upperBoundDate;
      });
    }

    if (STATE.mode !== "All modes") {
      filteredRows = filteredRows.filter(function (row) {
        return row.mode === STATE.mode;
      });
    }

    if (STATE.filter.kind === "brawler") {
      filteredRows = filteredRows.filter(function (row) {
        return row.brawler_id === STATE.filter.value;
      });
    } else if (STATE.filter.kind === "class") {
      filteredRows = filteredRows.filter(function (row) {
        const brawlerClass = BRAWLER_CLASSES[row.brawler_id] || "Unclassified";
        return brawlerClass === STATE.filter.value;
      });
    }

    if (STATE.rankFilter.length > 0) {
      filteredRows = filteredRows.filter(function (row) {
        return STATE.rankFilter.includes(row.tier_name);
      });
    }

    return filteredRows;
  }

  function aggregate(rows, keyFn, labelFn) {
    const groupsByKey = new Map();

    rows.forEach(function (row) {
      const key = keyFn(row);
      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, []);
      }
      groupsByKey.get(key).push(row);
    });

    const aggregatedRows = [];

    groupsByKey.forEach(function (groupRows, key) {
      const sortedGroupRows = groupRows.slice().sort(function (rowA, rowB) {
        return new Date(rowA.ended_at) - new Date(rowB.ended_at);
      });

      let wins = 0;
      let losses = 0;
      let draws = 0;
      sortedGroupRows.forEach(function (row) {
        if (row.result === "win") {
          wins++;
        } else if (row.result === "loss") {
          losses++;
        } else if (row.result === "draw") {
          draws++;
        }
      });

      const winrate = wins + losses === 0 ? null : wins / (wins + losses);

      aggregatedRows.push({
        key: key,
        label: labelFn(sortedGroupRows[0]),
        sub: undefined,
        sets: sortedGroupRows.length,
        wins: wins,
        losses: losses,
        draws: draws,
        winrate: winrate,
        rows: sortedGroupRows,
      });
    });

    return aggregatedRows;
  }

  // === Map preview data (top brawlers by winrate on one map) — takes the exact `rows` array a
  // === map table row is already showing (its `group.rows`/aggregate() output — see the
  // === renderMapTable/renderCallouts bridge in renderAll() below and computeGlobalMapRows()
  // === above the leaderboard section) and re-aggregates it by brawler instead of re-deriving its
  // === own filtered set from scratch. This is what makes the SAME modal correctly "personal" when
  // === opened from the per-player Map table (rows already scoped to that one player) and
  // === "everyone" when opened from the Felles Map table (rows already scoped to every tracked
  // === player) — the modal itself has no scope logic of its own, it just trusts its caller.
  // === Groups below STATE.minSets (the same sidebar slider that gates every other table on this
  // === page) are excluded before ranking, same "excluded from consideration" instinct as
  // === computeLeaderboardRows() below. ===
  function computeTopBrawlerWinrates(rows) {
    const brawlerGroups = aggregate(
      rows,
      function (row) { return row.brawler_id; },
      function (row) { return row.brawler_name || String(row.brawler_id); }
    );

    const qualifyingGroups = brawlerGroups.filter(function (group) {
      return group.sets >= STATE.minSets && group.winrate !== null;
    });

    qualifyingGroups.sort(function (groupA, groupB) {
      if (groupB.winrate !== groupA.winrate) {
        return groupB.winrate - groupA.winrate;
      }
      return groupB.sets - groupA.sets;
    });

    return { topGroups: qualifyingGroups.slice(0, 5), totalSets: rows.length };
  }

  // === Global map rows (no player selected) — the Felles-page counterpart of renderAll()'s own
  // === per-player mapRows bridge just below, grouping STATE.allSetRows (every tracked player)
  // === by mode+map instead of the one selected player's STATE.setRows. Produces the exact same
  // === shape (mode/map/sets_played/wins/losses/draws/winrate/rows) renderMapTable already
  // === expects, so the Felles Map section (stats-leaderboard.js) can hand its output straight to
  // === that same renderer with no per-caller special-casing. Rows below STATE.minSets are
  // === excluded, same "excluded from consideration" instinct as computeLeaderboardRows(). ===
  function computeGlobalMapRows() {
    const filteredRows = applyFilters(STATE.allSetRows);
    const mapGroups = aggregate(
      filteredRows,
      function (row) { return row.mode + "||" + row.map; },
      function (row) { return row.map; }
    );
    const mapRows = mapGroups.map(function (group) {
      return {
        mode: group.rows[0].mode,
        map: group.label,
        sets_played: group.sets,
        wins: group.wins,
        losses: group.losses,
        draws: group.draws,
        winrate: group.winrate,
        rows: group.rows,
      };
    });

    const qualifyingRows = mapRows.filter(function (row) {
      return row.sets_played >= STATE.minSets;
    });
    qualifyingRows.sort(function (rowA, rowB) {
      return rowB.sets_played - rowA.sets_played;
    });

    return qualifyingRows;
  }

  // === Global brawler rows (no player selected, Statistikk/Kart view) — same shape/scope as
  // === computeGlobalMapRows just above, grouping STATE.allSetRows by brawler_id instead of
  // === mode+map. Deliberately still scoped to our tracked roster's own picks (not every set
  // === participant) — this is the top-level "Brawler" list a row's own click then expands into a
  // === matchup breakdown that DOES pull in every participant (buildBrawlerExpandOpponentRows,
  // === stats-tables.js), same map-list-vs-map-breakdown split computeGlobalMapRows/
  // === buildMapExpandBrawlerRows already use. ===
  function computeGlobalBrawlerRows() {
    const filteredRows = applyFilters(STATE.allSetRows);
    const brawlerGroups = aggregate(
      filteredRows,
      function (row) { return row.brawler_id; },
      function (row) { return row.brawler_name || String(row.brawler_id); }
    );
    const brawlerRows = brawlerGroups.map(function (group) {
      return {
        brawler_id: group.key,
        brawler_name: group.label,
        sets_played: group.sets,
        wins: group.wins,
        losses: group.losses,
        draws: group.draws,
        winrate: group.winrate,
        rows: group.rows,
      };
    });

    const qualifyingRows = brawlerRows.filter(function (row) {
      return row.sets_played >= STATE.minSets;
    });
    qualifyingRows.sort(function (rowA, rowB) {
      return rowB.sets_played - rowA.sets_played;
    });

    return qualifyingRows;
  }

  // === Leaderboard aggregation (no player selected) — reuses applyFilters/aggregate completely
  // === unmodified, grouping by player_tag instead of map/brawler/teammate. Groups below
  // === STATE.minSets are excluded from the ranked list entirely (not just badge-flagged), same
  // === "excluded from consideration" instinct as renderCallouts' best/worst-map gate. ===
  function computeLeaderboardRows() {
    const filteredRows = applyFilters(STATE.allSetRows);
    const playerGroups = aggregate(
      filteredRows,
      function (row) { return row.player_tag; },
      function (row) { return STATE.rosterByTag.get(row.player_tag) || row.player_tag; }
    );

    const qualifyingRows = playerGroups.filter(function (group) {
      return group.sets >= STATE.minSets;
    });
    const excludedCount = playerGroups.length - qualifyingRows.length;

    qualifyingRows.sort(function (rowA, rowB) {
      const winrateA = rowA.winrate === null ? -1 : rowA.winrate;
      const winrateB = rowB.winrate === null ? -1 : rowB.winrate;
      if (winrateB !== winrateA) {
        return winrateB - winrateA;
      }
      return rowB.sets - rowA.sets;
    });

    return { rankedRows: qualifyingRows, excludedCount: excludedCount };
  }

  // =========================================================================================
  // === Field-shaping bridge — Task 10 confirmed the map/brawler/teammate row shapes below are
  // === exactly what `renderMapTable`/`renderBrawlerTable`/`renderTeammateTable` need, so this
  // === mapping from aggregate() output stays (it is not dead code to remove); only the renderers
  // === themselves were rewritten to consume it differently. Task 14 still owns rewriting the
  // === recent-matches renderer and its own bridge block below.
  // =========================================================================================

  // === Resets the hero back to its initial "no player selected" placeholder state. Fixes a
  // === pre-existing bug where deselecting a player left the previous player's KPIs/form/chart
  // === stale on screen (renderAll() was never called on deselect before this dispatch branch). ===
  function renderHeroEmptyState() {
    const isMapsView = STATE.browseView === "maps";
    document.getElementById("hero-player-name").textContent =
      isMapsView ? LABELS.mapsHeroTitle : LABELS.leaderboardHeroTitle;
    document.getElementById("hero-subline").textContent =
      isMapsView ? LABELS.mapsHeroSubtitle : LABELS.leaderboardHeroSubtitle;
    document.getElementById("hero-contact-hint").textContent = LABELS.leaderboardHeroContactHint;
    document.getElementById("hero-rank-badge").classList.add("hero-rank-badge--bare");
    const playerIcon = document.getElementById("hero-player-icon");
    playerIcon.src = "../images/bsnorge.jpg";
    playerIcon.alt = LABELS.leaderboardLogoAlt;
    const rankIcon = document.getElementById("hero-rank-icon");
    rankIcon.removeAttribute("src");
    rankIcon.alt = "";
    clearElement(document.getElementById("hero-rank-chart"));
    clearElement(document.getElementById("hero-kpis"));
    clearElement(document.getElementById("hero-form"));

    document.getElementById("hero-view-switcher").style.display = "";
    document.getElementById("view-btn-leaderboard").classList.toggle("active", !isMapsView);
    document.getElementById("view-btn-maps").classList.toggle("active", isMapsView);
  }

  // === Toggles between the browsing sections (no player selected — either the Leaderboard view
  // === or the Kart/Maps view, per STATE.browseView) and the 4 per-player sections + callouts.
  // === Called from renderAll() on every render. ===
  function setMainSectionsVisible(showBrowsing) {
    const showLeaderboardView = showBrowsing && STATE.browseView !== "maps";
    const showMapsView = showBrowsing && STATE.browseView === "maps";
    document.getElementById("leaderboard-section").style.display = showLeaderboardView ? "" : "none";
    document.getElementById("combined-recent-section").style.display = showLeaderboardView ? "" : "none";
    document.getElementById("global-map-section").style.display = showMapsView ? "" : "none";
    document.getElementById("global-brawler-section").style.display = showMapsView ? "" : "none";
    ["map-callouts", "map-section", "brawler-section", "teammate-section", "recent-section"].forEach(
      function (id) {
        document.getElementById(id).style.display = showBrowsing ? "none" : "";
      }
    );
    if (showBrowsing) {
      clearElement(document.getElementById("map-callouts"));
    }
  }

  function renderAll() {
    renderBrawlerTree();
    renderRankTree();
    renderModeChips();
    renderPeriodChips();
    renderFilterBar();
    updateFilterVisibilityForView();

    setMainSectionsVisible(STATE.tag === null);
    if (STATE.tag === null) {
      renderHeroEmptyState();

      // allSetRows/allParticipantRows start out scoped to just the current season
      // (loadLeaderboardData, stats-leaderboard.js) — fine for the default "Denne sesongen" view,
      // but any OTHER period can reach back further than that. Rather than rendering these
      // sections against data that's silently missing everything before the season started (an
      // undercount with no visual indication anything's wrong), show skeletons and kick off the
      // full-history upgrade; ensureFullHistoryLoaded's own renderAll() call re-enters this
      // function once it resolves, at which point STATE.fullHistoryLoaded is true and this branch
      // is skipped.
      if (STATE.period !== "This season" && !STATE.fullHistoryLoaded) {
        renderBrowsingSkeletons();
        ensureFullHistoryLoaded();
        return;
      }

      renderLeaderboard();
      renderGlobalMapTable();
      renderGlobalBrawlerTable();
      renderCombinedRecent();
      updateMinSetsHint();
      return;
    }

    renderHero(STATE.tag);

    const filteredSetRows = applyFilters(STATE.setRows);
    const filteredMateRows = applyFilters(STATE.mateRows);

    renderKpiCards(filteredSetRows);
    renderFormChips(filteredSetRows);

    // --- Map (aggregate() output shaped to what renderMapTable expects) ---
    const mapContainer = document.getElementById("map-content");
    if (filteredSetRows.length === 0) {
      setStatus(mapContainer, "empty", LABELS.noSetsRecorded);
      renderCallouts([]);
    } else {
      const mapGroups = aggregate(
        filteredSetRows,
        function (row) {
          return row.mode + "||" + row.map;
        },
        function (row) {
          return row.map;
        }
      );
      const mapRows = mapGroups.map(function (group) {
        return {
          mode: group.rows[0].mode,
          map: group.label,
          sets_played: group.sets,
          wins: group.wins,
          losses: group.losses,
          draws: group.draws,
          winrate: group.winrate,
          rows: group.rows,
        };
      });
      mapRows.sort(function (rowA, rowB) {
        return rowB.sets_played - rowA.sets_played;
      });
      renderCallouts(mapRows);
      renderMapTable(mapContainer, mapRows, "map-table", true);
      applyMinSampleFilter();
    }

    // --- Brawler (aggregate() output shaped to what renderBrawlerTable expects) ---
    const brawlerContainer = document.getElementById("brawler-content");
    if (filteredSetRows.length === 0) {
      setStatus(brawlerContainer, "empty", LABELS.noSetsRecorded);
    } else {
      const brawlerGroups = aggregate(
        filteredSetRows,
        function (row) {
          return row.brawler_id;
        },
        function (row) {
          return row.brawler_name || String(row.brawler_id);
        }
      );
      const brawlerRows = brawlerGroups.map(function (group) {
        return {
          brawler_id: group.key,
          brawler_name: group.label,
          sets_played: group.sets,
          wins: group.wins,
          losses: group.losses,
          draws: group.draws,
          winrate: group.winrate,
          rows: group.rows,
        };
      });
      brawlerRows.sort(function (rowA, rowB) {
        return rowB.sets_played - rowA.sets_played;
      });
      renderBrawlerTable(brawlerContainer, brawlerRows);
      applyMinSampleFilter();
    }

    // --- Teammates (aggregate() output shaped to what renderTeammateTable expects, note the
    // --- `sets_together` field name is preserved exactly since renderTeammateTable reads it,
    // --- unlike every other section which uses `sets_played`) ---
    const teammateContainer = document.getElementById("teammate-content");
    if (filteredMateRows.length === 0) {
      setStatus(teammateContainer, "empty", LABELS.noSetsRecorded);
    } else {
      const teammateGroups = aggregate(
        filteredMateRows,
        function (row) {
          return row.teammate_tag;
        },
        function (row) {
          return row.teammate_name || row.teammate_tag;
        }
      );
      const teammateRows = teammateGroups.map(function (group) {
        return {
          teammate_tag: group.key,
          teammate_name: group.label,
          teammate_is_tracked: group.rows[0].teammate_is_tracked,
          sets_together: group.sets,
          wins: group.wins,
          winrate: group.winrate,
          rows: group.rows,
        };
      });
      teammateRows.sort(function (rowA, rowB) {
        return rowB.sets_together - rowA.sets_together;
      });
      renderTeammateTable(teammateContainer, teammateRows);
      applyMinSampleFilter();
    }

    // applyMinSampleFilter() (called up to 3x above) always finishes updating every table's
    // .filtered-out classes by this point regardless of which branches ran, so it is simplest and
    // safest to refresh all 3 panels' right-side counts here in one place rather than duplicating
    // this call inside each of the 3 branches above — countFilteredOutRows() returns 0 for a
    // table that doesn't exist yet (e.g. an empty-state branch ran instead), so a panel showing no
    // rows always reports "0 rader over grensen", never a stale count from a previous player.
    updatePanelRightText("map-panel", countFilteredOutRows("map-table"));
    updatePanelRightText("brawler-panel", countFilteredOutRows("brawler-table"));
    updatePanelRightText("teammate-panel", countFilteredOutRows("teammate-table"));

    // --- Recent (the raw set-row view already has every field renderRecentTable reads, so
    // --- filteredSetRows is passed through with no field mapping) ---
    const recentContainer = document.getElementById("recent-content");
    if (filteredSetRows.length === 0) {
      setStatus(recentContainer, "empty", LABELS.noSetsRecorded);
    } else {
      const recentRows = filteredSetRows
        .slice()
        .sort(function (rowA, rowB) {
          return new Date(rowB.ended_at) - new Date(rowA.ended_at);
        })
        .slice(0, 10);
      renderRecentTable(recentContainer, recentRows);
    }

    updateMinSetsHint();
  }

