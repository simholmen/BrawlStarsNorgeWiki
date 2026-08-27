  // =========================================================================================
  // === BEST/WORST MAP CALLOUT CARDS ===
  // === `renderCallouts(mapRows)` takes the exact `mapRows` array renderAll() already builds for
  // === the map table (see the TEMPORARY bridge in the DATA LAYER section above) — it never
  // === recomputes the mode/map aggregation itself. Filters to `row.sets_played >= STATE.minSets`
  // === reading STATE live (so a future min-sets control immediately changes which rows
  // === qualify), then finds the max/min winrate row via a linear scan — the idiomatic pattern
  // === already used for win/loss/draw tallies elsewhere in this file. Rows with a null winrate
  // === (all draws, no decisive sets) are excluded from best/worst consideration entirely. Always
  // === renders both cards, even with zero qualifying rows or an empty mapRows array, showing "—"
  // === per the mockup's own empty-state behaviour rather than hiding the cards.
  // =========================================================================================

  function renderCallouts(mapRows) {
    const container = document.getElementById("map-callouts");
    clearElement(container);

    const qualifyingRows = mapRows.filter(function (row) {
      return (
        row.sets_played >= STATE.minSets && row.winrate !== null && row.winrate !== undefined
      );
    });

    let bestRow = null;
    let worstRow = null;
    qualifyingRows.forEach(function (row) {
      if (bestRow === null || row.winrate > bestRow.winrate) {
        bestRow = row;
      }
      if (worstRow === null || row.winrate < worstRow.winrate) {
        worstRow = row;
      }
    });

    const callouts = [
      { tag: LABELS.bestMap, tone: "var(--win)", row: bestRow },
      { tag: LABELS.worstMap, tone: "var(--loss)", row: worstRow },
    ];

    callouts.forEach(function (callout) {
      const row = callout.row;

      const card = document.createElement("div");
      card.className = "callout-card";
      card.style.borderLeftColor = callout.tone;

      const swatch = document.createElement("div");
      swatch.className = "callout-swatch";
      const iconUrl = row ? modeIconUrl(row.mode) : null;
      if (iconUrl) {
        const icon = document.createElement("img");
        icon.className = "callout-icon";
        icon.src = iconUrl;
        icon.alt = prettyMode(row.mode);
        icon.loading = "lazy";
        icon.onerror = function () {
          icon.onerror = null;
          icon.removeAttribute("src");
          icon.alt = "";
        };
        swatch.appendChild(icon);
      }
      card.appendChild(swatch);

      const info = document.createElement("div");
      info.className = "callout-info";

      const tagEl = document.createElement("div");
      tagEl.className = "callout-tag";
      tagEl.textContent = callout.tag;
      tagEl.style.color = callout.tone;
      info.appendChild(tagEl);

      const mapEl = document.createElement("div");
      mapEl.className = "callout-map";
      mapEl.textContent = row ? row.map : "—";
      info.appendChild(mapEl);

      const subEl = document.createElement("div");
      subEl.className = "callout-sub";
      subEl.textContent = row
        ? prettyMode(row.mode) + " · " + row.sets_played + " " + LABELS.setsSuffix
        : "0 " + LABELS.setsSuffix;
      info.appendChild(subEl);

      card.appendChild(info);

      const winrateEl = document.createElement("div");
      winrateEl.className = "callout-wr";
      winrateEl.textContent = row ? formatWinrate(row.winrate) : "—";
      winrateEl.style.color = callout.tone;
      card.appendChild(winrateEl);

      container.appendChild(card);
    });
  }

  // =========================================================================================
  // === TABLE ROW HELPERS (shared by the map/brawler/teammate table renderers below) ===
  // === `buildRowIconCell` builds the "32x32 placeholder + label (+ optional sub-label) + optional
  // === badges" first-column cell shared across all 3 tables; `buildWinrateCell` builds the
  // === "12px bar + 21px %" final-column cell. Both are pure DOM builders — no DOM lookups, no
  // === STATE reads — so each renderer decides its own THIN-badge threshold and passes it in.
  // =========================================================================================

  function buildRowIconCell(label, subLabel, isThin, extraBadgeEls, iconUrl, fallbackUrl) {
    const cell = document.createElement("td");

    const wrapper = document.createElement("div");
    wrapper.className = "table-row-cell";

    if (iconUrl || fallbackUrl) {
      const icon = document.createElement("img");
      icon.className = "table-row-icon";
      icon.src = iconUrl || fallbackUrl;
      icon.alt = label;
      icon.loading = "lazy";
      // A brawler/map shipped after the last asset export won't have artwork yet (no
      // fallbackUrl passed) — fall back to the plain placeholder swatch instead of showing a
      // broken-image icon. Callers that do pass fallbackUrl (player profile icons) get one
      // retry against it before giving up the same way.
      let triedFallback = false;
      icon.onerror = function () {
        if (fallbackUrl && !triedFallback) {
          triedFallback = true;
          icon.src = fallbackUrl;
          return;
        }
        icon.onerror = null;
        icon.removeAttribute("src");
        icon.alt = "";
      };
      wrapper.appendChild(icon);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "table-icon-placeholder";
      wrapper.appendChild(placeholder);
    }

    const textStack = document.createElement("div");
    textStack.className = "table-row-text";

    const labelLine = document.createElement("div");
    labelLine.className = "table-row-label-line";

    const labelEl = document.createElement("span");
    labelEl.className = "table-row-label";
    labelEl.textContent = label;
    labelLine.appendChild(labelEl);

    (extraBadgeEls || []).forEach(function (badgeEl) {
      labelLine.appendChild(badgeEl);
    });

    if (isThin) {
      const thinBadge = document.createElement("span");
      thinBadge.className = "badge-thin";
      thinBadge.textContent = LABELS.thinBadge;
      thinBadge.title = LABELS.thinBadgeTooltip;
      labelLine.appendChild(thinBadge);
    }

    textStack.appendChild(labelLine);

    if (subLabel) {
      const subLabelEl = document.createElement("span");
      subLabelEl.className = "table-row-sublabel";
      subLabelEl.textContent = subLabel;
      textStack.appendChild(subLabelEl);
    }

    wrapper.appendChild(textStack);
    cell.appendChild(wrapper);

    return cell;
  }

  function buildWinrateCell(winrate) {
    const cell = document.createElement("td");
    const tone = winrateTone(winrate) || "var(--text-muted-4)";
    const barPercent = winrate === null || winrate === undefined ? 0 : winrate * 100;

    const barTrack = document.createElement("div");
    barTrack.className = "winrate-bar-track";
    const barFill = document.createElement("div");
    barFill.className = "winrate-bar-fill";
    barFill.style.width = barPercent + "%";
    barFill.style.background = tone;
    barTrack.appendChild(barFill);
    cell.appendChild(barTrack);

    // The percentage is a real, standalone text node (not embedded inside the bar) — required so
    // `sortTableByColumn`'s `cell.textContent` read still yields exactly the "NN.N%" string.
    const textEl = document.createElement("span");
    textEl.className = "winrate-bar-text";
    textEl.textContent = formatWinrate(winrate);
    textEl.style.color = tone;
    cell.appendChild(textEl);

    return cell;
  }

  // =========================================================================================
  // === TREND SPARKLINE (Task 15) ===
  // === `renderSparkline(rows)` takes one map/brawler/teammate group's own chronological set-rows
  // === (the same `group.rows` array `aggregate()` already produces, ascending by `ended_at`) and
  // === returns either `null` (fewer than 3 sets — not enough data for a meaningful trend, so the
  // === Trend <td> stays empty) or a small inline SVG plotting a ROLLING cumulative-from-the-start
  // === winrate across up to 8 chronological buckets. Never fabricates data — only real
  // === `result` values from `rows` are read. Built entirely with createElementNS.
  // =========================================================================================

  function renderSparkline(rows) {
    if (rows.length < 3) {
      return null;
    }

    const viewBoxWidth = 92;
    const viewBoxHeight = 26;
    const midpointY = viewBoxHeight / 2;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + viewBoxWidth + " " + viewBoxHeight);
    svg.classList.add("sparkline-svg");

    const referenceLine = document.createElementNS(SVG_NS, "line");
    referenceLine.setAttribute("x1", "0");
    referenceLine.setAttribute("y1", String(midpointY));
    referenceLine.setAttribute("x2", String(viewBoxWidth));
    referenceLine.setAttribute("y2", String(midpointY));
    referenceLine.style.stroke = "var(--divider)";
    referenceLine.setAttribute("stroke-width", "1");
    svg.appendChild(referenceLine);

    // Bucket the rows into up to 8 roughly-equal-sized contiguous chronological chunks. Each
    // bucket's end index marks how far into `rows` its ROLLING winrate looks back — bucket 0's
    // winrate covers rows[0..endIndex0], bucket 1's covers rows[0..endIndex1], and so on, always
    // starting from the very first row (cumulative-to-that-point, never a per-bucket-only stat).
    const bucketCount = Math.min(8, rows.length);
    const bucketEndIndexes = [];
    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
      const endIndex = Math.round(((bucketIndex + 1) * rows.length) / bucketCount) - 1;
      bucketEndIndexes.push(endIndex);
    }

    const xStep = viewBoxWidth / (bucketCount - 1);
    const bucketPoints = bucketEndIndexes.map(function (endIndex, bucketIndex) {
      let wins = 0;
      let losses = 0;
      for (let rowIndex = 0; rowIndex <= endIndex; rowIndex++) {
        if (rows[rowIndex].result === "win") {
          wins++;
        } else if (rows[rowIndex].result === "loss") {
          losses++;
        }
      }
      const rollingWinrate = wins + losses === 0 ? null : wins / (wins + losses);
      const y =
        rollingWinrate === null
          ? midpointY
          : viewBoxHeight - 4 - rollingWinrate * (viewBoxHeight - 8);
      return { x: bucketIndex * xStep, y: y, winrate: rollingWinrate };
    });

    const lastPoint = bucketPoints[bucketPoints.length - 1];
    const lineColor = winrateTone(lastPoint.winrate) || "var(--text-muted-4)";

    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute(
      "points",
      bucketPoints
        .map(function (point) {
          return point.x + "," + point.y;
        })
        .join(" ")
    );
    polyline.setAttribute("fill", "none");
    polyline.style.stroke = lineColor;
    polyline.setAttribute("stroke-width", "1.8");
    svg.appendChild(polyline);

    const terminalPoint = document.createElementNS(SVG_NS, "circle");
    terminalPoint.setAttribute("cx", String(lastPoint.x));
    terminalPoint.setAttribute("cy", String(lastPoint.y));
    terminalPoint.setAttribute("r", "2.4");
    terminalPoint.style.fill = lineColor;
    svg.appendChild(terminalPoint);

    return svg;
  }

  // =========================================================================================
  // === SECTION 2: BY MAP ===
  // =========================================================================================

  function renderMapTable(container, rows) {
    clearElement(container);

    const table = document.createElement("table");
    table.id = "map-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    // Column order: Map (icon + name + mode sub-label), Sets, W, L, D, Trend, Winrate. Trend
    // (index 5) is a plain non-sortable header — Task 15 fills its per-row <td> later.
    const columnLabels = [
      LABELS.tableMap,
      LABELS.tableSets,
      LABELS.tableWins,
      LABELS.tableLosses,
      LABELS.tableDraws,
      LABELS.tableTrend,
      LABELS.tableWinrate,
    ];
    const trendColumnIndex = 5;
    columnLabels.forEach(function (label, index) {
      if (index === trendColumnIndex) {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      } else {
        headerRow.appendChild(makeSortableHeader(table, index, label));
      }
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-sets", String(row.sets_played));
      const isThin = row.sets_played < STATE.minSets + 2;
      tr.appendChild(
        buildRowIconCell(row.map, prettyMode(row.mode), isThin, null, modeIconUrl(row.mode))
      );
      tr.appendChild(makeCell(String(row.sets_played)));
      tr.appendChild(makeCell(String(row.wins)));
      tr.appendChild(makeCell(String(row.losses)));
      tr.appendChild(makeCell(String(row.draws)));
      const trendCell = document.createElement("td");
      const sparkline = renderSparkline(row.rows || []);
      if (sparkline) {
        trendCell.appendChild(sparkline);
      }
      tr.appendChild(trendCell);
      tr.appendChild(buildWinrateCell(row.winrate));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  }

  // =========================================================================================
  // === SECTION 3: BY BRAWLER ===
  // =========================================================================================

  function renderBrawlerTable(container, rows) {
    clearElement(container);

    const table = document.createElement("table");
    table.id = "brawler-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    // Column order: Brawler (icon + name, no sub-label), Sets, W, L, D, Trend, Winrate. Trend
    // (index 5) is a plain non-sortable header — Task 15 fills its per-row <td> later.
    const columnLabels = [
      LABELS.tableBrawler,
      LABELS.tableSets,
      LABELS.tableWins,
      LABELS.tableLosses,
      LABELS.tableDraws,
      LABELS.tableTrend,
      LABELS.tableWinrate,
    ];
    const trendColumnIndex = 5;
    columnLabels.forEach(function (label, index) {
      if (index === trendColumnIndex) {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      } else {
        headerRow.appendChild(makeSortableHeader(table, index, label));
      }
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-sets", String(row.sets_played));
      const isThin = row.sets_played < STATE.minSets + 2;
      tr.appendChild(
        buildRowIconCell(
          row.brawler_name || String(row.brawler_id),
          null,
          isThin,
          null,
          brawlerIconUrl(row.brawler_name)
        )
      );
      tr.appendChild(makeCell(String(row.sets_played)));
      tr.appendChild(makeCell(String(row.wins)));
      tr.appendChild(makeCell(String(row.losses)));
      tr.appendChild(makeCell(String(row.draws)));
      const trendCell = document.createElement("td");
      const sparkline = renderSparkline(row.rows || []);
      if (sparkline) {
        trendCell.appendChild(sparkline);
      }
      tr.appendChild(trendCell);
      tr.appendChild(buildWinrateCell(row.winrate));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  }

  // =========================================================================================
  // === SECTION 4: TEAMMATES ===
  // =========================================================================================

  const TEAMMATE_PAGE_SIZE = 10;

  function buildTeammateRow(row) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-sets", String(row.sets_together));
    const isThin = row.sets_together < STATE.minSets + 2;

    // ROSTER badge logic preserved exactly (same condition/className/LABELS key as before this
    // task) — only its DOM attachment point changed, from a plain name <td> to this shared
    // icon-cell's label line, since every row now needs the same placeholder+label treatment.
    const extraBadgeEls = [];
    if (row.teammate_is_tracked) {
      const rosterBadge = document.createElement("span");
      rosterBadge.className = "badge-tracked";
      rosterBadge.textContent = LABELS.roster;
      extraBadgeEls.push(rosterBadge);

      // A "Liste" teammate is one of our own tracked players, so — same as the leaderboard rows
      // — click through to their individual stats, and prefer STATE.rosterIconByTag (the
      // players table's own icon_id) over the teammate view's, which is only populated from
      // that teammate's own recorded sets and so is often null/stale for tracked players.
      tr.className = "leaderboard-row";
      tr.addEventListener("click", function () {
        selectPlayer(row.teammate_tag);
      });
    }

    const iconId = row.teammate_is_tracked
      ? STATE.rosterIconByTag.get(row.teammate_tag) || row.teammate_icon_id
      : row.teammate_icon_id;

    tr.appendChild(
      buildRowIconCell(
        row.teammate_name || row.teammate_tag,
        null,
        isThin,
        extraBadgeEls,
        profileIconUrl(iconId),
        PLAYER_ICON_FALLBACK_URL
      )
    );
    tr.appendChild(makeCell(row.teammate_tag));
    tr.appendChild(makeCell(String(row.sets_together)));
    tr.appendChild(makeCell(String(row.wins)));
    const trendCell = document.createElement("td");
    const sparkline = renderSparkline(row.rows || []);
    if (sparkline) {
      trendCell.appendChild(sparkline);
    }
    tr.appendChild(trendCell);
    tr.appendChild(buildWinrateCell(row.winrate));
    return tr;
  }

  function renderTeammateTable(container, rows) {
    clearElement(container);

    const table = document.createElement("table");
    table.id = "teammate-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    // Column order: Teammate (icon + name, no sub-label), Tag, Sets together, W, Trend, Winrate.
    // Trend (index 4) is a plain non-sortable header — Task 15 fills its per-row <td> later.
    const columnLabels = [
      LABELS.tableTeammate,
      LABELS.tableTag,
      LABELS.tableSetsTogether,
      LABELS.tableWins,
      LABELS.tableTrend,
      LABELS.tableWinrate,
    ];
    const trendColumnIndex = 4;
    columnLabels.forEach(function (label, index) {
      if (index === trendColumnIndex) {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      } else {
        headerRow.appendChild(makeSortableHeader(table, index, label));
      }
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    container.appendChild(table);

    // --- pagination: only the first TEAMMATE_PAGE_SIZE rows render up front; the rest load in
    // --- chunks of the same size via the "load more" button appended below the table. ---
    let renderedCount = 0;

    const loadMoreButton = document.createElement("button");
    loadMoreButton.type = "button";
    loadMoreButton.className = "load-more-button";
    loadMoreButton.textContent = LABELS.loadMore;

    function updateLoadMoreVisibility() {
      loadMoreButton.style.display = renderedCount < rows.length ? "" : "none";
    }

    function loadNextPage() {
      rows.slice(renderedCount, renderedCount + TEAMMATE_PAGE_SIZE).forEach(function (row) {
        tbody.appendChild(buildTeammateRow(row));
      });
      renderedCount = Math.min(renderedCount + TEAMMATE_PAGE_SIZE, rows.length);
      updateLoadMoreVisibility();
      // Newly appended rows need the same min-sets filtering/counts already applied to the rows
      // loaded before them — applyMinSampleFilter()/friends only touch rows present in the DOM.
      applyMinSampleFilter();
      updateMinSetsHint();
      updatePanelRightText("teammate-panel", countFilteredOutRows("teammate-table"));
    }

    loadMoreButton.addEventListener("click", loadNextPage);

    loadNextPage();
    container.appendChild(loadMoreButton);
  }

