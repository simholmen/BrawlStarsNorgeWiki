  // =========================================================================================
  // === PLAYER PICKER ===
  // =========================================================================================

  async function loadPlayers() {
    const select = document.getElementById("player-select");
    const listStatus = document.getElementById("player-list-status");

    const { data, error } = await sb
      .from("players")
      .select("tag,name,icon_id")
      .eq("is_tracked", true)
      .order("name");

    clearElement(select);

    if (error) {
      listStatus.style.display = "block";
      listStatus.className = "status error";
      listStatus.textContent = LABELS.errorLoadingPlayers + error.message;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = LABELS.failedToLoadPlayers;
      select.appendChild(placeholder);
      return [];
    }

    if (!data || data.length === 0) {
      listStatus.style.display = "block";
      listStatus.className = "status empty";
      listStatus.textContent = LABELS.noTrackedPlayers;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = LABELS.noTrackedPlayersOption;
      select.appendChild(placeholder);
      return [];
    }

    listStatus.style.display = "none";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = LABELS.choosePlayer;
    select.appendChild(placeholder);

    data.forEach(function (player) {
      const option = document.createElement("option");
      option.value = player.tag;
      option.textContent = player.name || player.tag;
      select.appendChild(option);
    });

    return data;
  }

  // === Bulk fetch across every tracked player for the leaderboard (no player selected) view.
  // === Called once at init, after loadPlayers() resolves the roster it depends on. ===
  async function loadLeaderboardData(trackedPlayers) {
    STATE.rosterByTag = new Map(
      trackedPlayers.map(function (p) { return [p.tag, p.name || p.tag]; })
    );
    STATE.rosterIconByTag = new Map(
      trackedPlayers.map(function (p) { return [p.tag, p.icon_id || null]; })
    );

    const trackedTags = trackedPlayers.map(function (p) { return p.tag; });
    if (trackedTags.length === 0) {
      STATE.allSetRows = [];
      renderAll();
      return;
    }

    const setRowsResult = await sb
      .from("v_player_set_rows")
      .select("*")
      .in("player_tag", trackedTags);

    if (setRowsResult.error) {
      STATE.allSetRows = [];
      STATE.leaderboardLoadError = setRowsResult.error.message;
      renderAll();
      return;
    }

    STATE.allSetRows = setRowsResult.data || [];
    STATE.leaderboardLoadError = null;
    renderAll();
  }

  // === URL state (?player=TAG) — keeps the selected player reflected in the address bar so a
  // === refresh restores the same player, and the back button returns to the previous selection
  // === (or the Felles leaderboard, once there's nothing left to go back to). `suppressUrlPush`
  // === is set around the two callers that must NOT add a new history entry: the initial-load
  // === restore (we're already "at" this URL, pushing again would create a phantom duplicate) and
  // === the popstate handler itself (reacting to a navigation the user already made, pushing again
  // === would fight the back button instead of following it). ===
  let suppressUrlPush = false;

  function playerTagFromUrl() {
    return new URLSearchParams(window.location.search).get("player") || "";
  }

  function updateUrlForPlayer(tag) {
    const url = new URL(window.location.href);
    if (tag) {
      url.searchParams.set("player", tag);
    } else {
      url.searchParams.delete("player");
    }
    history.pushState({ tag: tag || null }, "", url);
  }

  function onPlayerSelected() {
    const select = document.getElementById("player-select");
    const tag = select.value;

    clearElement(document.getElementById("match-detail-content"));

    if (!suppressUrlPush) {
      updateUrlForPlayer(tag);
    }

    if (!tag) {
      STATE.tag = null;
      STATE.setRows = [];
      STATE.mateRows = [];
      STATE.rankHistory = [];
      renderAll();
      return;
    }

    loadPlayerData(tag);
  }

  document.getElementById("player-select").addEventListener("change", onPlayerSelected);

  // === Programmatic equivalent of a user picking `tag` from #player-select — used by the
  // === leaderboard's clickable rows so clicking a player is indistinguishable from selecting
  // === them in the sidebar (same load, same rendered page). ===
  function selectPlayer(tag) {
    document.getElementById("player-select").value = tag;
    onPlayerSelected();
  }

  // === Back/forward navigation — restore whichever player (or none, i.e. Felles) the URL now
  // === names, without pushing a further history entry of our own. ===
  window.addEventListener("popstate", function () {
    suppressUrlPush = true;
    selectPlayer(playerTagFromUrl());
    suppressUrlPush = false;
  });

  // =========================================================================================
  // === LEADERBOARD (no player selected) ===
  // === Renders a ranked list of every tracked player by overall winrate, re-scoped by the same
  // === sidebar tree/mode/period/min-sets controls as player mode (see currentTreeRows() above and
  // === computeLeaderboardRows() in the DATA LAYER section). Pagination is a real prev/next pager
  // === over a fixed page size — NOT the teammate panel's cumulative "load more" pattern — since
  // === the leaderboard is always fully re-ranked, and only the current page's rows are ever
  // === materialized in the DOM. Column sort (STATE.leaderboardSort, applied by
  // === sortLeaderboardRows()) therefore re-sorts the FULL rankedRows array before pagination
  // === slices it, not just the current page's DOM rows — otherwise sorting would silently ignore
  // === every other page's rows and rank numbers ("#") would stop matching the sort order.
  // =========================================================================================

  const LEADERBOARD_PAGE_SIZE = 50;

  function sortLeaderboardRows(rankedRows) {
    const column = STATE.leaderboardSort.column;
    if (!column) {
      return;
    }
    const multiplier = STATE.leaderboardSort.direction === "asc" ? 1 : -1;
    rankedRows.sort(function (rowA, rowB) {
      if (column === "label") {
        return multiplier * rowA.label.localeCompare(rowB.label);
      }
      const valueA = column === "winrate" && rowA.winrate === null ? -1 : rowA[column];
      const valueB = column === "winrate" && rowB.winrate === null ? -1 : rowB[column];
      return multiplier * (valueA - valueB);
    });
  }

  function handleLeaderboardSort(column) {
    if (STATE.leaderboardSort.column === column) {
      STATE.leaderboardSort.direction = STATE.leaderboardSort.direction === "asc" ? "desc" : "asc";
    } else {
      STATE.leaderboardSort.column = column;
      STATE.leaderboardSort.direction = "desc";
    }
    STATE.leaderboardPage = 1;
    renderLeaderboard();
  }

  function buildLeaderboardPagination(totalRows, totalPages) {
    const wrapper = document.createElement("div");
    wrapper.className = "leaderboard-pagination";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "load-more-button";
    prevButton.textContent = LABELS.leaderboardPrevPage;
    prevButton.disabled = STATE.leaderboardPage === 1;
    prevButton.addEventListener("click", function () {
      STATE.leaderboardPage = Math.max(1, STATE.leaderboardPage - 1);
      renderLeaderboard();
    });
    wrapper.appendChild(prevButton);

    const pageInfo = document.createElement("span");
    pageInfo.className = "leaderboard-page-info";
    pageInfo.textContent =
      LABELS.leaderboardPageLabel + " " + STATE.leaderboardPage + " " +
      LABELS.leaderboardPageOfLabel + " " + totalPages;
    wrapper.appendChild(pageInfo);

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "load-more-button";
    nextButton.textContent = LABELS.leaderboardNextPage;
    nextButton.disabled = STATE.leaderboardPage === totalPages;
    nextButton.addEventListener("click", function () {
      STATE.leaderboardPage = Math.min(totalPages, STATE.leaderboardPage + 1);
      renderLeaderboard();
    });
    wrapper.appendChild(nextButton);

    return wrapper;
  }

  function renderLeaderboard() {
    const container = document.getElementById("leaderboard-content");

    const filterSignature =
      STATE.mode + "||" + STATE.period + "||" + STATE.minSets + "||" +
      STATE.filter.kind + "||" + STATE.filter.value;
    if (filterSignature !== STATE.leaderboardFilterSignature) {
      STATE.leaderboardPage = 1;
      STATE.leaderboardFilterSignature = filterSignature;
    }

    if (STATE.leaderboardLoadError) {
      STATE.leaderboardExcludedCount = 0;
      setStatus(container, "error", LABELS.errorPrefix + STATE.leaderboardLoadError);
      return;
    }

    const { rankedRows, excludedCount } = computeLeaderboardRows();
    STATE.leaderboardExcludedCount = excludedCount;
    sortLeaderboardRows(rankedRows);

    if (rankedRows.length === 0) {
      setStatus(
        container,
        "empty",
        excludedCount > 0
          ? excludedCount + " " + LABELS.leaderboardExcludedSuffix
          : LABELS.noSetsRecorded
      );
      return;
    }

    const totalPages = Math.ceil(rankedRows.length / LEADERBOARD_PAGE_SIZE);
    STATE.leaderboardPage = Math.min(Math.max(1, STATE.leaderboardPage), totalPages);

    clearElement(container);

    const table = document.createElement("table");
    table.id = "leaderboard-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    // Column order: #, Player, Sets, W, L, D, Trend, Winrate. Rank and Trend have no `column`
    // entry — rank is a derived position, and Trend has no single-cell value to compare. Unlike
    // the map/brawler/teammate tables (makeSortableHeader, which just reorders the already-
    // rendered <tr>s), the leaderboard is paginated, so a header click has to re-sort the FULL
    // ranked list (via STATE.leaderboardSort) and re-render, not just the current page's rows.
    const columns = [
      { label: LABELS.leaderboardRankColumn, column: null },
      { label: LABELS.playerLabel, column: "label" },
      { label: LABELS.tableSets, column: "sets" },
      { label: LABELS.tableWins, column: "wins" },
      { label: LABELS.tableLosses, column: "losses" },
      { label: LABELS.tableDraws, column: "draws" },
      { label: LABELS.tableTrend, column: null },
      { label: LABELS.tableWinrate, column: "winrate" },
    ];
    columns.forEach(function (col) {
      const th = document.createElement("th");
      th.textContent = col.label;
      if (col.column) {
        if (STATE.leaderboardSort.column === col.column) {
          th.setAttribute("data-order", STATE.leaderboardSort.direction);
        }
        th.addEventListener("click", function () {
          handleLeaderboardSort(col.column);
        });
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const startIndex = (STATE.leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
    const pageRows = rankedRows.slice(startIndex, startIndex + LEADERBOARD_PAGE_SIZE);

    pageRows.forEach(function (group, indexOnPage) {
      const tr = document.createElement("tr");
      tr.className = "leaderboard-row";
      tr.addEventListener("click", function () {
        selectPlayer(group.rows[0].player_tag);
      });
      tr.appendChild(makeCell(String(startIndex + indexOnPage + 1)));
      const playerIconId = STATE.rosterIconByTag.get(group.rows[0].player_tag);
      // group.rows is sorted ascending by ended_at (aggregate()'s own contract), so the last
      // entry is this player's most recent set within the active filters — its tier_name is
      // the closest available proxy for "current rank" without a separate rank-snapshot fetch.
      const currentTierName = group.rows[group.rows.length - 1].tier_name;
      const rankIconUrl = tierIconUrl(currentTierName);
      let currentRankBadge = null;
      if (rankIconUrl) {
        currentRankBadge = document.createElement("img");
        currentRankBadge.className = "leaderboard-rank-icon";
        currentRankBadge.src = rankIconUrl;
        currentRankBadge.alt = currentTierName;
        currentRankBadge.title = currentTierName;
        currentRankBadge.loading = "lazy";
      }
      tr.appendChild(
        buildRowIconCell(
          group.label,
          group.rows[0].player_tag,
          false,
          currentRankBadge ? [currentRankBadge] : null,
          profileIconUrl(playerIconId),
          PLAYER_ICON_FALLBACK_URL
        )
      );
      tr.appendChild(makeCell(String(group.sets)));
      tr.appendChild(makeCell(String(group.wins)));
      tr.appendChild(makeCell(String(group.losses)));
      tr.appendChild(makeCell(String(group.draws)));
      const trendCell = document.createElement("td");
      const sparkline = renderSparkline(group.rows);
      if (sparkline) {
        trendCell.appendChild(sparkline);
      }
      tr.appendChild(trendCell);
      tr.appendChild(buildWinrateCell(group.winrate));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
    container.appendChild(buildLeaderboardPagination(rankedRows.length, totalPages));
  }

  // =========================================================================================
  // === COMBINED RECENT MATCHES (no player selected) ===
  // === Same STATE.allSetRows bulk fetch the leaderboard table ranks (see loadLeaderboardData),
  // === just flattened to individual sets instead of grouped per player, newest first, paginated
  // === COMBINED_RECENT_PAGE_SIZE at a time. Respects the same mode/period/brawler-or-class
  // === filters as the rest of the sidebar (applyFilters) but ignores STATE.minSets — that
  // === threshold only makes sense for a per-player aggregate, not a raw list of sets. Reuses
  // === buildRecentRow's per-set row (map/brawler/rank/result cells, click-to-open match modal)
  // === via buildCombinedRecentRow, which just prepends a player identity cell so it's clear
  // === whose set each row is. Pagination reuses the leaderboard's own prev/next pager pattern
  // === (buildLeaderboardPagination) against STATE.combinedRecentPage instead of leaderboardPage.
  // =========================================================================================

  const COMBINED_RECENT_PAGE_SIZE = 10;

  function buildCombinedRecentRow(row) {
    const rowEl = buildRecentRow(row);
    rowEl.classList.add("recent-row--combined");

    const playerCell = document.createElement("div");
    playerCell.className = "recent-player-cell";
    const iconUrl = profileIconUrl(STATE.rosterIconByTag.get(row.player_tag));
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.className = "recent-player-icon";
      icon.src = iconUrl;
      icon.alt = "";
      icon.loading = "lazy";
      icon.onerror = function () {
        icon.onerror = null;
        icon.className = "recent-player-placeholder";
        icon.removeAttribute("src");
      };
      playerCell.appendChild(icon);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "recent-player-placeholder";
      playerCell.appendChild(placeholder);
    }
    const nameEl = document.createElement("span");
    nameEl.className = "recent-player-name";
    nameEl.textContent = STATE.rosterByTag.get(row.player_tag) || row.player_tag;
    playerCell.appendChild(nameEl);

    rowEl.insertBefore(playerCell, rowEl.firstChild);
    return rowEl;
  }

  function buildCombinedRecentPagination(totalPages) {
    const wrapper = document.createElement("div");
    wrapper.className = "leaderboard-pagination";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "load-more-button";
    prevButton.textContent = LABELS.leaderboardPrevPage;
    prevButton.disabled = STATE.combinedRecentPage === 1;
    prevButton.addEventListener("click", function () {
      STATE.combinedRecentPage = Math.max(1, STATE.combinedRecentPage - 1);
      renderCombinedRecent();
    });
    wrapper.appendChild(prevButton);

    const pageInfo = document.createElement("span");
    pageInfo.className = "leaderboard-page-info";
    pageInfo.textContent =
      LABELS.leaderboardPageLabel + " " + STATE.combinedRecentPage + " " +
      LABELS.leaderboardPageOfLabel + " " + totalPages;
    wrapper.appendChild(pageInfo);

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "load-more-button";
    nextButton.textContent = LABELS.leaderboardNextPage;
    nextButton.disabled = STATE.combinedRecentPage === totalPages;
    nextButton.addEventListener("click", function () {
      STATE.combinedRecentPage = Math.min(totalPages, STATE.combinedRecentPage + 1);
      renderCombinedRecent();
    });
    wrapper.appendChild(nextButton);

    return wrapper;
  }

  function renderCombinedRecent() {
    const container = document.getElementById("combined-recent-content");

    const filterSignature =
      STATE.mode + "||" + STATE.period + "||" + STATE.filter.kind + "||" + STATE.filter.value;
    if (filterSignature !== STATE.combinedRecentFilterSignature) {
      STATE.combinedRecentPage = 1;
      STATE.combinedRecentFilterSignature = filterSignature;
    }

    if (STATE.leaderboardLoadError) {
      setStatus(container, "error", LABELS.errorPrefix + STATE.leaderboardLoadError);
      return;
    }

    const rows = applyFilters(STATE.allSetRows)
      .slice()
      .sort(function (rowA, rowB) {
        return new Date(rowB.ended_at) - new Date(rowA.ended_at);
      });

    if (rows.length === 0) {
      setStatus(container, "empty", LABELS.noSetsRecorded);
      return;
    }

    const totalPages = Math.ceil(rows.length / COMBINED_RECENT_PAGE_SIZE);
    STATE.combinedRecentPage = Math.min(Math.max(1, STATE.combinedRecentPage), totalPages);

    clearElement(container);

    const startIndex = (STATE.combinedRecentPage - 1) * COMBINED_RECENT_PAGE_SIZE;
    const pageRows = rows.slice(startIndex, startIndex + COMBINED_RECENT_PAGE_SIZE);

    const list = document.createElement("div");
    list.className = "recent-list";
    pageRows.forEach(function (row) {
      list.appendChild(buildCombinedRecentRow(row));
    });
    container.appendChild(list);

    container.appendChild(buildCombinedRecentPagination(totalPages));
  }

