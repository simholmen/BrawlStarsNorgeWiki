  // =========================================================================================
  // === HERO ===
  // === Reads STATE.rankSnapshots/STATE.rankHistory (already fetched by loadPlayerData) and the
  // === currently selected <option> in #player-select — issues no network requests of its own.
  // === Prefers the live rank/elo snapshots (renderEloChart, continuous elo, ~30-min cadence)
  // === over the coarse tier-per-completed-set history (renderRankChart) whenever this player has
  // === at least 1 snapshot; falls back to the history path exactly as before otherwise (e.g. a
  // === player with no snapshots yet). Appends a period-relative delta span to `#hero-subline`
  // === either way — elo delta when snapshots are used, tier-value delta in the fallback.
  // =========================================================================================

  function renderHero(tag) {
    const rankIconEl = document.getElementById("hero-rank-icon");
    const playerIconEl = document.getElementById("hero-player-icon");
    const playerNameEl = document.getElementById("hero-player-name");
    const sublineEl = document.getElementById("hero-subline");

    const playerSelect = document.getElementById("player-select");
    const selectedOption = playerSelect.options[playerSelect.selectedIndex];
    const displayName = (selectedOption && selectedOption.textContent) || tag;
    playerNameEl.textContent = displayName;

    document.getElementById("hero-rank-badge").classList.remove("hero-rank-badge--bare");
    document.getElementById("hero-contact-hint").textContent = "";

    // Same "try the CDN icon, fall back to the local placeholder on error" pattern as
    // buildRowIconCell's icon param (used for the leaderboard/teammate table row icons).
    const playerIconUrl = profileIconUrl(STATE.rosterIconByTag.get(tag));
    playerIconEl.src = playerIconUrl || PLAYER_ICON_FALLBACK_URL;
    playerIconEl.alt = displayName;
    let triedPlayerIconFallback = false;
    playerIconEl.onerror = function () {
      if (playerIconUrl && !triedPlayerIconFallback) {
        triedPlayerIconFallback = true;
        playerIconEl.src = PLAYER_ICON_FALLBACK_URL;
        return;
      }
      playerIconEl.onerror = null;
      playerIconEl.removeAttribute("src");
      playerIconEl.alt = "";
    };

    // Shared by both paths below — latestRow only needs rank_label/tier_name, which
    // v_player_rank_snapshots and v_player_rank_history both expose identically (same rank_tiers
    // join), so one badge renderer covers both.
    function applyRankBadge(latestRow, deltaText) {
      clearElement(sublineEl);
      sublineEl.appendChild(
        document.createTextNode((latestRow.rank_label || "—") + " · " + tag)
      );
      if (deltaText !== null) {
        const deltaEl = document.createElement("span");
        deltaEl.className = "hero-rank-delta";
        deltaEl.textContent = " " + deltaText;
        sublineEl.appendChild(deltaEl);
      }
      const iconUrl = tierIconUrl(latestRow.tier_name);
      if (iconUrl) {
        rankIconEl.src = iconUrl;
        rankIconEl.alt = latestRow.tier_name;
      } else {
        rankIconEl.removeAttribute("src");
        rankIconEl.alt = "";
      }
    }

    function formatDelta(delta) {
      return delta > 0 ? "+" + delta : delta < 0 ? String(delta) : "±0";
    }

    // Which period the delta was computed over — mirrors periodCutoffDate's own STATE.period
    // branching, so the suffix always names the window actually used as the delta baseline.
    function heroDeltaPeriodSuffix() {
      if (STATE.period === "This season") {
        return LABELS.heroDeltaPeriodSeason;
      }
      if (STATE.period === "Last 30 days") {
        return LABELS.heroDeltaPeriodLast30;
      }
      if (STATE.period === "Last 7 days") {
        return LABELS.heroDeltaPeriodLast7;
      }
      return LABELS.heroDeltaPeriodAllTime;
    }

    const sortedRankSnapshots = STATE.rankSnapshots.slice().sort(function (rowA, rowB) {
      return new Date(rowA.fetched_at) - new Date(rowB.fetched_at);
    });

    if (sortedRankSnapshots.length > 0) {
      renderEloChart(sortedRankSnapshots);

      const latestSnapshot = sortedRankSnapshots[sortedRankSnapshots.length - 1];

      // Delta baseline: the earliest snapshot within the CURRENT period window only (never
      // mode-filtered — snapshot rows have no `mode` field, same reasoning as
      // filterRankHistoryByPeriod below).
      const periodRankSnapshots = filterRankSnapshotsByPeriod(STATE.rankSnapshots);
      const sortedPeriodRankSnapshots = periodRankSnapshots.slice().sort(function (rowA, rowB) {
        return new Date(rowA.fetched_at) - new Date(rowB.fetched_at);
      });
      const baselineSnapshot =
        sortedPeriodRankSnapshots.length > 0 ? sortedPeriodRankSnapshots[0] : null;

      let deltaText = null;
      if (
        baselineSnapshot &&
        latestSnapshot.ranked_elo !== null &&
        baselineSnapshot.ranked_elo !== null
      ) {
        deltaText =
          formatDelta(latestSnapshot.ranked_elo - baselineSnapshot.ranked_elo) +
          " " +
          LABELS.heroDeltaUnitElo +
          " " +
          heroDeltaPeriodSuffix();
      }

      applyRankBadge(latestSnapshot, deltaText);
      return;
    }

    // --- fallback: no rank snapshots exist yet for this player (pre-deployment history, or
    // --- profile fetches have been failing) — today's exact tier-history behavior ---
    renderRankChart(STATE.rankHistory);

    const sortedRankHistory = STATE.rankHistory.slice().sort(function (rowA, rowB) {
      return new Date(rowA.ended_at) - new Date(rowB.ended_at);
    });
    const latestRank =
      sortedRankHistory.length > 0 ? sortedRankHistory[sortedRankHistory.length - 1] : null;

    if (!latestRank) {
      sublineEl.textContent = "— · " + tag;
      rankIconEl.removeAttribute("src");
      return;
    }

    // Rank-delta baseline: the earliest rank-history row within the CURRENT period window only
    // (never mode-filtered — rank-history rows have no `mode` field, so `filterByModeAndPeriod`/
    // `applyFilters` cannot be reused here; see `filterRankHistoryByPeriod` below).
    const periodRankHistory = filterRankHistoryByPeriod(STATE.rankHistory);
    const sortedPeriodRankHistory = periodRankHistory.slice().sort(function (rowA, rowB) {
      return new Date(rowA.ended_at) - new Date(rowB.ended_at);
    });
    const baselineRank = sortedPeriodRankHistory.length > 0 ? sortedPeriodRankHistory[0] : null;

    const deltaText = baselineRank
      ? formatDelta(latestRank.rank_value - baselineRank.rank_value) + " " + heroDeltaPeriodSuffix()
      : null;
    applyRankBadge(latestRank, deltaText);
  }

  // === Period-only filter for rank-history rows (Task 15) — byte-for-byte the same cutoff-date
  // === math as `applyFilters`/`filterByModeAndPeriod`'s own period block, but deliberately
  // === self-contained: `v_player_rank_history` rows have no `mode` column, so reusing either of
  // === those 2 functions directly would either silently do nothing extra (harmless but
  // === misleading) or, worse, incorrectly zero out every row the moment a mode filter is active
  // === (since `row.mode === STATE.mode` would never match an undefined `row.mode`). ===
  function filterRankHistoryByPeriod(rows) {
    const cutoffDate = periodCutoffDate();
    if (cutoffDate === null) {
      return rows;
    }
    return rows.filter(function (row) {
      return new Date(row.ended_at) >= cutoffDate;
    });
  }

  // === Same period-only cutoff-date filter as filterRankHistoryByPeriod above, over
  // === v_player_rank_snapshots rows instead (fetched_at, not ended_at). ===
  function filterRankSnapshotsByPeriod(rows) {
    const cutoffDate = periodCutoffDate();
    if (cutoffDate === null) {
      return rows;
    }
    return rows.filter(function (row) {
      return new Date(row.fetched_at) >= cutoffDate;
    });
  }

  // =========================================================================================
  // === RANK-TIER CHART (Task 15) — FALLBACK ===
  // === `renderRankChart(history)` draws a translucent rank-tier line chart into
  // === #hero-rank-chart, absolutely positioned behind .hero-content by CSS. Y-axis labels are
  // === drawn only from tier_values/rank_labels actually observed in this player's own
  // === `history` — never a fabricated 1-22 full-range label, and never an "Elo"/points value.
  // === Built entirely with createElementNS — no raw markup injection anywhere.
  // === renderHero() only calls this when the player has no rank snapshots yet (see
  // === renderEloChart below, the preferred source once snapshots exist).
  // =========================================================================================

  const SVG_NS = "http://www.w3.org/2000/svg";

  function renderRankChart(history) {
    const container = document.getElementById("hero-rank-chart");
    clearElement(container);

    const sortedHistory = history.slice().sort(function (rowA, rowB) {
      return new Date(rowA.ended_at) - new Date(rowB.ended_at);
    });

    // A single point (or no points at all) cannot draw a meaningful line — render nothing rather
    // than a misleading flat/empty chart, and never throw.
    if (sortedHistory.length < 2) {
      return;
    }

    const viewBoxWidth = 640;
    const viewBoxHeight = 170;

    let minRank = sortedHistory[0].rank_value;
    let maxRank = sortedHistory[0].rank_value;
    sortedHistory.forEach(function (row) {
      if (row.rank_value < minRank) {
        minRank = row.rank_value;
      }
      if (row.rank_value > maxRank) {
        maxRank = row.rank_value;
      }
    });
    // A perfectly flat history (every row the same tier) would otherwise divide by zero below —
    // widen the observed range by 1 tier on each side just for the y-axis math, not for the
    // labels (labels are still matched against the real, unwidened rank_value of each row).
    const rankRange = maxRank === minRank ? 1 : maxRank - minRank;
    const rankRangeMin = maxRank === minRank ? minRank - 0.5 : minRank;

    function rankValueToY(rankValue) {
      return viewBoxHeight - ((rankValue - rankRangeMin) / rankRange) * viewBoxHeight;
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + viewBoxWidth + " " + viewBoxHeight);

    // --- 4 evenly-spaced gridlines, each labelled with the closest real observation's tier label
    // --- (within 2 tier-values) or, failing that, the plain rounded numeric value. ---
    const gridlineCount = 4;
    for (let gridlineIndex = 0; gridlineIndex < gridlineCount; gridlineIndex++) {
      const gridRankValue = minRank + (rankRange * gridlineIndex) / (gridlineCount - 1);
      const gridY = rankValueToY(gridRankValue);

      const gridline = document.createElementNS(SVG_NS, "line");
      gridline.setAttribute("x1", "0");
      gridline.setAttribute("y1", String(gridY));
      gridline.setAttribute("x2", String(viewBoxWidth));
      gridline.setAttribute("y2", String(gridY));
      gridline.style.stroke = "var(--divider)";
      gridline.setAttribute("stroke-width", "1");
      svg.appendChild(gridline);

      let closestRow = sortedHistory[0];
      let closestDistance = Math.abs(closestRow.rank_value - gridRankValue);
      sortedHistory.forEach(function (row) {
        const distance = Math.abs(row.rank_value - gridRankValue);
        if (distance < closestDistance) {
          closestRow = row;
          closestDistance = distance;
        }
      });
      const gridLabelText =
        closestDistance <= 2 && closestRow.rank_label
          ? closestRow.rank_label
          : String(Math.round(gridRankValue));

      const gridLabel = document.createElementNS(SVG_NS, "text");
      gridLabel.setAttribute("x", "4");
      gridLabel.setAttribute("y", String(gridY - 4));
      gridLabel.setAttribute("font-size", "10");
      gridLabel.style.fill = "var(--text-muted-2)";
      gridLabel.textContent = gridLabelText;
      svg.appendChild(gridLabel);
    }

    // --- gold area fill + line + terminal point, one point per history row, evenly spaced by
    // --- index order across the viewBox's width. ---
    const xStep = viewBoxWidth / (sortedHistory.length - 1);
    const linePoints = sortedHistory.map(function (row, index) {
      return index * xStep + "," + rankValueToY(row.rank_value);
    });

    const area = document.createElementNS(SVG_NS, "polygon");
    area.setAttribute(
      "points",
      "0," + viewBoxHeight + " " + linePoints.join(" ") + " " + viewBoxWidth + "," + viewBoxHeight
    );
    area.style.fill = "rgba(255,210,61,.13)";
    svg.appendChild(area);

    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", linePoints.join(" "));
    line.setAttribute("fill", "none");
    line.style.stroke = "var(--accent-gold)";
    line.setAttribute("stroke-width", "2.4");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);

    const lastRow = sortedHistory[sortedHistory.length - 1];
    const terminalPoint = document.createElementNS(SVG_NS, "circle");
    terminalPoint.setAttribute("cx", String((sortedHistory.length - 1) * xStep));
    terminalPoint.setAttribute("cy", String(rankValueToY(lastRow.rank_value)));
    terminalPoint.setAttribute("r", "4");
    terminalPoint.style.fill = "var(--accent-gold)";
    svg.appendChild(terminalPoint);

    container.appendChild(svg);
  }

  // =========================================================================================
  // === ELO CHART (preferred over the rank-tier chart above once a player has snapshots) ===
  // === `renderEloChart(snapshots)` is renderRankChart's twin, plotting continuous `ranked_elo`
  // === over `fetched_at` instead of the coarse 1-22 `rank_value` over `ended_at` — elo has no
  // === lookup table, so gridlines are always the plain rounded elo number, never a tier label.
  // === Same viewBox/visual language (gold line+area+terminal point) so it reads as the same
  // === component, not a new design. `snapshots` is assumed already sorted by fetched_at
  // === ascending (renderHero sorts once and reuses that order for both the chart and the badge).
  // =========================================================================================

  function renderEloChart(snapshots) {
    const container = document.getElementById("hero-rank-chart");
    clearElement(container);

    // A single point (or no points at all) cannot draw a meaningful line — render nothing rather
    // than a misleading flat/empty chart, and never throw.
    if (snapshots.length < 2) {
      return;
    }

    const viewBoxWidth = 640;
    const viewBoxHeight = 170;

    let minElo = snapshots[0].ranked_elo;
    let maxElo = snapshots[0].ranked_elo;
    snapshots.forEach(function (row) {
      if (row.ranked_elo < minElo) {
        minElo = row.ranked_elo;
      }
      if (row.ranked_elo > maxElo) {
        maxElo = row.ranked_elo;
      }
    });
    // A perfectly flat history (elo unchanged across every snapshot) would otherwise divide by
    // zero below — widen the observed range for the y-axis math only, same trick as
    // renderRankChart's rankRange/rankRangeMin.
    const eloRange = maxElo === minElo ? 1 : maxElo - minElo;
    const eloRangeMin = maxElo === minElo ? minElo - 0.5 : minElo;

    function eloValueToY(eloValue) {
      return viewBoxHeight - ((eloValue - eloRangeMin) / eloRange) * viewBoxHeight;
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + viewBoxWidth + " " + viewBoxHeight);

    // --- 4 evenly-spaced gridlines, each labelled with the plain rounded elo value at that
    // --- height — no label-snapping to a nearby observation, unlike the tier chart, since elo
    // --- is continuous and any rounded number on the axis is already meaningful. ---
    const gridlineCount = 4;
    for (let gridlineIndex = 0; gridlineIndex < gridlineCount; gridlineIndex++) {
      const gridEloValue = minElo + (eloRange * gridlineIndex) / (gridlineCount - 1);
      const gridY = eloValueToY(gridEloValue);

      const gridline = document.createElementNS(SVG_NS, "line");
      gridline.setAttribute("x1", "0");
      gridline.setAttribute("y1", String(gridY));
      gridline.setAttribute("x2", String(viewBoxWidth));
      gridline.setAttribute("y2", String(gridY));
      gridline.style.stroke = "var(--divider)";
      gridline.setAttribute("stroke-width", "1");
      svg.appendChild(gridline);

      const gridLabel = document.createElementNS(SVG_NS, "text");
      gridLabel.setAttribute("x", "4");
      gridLabel.setAttribute("y", String(gridY - 4));
      gridLabel.setAttribute("font-size", "10");
      gridLabel.style.fill = "var(--text-muted-2)";
      gridLabel.textContent = String(Math.round(gridEloValue));
      svg.appendChild(gridLabel);
    }

    // --- gold area fill + line + terminal point, one point per snapshot, evenly spaced by index
    // --- order across the viewBox's width. ---
    const xStep = viewBoxWidth / (snapshots.length - 1);
    const linePoints = snapshots.map(function (row, index) {
      return index * xStep + "," + eloValueToY(row.ranked_elo);
    });

    const area = document.createElementNS(SVG_NS, "polygon");
    area.setAttribute(
      "points",
      "0," + viewBoxHeight + " " + linePoints.join(" ") + " " + viewBoxWidth + "," + viewBoxHeight
    );
    area.style.fill = "rgba(255,210,61,.13)";
    svg.appendChild(area);

    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", linePoints.join(" "));
    line.setAttribute("fill", "none");
    line.style.stroke = "var(--accent-gold)";
    line.setAttribute("stroke-width", "2.4");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);

    const lastRow = snapshots[snapshots.length - 1];
    const terminalPoint = document.createElementNS(SVG_NS, "circle");
    terminalPoint.setAttribute("cx", String((snapshots.length - 1) * xStep));
    terminalPoint.setAttribute("cy", String(eloValueToY(lastRow.ranked_elo)));
    terminalPoint.setAttribute("r", "4");
    terminalPoint.style.fill = "var(--accent-gold)";
    svg.appendChild(terminalPoint);

    container.appendChild(svg);
  }

  // =========================================================================================
  // === HERO KPI CARDS + FORM CHIPS ===
  // === `renderKpiCards`/`renderFormChips` both take the same filtered set-rows array
  // === `renderAll()` already computed via `applyFilters(STATE.setRows)` — neither function
  // === re-filters or re-fetches anything. Both render into containers Task 6 wired directly into
  // === `.hero-content` (`#hero-kpis`, `#hero-form`); the old Overall-section summary display
  // === these replace is gone entirely.
  // =========================================================================================

  function winrateTone(winrate) {
    if (winrate === null || winrate === undefined) {
      return null;
    }
    if (winrate >= 0.6) {
      return "var(--win)";
    }
    if (winrate >= 0.45) {
      return "var(--accent-gold)";
    }
    return "var(--loss)";
  }

  function renderKpiCards(rows) {
    const container = document.getElementById("hero-kpis");
    clearElement(container);

    let wins = 0;
    let losses = 0;
    let draws = 0;
    rows.forEach(function (row) {
      if (row.result === "win") {
        wins++;
      } else if (row.result === "loss") {
        losses++;
      } else if (row.result === "draw") {
        draws++;
      }
    });
    const winrate = wins + losses === 0 ? null : wins / (wins + losses);

    const cards = [
      { label: LABELS.setsPlayed, value: String(rows.length), color: null },
      { label: LABELS.winrate, value: formatWinrate(winrate), color: winrateTone(winrate) },
      { label: LABELS.wins, value: String(wins), color: "var(--win)" },
      { label: LABELS.losses, value: String(losses), color: "var(--loss)" },
      { label: LABELS.draws, value: String(draws), color: "var(--draw)" },
    ];

    cards.forEach(function (card) {
      const cardEl = document.createElement("div");
      cardEl.className = "hero-kpi-card";

      const labelEl = document.createElement("div");
      labelEl.className = "hero-kpi-label";
      labelEl.textContent = card.label;

      const valueEl = document.createElement("div");
      valueEl.className = "hero-kpi-value";
      valueEl.textContent = card.value;
      if (card.color) {
        valueEl.style.color = card.color;
      }

      cardEl.appendChild(labelEl);
      cardEl.appendChild(valueEl);
      container.appendChild(cardEl);
    });
  }

  function renderFormChips(rows) {
    const container = document.getElementById("hero-form");
    clearElement(container);

    const sortedRows = rows.slice().sort(function (rowA, rowB) {
      return new Date(rowB.ended_at) - new Date(rowA.ended_at);
    });
    const recentRows = sortedRows.slice(0, 10).reverse();

    recentRows.forEach(function (row) {
      const chip = document.createElement("span");
      chip.className = "hero-form-chip";

      if (row.result === "win") {
        chip.textContent = "W";
        chip.style.background = "var(--win)";
      } else if (row.result === "loss") {
        chip.textContent = "L";
        chip.style.background = "var(--loss)";
      } else {
        chip.textContent = "D";
        chip.style.background = "var(--text-muted-4)";
      }

      container.appendChild(chip);
    });
  }

