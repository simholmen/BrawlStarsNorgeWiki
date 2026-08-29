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

      // Only clickable when a qualifying row backs the card — an empty "—" callout has no map to
      // open a preview for. Same role/tabindex/click+Enter/Space pattern as the map table's own
      // clickable-row rows just above.
      if (row) {
        card.classList.add("callout-card--clickable");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.title = LABELS.clickForMapPreview;
        card.setAttribute("aria-label", LABELS.clickForMapPreview);
        card.addEventListener("click", function () {
          openMapPreviewModal(card, row.mode, row.map, row.rows, true);
        });
        card.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          openMapPreviewModal(card, row.mode, row.map, row.rows, true);
        });
      }

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

  // Builds the bar+percentage pair alone (a DocumentFragment, no wrapping element) so both
  // buildWinrateCell (<td>, the map/brawler/teammate tables) and the map-preview modal's
  // buildMapPreviewRow (a plain <div>, stats-recent-matches.js) can share the exact same markup
  // without one of them dragging in a stray <td> outside a table.
  function buildWinrateBarContent(winrate) {
    const fragment = document.createDocumentFragment();
    const tone = winrateTone(winrate) || "var(--text-muted-4)";
    const barPercent = winrate === null || winrate === undefined ? 0 : winrate * 100;

    const barTrack = document.createElement("div");
    barTrack.className = "winrate-bar-track";
    const barFill = document.createElement("div");
    barFill.className = "winrate-bar-fill";
    barFill.style.width = barPercent + "%";
    barFill.style.background = tone;
    barTrack.appendChild(barFill);
    fragment.appendChild(barTrack);

    // The percentage is a real, standalone text node (not embedded inside the bar) — required so
    // `sortTableByColumn`'s `cell.textContent` read still yields exactly the "NN.N%" string.
    const textEl = document.createElement("span");
    textEl.className = "winrate-bar-text";
    textEl.textContent = formatWinrate(winrate);
    textEl.style.color = tone;
    fragment.appendChild(textEl);

    return fragment;
  }

  function buildWinrateCell(winrate) {
    const cell = document.createElement("td");
    cell.appendChild(buildWinrateBarContent(winrate));
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

  const MAP_PAGE_SIZE = 10;

  // =========================================================================================
  // === SORTABLE + PAGINATED TABLE (shared by every "load more" table that's also sortable:
  // === renderMapTable, renderTeammateTable, renderExpandBrawlerTable, renderGlobalBrawlerListTable
  // === below) ===
  // === Unlike makeSortableHeader/sortTableByColumn (stats-panels.js — still used by
  // === renderBrawlerTable, the one sortable table that's NOT paginated), a header click here
  // === re-sorts the FULL `config.rows` array and re-renders from page 1, not just whichever rows
  // === happened to already be in the DOM — same "sort before paginating, not after" fix
  // === renderLeaderboard's own sortLeaderboardRows (stats-leaderboard.js) already applies for the
  // === leaderboard table. Sorting DOM text (the old approach) silently ignored every row not yet
  // === loaded via "load more", which is exactly the bug this fixes.
  // ===
  // === config: {
  // ===   container, tableId (optional), className (optional),
  // ===   rows: array (this function copies it — the caller's own array is never mutated/reordered),
  // ===   pageSize: number,
  // ===   columns: [{ label, field: fn(row) => string|number|null, or omitted for an unsortable
  // ===              column (e.g. Trend) }],
  // ===   buildRowFn: fn(row) => <tr>,
  // ===   emptyText: string,
  // ===   onPageRendered: fn() (optional — called after the initial render AND every "load more"
  // ===                        click, e.g. the map/teammate tables' own min-sample-filter re-run)
  // === }
  // =========================================================================================

  function compareSortableTableValues(valueA, valueB) {
    const normalizedA = valueA === null || valueA === undefined ? -Infinity : valueA;
    const normalizedB = valueB === null || valueB === undefined ? -Infinity : valueB;
    if (typeof normalizedA === "number" && typeof normalizedB === "number") {
      return normalizedA - normalizedB;
    }
    return String(normalizedA).localeCompare(String(normalizedB));
  }

  function renderSortableTable(config) {
    clearElement(config.container);

    const rows = config.rows.slice();
    const sortState = { columnIndex: null, direction: null };

    const table = document.createElement("table");
    if (config.tableId) {
      table.id = config.tableId;
    }
    if (config.className) {
      table.className = config.className;
    }

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const tbody = document.createElement("tbody");

    let renderedCount = 0;

    const loadMoreButton = document.createElement("button");
    loadMoreButton.type = "button";
    loadMoreButton.className = "load-more-button";
    loadMoreButton.textContent = LABELS.loadMore;

    function updateLoadMoreVisibility() {
      loadMoreButton.style.display = renderedCount < rows.length ? "" : "none";
    }

    function loadNextPage() {
      rows.slice(renderedCount, renderedCount + config.pageSize).forEach(function (row) {
        tbody.appendChild(config.buildRowFn(row));
      });
      renderedCount = Math.min(renderedCount + config.pageSize, rows.length);
      updateLoadMoreVisibility();
      if (config.onPageRendered) {
        config.onPageRendered();
      }
    }

    function handleSort(columnIndex) {
      if (rows.length === 0) {
        return;
      }
      if (sortState.columnIndex === columnIndex) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState.columnIndex = columnIndex;
        sortState.direction = "desc";
      }
      Array.from(headerRow.children).forEach(function (headerCell, index) {
        if (index === columnIndex) {
          headerCell.setAttribute("data-order", sortState.direction);
        } else {
          headerCell.removeAttribute("data-order");
        }
      });

      const field = config.columns[columnIndex].field;
      const multiplier = sortState.direction === "asc" ? 1 : -1;
      rows.sort(function (rowA, rowB) {
        return multiplier * compareSortableTableValues(field(rowA), field(rowB));
      });

      // Re-render however many rows were ALREADY loaded (not just one page) — collapsing back to
      // page 1 after someone had clicked "load more" a few times shrinks the table dramatically,
      // which reads as a jarring layout jump (especially on mobile, where it can yank the header
      // the user just tapped clean off screen). Sorting should reorder what's visible, not also
      // silently re-paginate it.
      const previouslyVisibleCount = renderedCount;
      clearElement(tbody);
      renderedCount = 0;
      rows.slice(0, previouslyVisibleCount).forEach(function (row) {
        tbody.appendChild(config.buildRowFn(row));
      });
      renderedCount = Math.min(previouslyVisibleCount, rows.length);
      updateLoadMoreVisibility();
      if (config.onPageRendered) {
        config.onPageRendered();
      }
    }

    config.columns.forEach(function (column, index) {
      const th = document.createElement("th");
      th.textContent = column.label;
      if (column.field) {
        th.addEventListener("click", function () {
          handleSort(index);
        });
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    table.appendChild(tbody);
    config.container.appendChild(table);

    if (rows.length === 0) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = config.columns.length;
      emptyCell.className = "status empty";
      emptyCell.textContent = config.emptyText;
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }

    loadMoreButton.addEventListener("click", loadNextPage);

    loadNextPage();
    config.container.appendChild(loadMoreButton);
  }

  // === INLINE EXPAND ROWS (Felles/Statistikk global map + brawler tables only) ===
  // === Clicking a global-map-table row used to open the same top-5-brawlers modal the per-player
  // === Map table still uses (openMapPreviewModal) — it now instead expands an inline row directly
  // === beneath it, and the new global-brawler-table (stats-leaderboard.js) reuses the exact same
  // === mechanics for its own "which brawlers has this one faced, and how did it do" matchup
  // === breakdown. Both share: renderExpandBrawlerTable (a paginated, sortable brawler table built
  // === from pre-aggregated rows), toggleExpandRow (the open/close-one-at-a-time accordion), and
  // === the .expand-row/.expand-content/.expand-table-wrap/.expand-image CSS (stats.css) — only
  // === the "which rows to aggregate" step and the right-hand image differ per caller. isPersonal
  // === is still passed through from buildMapRow below, so the per-player Map table (isPersonal
  // === true, still just the selected player's own picks, still opens the modal) is untouched.
  // =========================================================================================

  const EXPAND_BRAWLER_PAGE_SIZE = 10;

  // Shared Brawler/Sett/Seire/Tap/Uavgjort/Trend/Winrate column set — renderExpandBrawlerTable,
  // renderGlobalBrawlerListTable, and renderBrawlerTable (SECTION 3 below) all show this exact
  // shape, just from different row sources. Trend has no `field` (renderSortableTable/
  // makeSortableHeader both treat that as "not sortable" — there's no single value to compare a
  // sparkline by).
  function brawlerTableColumns() {
    return [
      {
        label: LABELS.tableBrawler,
        field: function (row) {
          return row.brawler_name || String(row.brawler_id);
        },
      },
      {
        label: LABELS.tableSets,
        field: function (row) {
          return row.sets_played;
        },
      },
      {
        label: LABELS.tableWins,
        field: function (row) {
          return row.wins;
        },
      },
      {
        label: LABELS.tableLosses,
        field: function (row) {
          return row.losses;
        },
      },
      {
        label: LABELS.tableDraws,
        field: function (row) {
          return row.draws;
        },
      },
      { label: LABELS.tableTrend },
      {
        label: LABELS.tableWinrate,
        field: function (row) {
          return row.winrate;
        },
      },
    ];
  }

  // Renders a paginated, sortable Brawler/Sett/Seire/Tap/Uavgjort/Trend/Winrate table from
  // ALREADY aggregated+filtered `brawlerRows` (buildMapExpandBrawlerRows or
  // buildBrawlerExpandOpponentRows below build that shape) into `container` — a plain, un-ided
  // `<table>` per call (renderBrawlerTable's own `#brawler-table` id is already claimed by the
  // hidden-but-present per-player Brawler section) reusing buildBrawlerRow for each row. Paginated
  // EXPAND_BRAWLER_PAGE_SIZE at a time via renderSortableTable, since either breakdown (every map
  // participant, or every brawler a brawler has faced) can easily clear 20-30+ qualifying rows —
  // a header click re-sorts ALL of them, not just whichever page happens to be loaded.
  function renderExpandBrawlerTable(container, brawlerRows) {
    renderSortableTable({
      container: container,
      className: "expand-table",
      rows: brawlerRows,
      pageSize: EXPAND_BRAWLER_PAGE_SIZE,
      columns: brawlerTableColumns(),
      buildRowFn: buildBrawlerRow,
      emptyText: LABELS.noSetsRecorded,
    });
  }

  // === MAP → BRAWLER BREAKDOWN ===
  // Same row shape renderExpandBrawlerTable needs (brawler_id/brawler_name/sets_played/wins/
  // losses/draws/winrate/rows) as renderAll()'s own per-player Brawler bridge builds — just
  // aggregated from one map's worth of set PARTICIPANTS instead of the whole filtered set.
  // `trackedRows` is the map row's own already-filtered rows (its `group.rows` from
  // computeGlobalMapRows — tracked players' own picks only), used ONLY to collect which sets this
  // breakdown covers (their `set_id`s already carry every mode/period/rank filter the sidebar
  // applied); the actual brawlers aggregated below come from STATE.allParticipantRows filtered
  // down to just those sets, so teammates' and opponents' picks are counted too, not just our own
  // roster's. Sorted winrate desc (sets desc tiebreak), matching computeTopBrawlerWinrates' own
  // ranking. Brawlers below STATE.minSets are excluded outright (not just thin-badged) — same
  // "excluded from consideration" instinct as computeGlobalMapRows/computeTopBrawlerWinrates, and
  // what makes the sidebar's min-sets slider actually mean something here instead of just
  // decorating rows.
  function buildMapExpandBrawlerRows(trackedRows) {
    const setIds = new Set((trackedRows || []).map(function (row) { return row.set_id; }));
    const participantRows = STATE.allParticipantRows.filter(function (row) {
      return setIds.has(row.set_id);
    });

    const brawlerGroups = aggregate(
      participantRows,
      function (row) {
        return row.brawler_id;
      },
      function (row) {
        return row.brawler_name || String(row.brawler_id);
      }
    );
    const brawlerRows = brawlerGroups
      .filter(function (group) {
        return group.sets >= STATE.minSets;
      })
      .map(function (group) {
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
      const winrateA = rowA.winrate === null ? -1 : rowA.winrate;
      const winrateB = rowB.winrate === null ? -1 : rowB.winrate;
      if (winrateB !== winrateA) {
        return winrateB - winrateA;
      }
      return rowB.sets_played - rowA.sets_played;
    });
    return brawlerRows;
  }

  // Team-level win/loss is symmetric, not shared — the team that didn't win B's row.result lost,
  // and vice versa (a draw stays a draw). Needed because buildBrawlerExpandOpponentRows below
  // reports each OPPONENT's own record against B, not B's record against them.
  function invertResult(result) {
    if (result === "win") {
      return "loss";
    }
    if (result === "loss") {
      return "win";
    }
    return result;
  }

  // === BRAWLER → OPPONENT MATCHUP BREAKDOWN ===
  // For a clicked brawler B, `trackedRows` (row.rows from computeGlobalBrawlerRows — tracked
  // roster's own picks of B, already mode/period/rank/filtered) names which sets to look at. For
  // each of THOSE picks, every OTHER set participant (from STATE.allParticipantRows, team_index
  // included in that fetch specifically for this) on the OPPOSING team_index is one "this brawler
  // faced B" instance. Its outcome is invertResult(B's own pick's result) — "what brawlers have
  // the highest winrate AGAINST B" means each opponent's OWN win/loss, the mirror image of B's
  // (a team-level result, so it applies to every cross-team pairing from that same set) — a 3v3
  // set therefore contributes up to 3 matchup instances per pick of B. Same shape/filter/sort as
  // buildMapExpandBrawlerRows above (STATE.minSets excludes outright, winrate desc / sets desc).
  function buildBrawlerExpandOpponentRows(trackedRows) {
    const setIds = new Set((trackedRows || []).map(function (row) { return row.set_id; }));
    const participantsBySet = new Map();
    STATE.allParticipantRows.forEach(function (row) {
      if (!setIds.has(row.set_id)) {
        return;
      }
      if (!participantsBySet.has(row.set_id)) {
        participantsBySet.set(row.set_id, []);
      }
      participantsBySet.get(row.set_id).push(row);
    });

    const matchupRows = [];
    (trackedRows || []).forEach(function (row) {
      const participants = participantsBySet.get(row.set_id) || [];
      participants.forEach(function (participant) {
        if (participant.team_index === row.team_index) {
          return;
        }
        matchupRows.push({
          brawler_id: participant.brawler_id,
          brawler_name: participant.brawler_name,
          result: invertResult(row.result),
          ended_at: row.ended_at,
        });
      });
    });

    const brawlerGroups = aggregate(
      matchupRows,
      function (row) {
        return row.brawler_id;
      },
      function (row) {
        return row.brawler_name || String(row.brawler_id);
      }
    );
    const brawlerRows = brawlerGroups
      .filter(function (group) {
        return group.sets >= STATE.minSets;
      })
      .map(function (group) {
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
      const winrateA = rowA.winrate === null ? -1 : rowA.winrate;
      const winrateB = rowB.winrate === null ? -1 : rowB.winrate;
      if (winrateB !== winrateA) {
        return winrateB - winrateA;
      }
      return rowB.sets_played - rowA.sets_played;
    });
    return brawlerRows;
  }

  // Shared by buildMapExpandRow/buildBrawlerExpandRow below — the common "table on the left,
  // 160x210 image on the right" shell, `colSpan` matching whichever 7-column table (map or
  // brawler) the caller's row belongs to. `renderTableFn(tableWrap)` does the caller-specific
  // aggregation + renderExpandBrawlerTable call; `applyImage(imageEl)` sets the caller-specific
  // background (a map screenshot vs a brawler portrait).
  function buildExpandRow(colSpan, renderTableFn, applyImage) {
    const expandTr = document.createElement("tr");
    expandTr.className = "expand-row";

    const td = document.createElement("td");
    td.colSpan = colSpan;

    const content = document.createElement("div");
    content.className = "expand-content";

    const tableWrap = document.createElement("div");
    tableWrap.className = "expand-table-wrap";
    renderTableFn(tableWrap);
    content.appendChild(tableWrap);

    if (applyImage) {
      const imageEl = document.createElement("div");
      imageEl.className = "expand-image";
      applyImage(imageEl);
      content.appendChild(imageEl);
    }

    td.appendChild(content);
    expandTr.appendChild(td);
    return expandTr;
  }

  // Built fresh on every open (never cached) — trackedRows is already the exact row.rows this map
  // row aggregates (tracked players' own picks), same input openMapPreviewModal used to take;
  // buildMapExpandBrawlerRows above only uses it to find which sets to pull EVERY participant's
  // brawler for. setMapVisualImage (stats-dom-utils.js) fills in the background-image
  // asynchronously, same "start blank, swap in once the map-image index resolves" pattern the
  // modal's own .rm-map used.
  function buildMapExpandRow(mode, map, trackedRows) {
    return buildExpandRow(
      7,
      function (tableWrap) {
        renderExpandBrawlerTable(tableWrap, buildMapExpandBrawlerRows(trackedRows || []));
      },
      function (imageEl) {
        setMapVisualImage(imageEl, mode, map);
      }
    );
  }

  // Built fresh on every open (never cached) — same trackedRows contract as buildMapExpandRow
  // above, just for one brawler's own picks instead of one map's. No right-hand image (unlike the
  // map breakdown) — the opponent table gets the full width instead.
  function buildBrawlerExpandRow(trackedRows) {
    return buildExpandRow(
      7,
      function (tableWrap) {
        renderExpandBrawlerTable(tableWrap, buildBrawlerExpandOpponentRows(trackedRows || []));
      },
      null
    );
  }

  // Accordion toggle shared by the global map and global brawler tables: opening a row's
  // breakdown first closes whichever OTHER row's breakdown was open in the same table (there's
  // only ever one of either table on screen at a time, but this stays scoped to `tr`'s own table
  // rather than assuming that), then inserts/removes this row's own via `buildExpandTr()`.
  // Clicking an already-open row just closes it.
  function toggleExpandRow(tr, buildExpandTr) {
    const table = tr.closest("table");
    const wasThisRowOpen = tr.classList.contains("expand-open");

    const existingExpand = table.querySelector("tr.expand-row");
    if (existingExpand) {
      existingExpand.remove();
    }
    table.querySelectorAll("tr.expand-open").forEach(function (openTr) {
      openTr.classList.remove("expand-open");
    });

    if (wasThisRowOpen) {
      return;
    }

    tr.classList.add("expand-open");
    tr.after(buildExpandTr());
  }

  // Clicking a per-player Map row (isPersonal true) still opens the top-5-brawlers modal
  // (openMapPreviewModal); a Felles/Statistikk global-map-table row (isPersonal false) instead
  // toggles the inline breakdown above. Same role/tabindex/click+Enter/Space pattern
  // buildRecentRow uses for match rows.
  function buildMapRow(row, isPersonal) {
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

    tr.className = "clickable-row";
    tr.setAttribute("role", "button");
    tr.tabIndex = 0;
    tr.title = LABELS.clickForMapPreview;
    tr.setAttribute("aria-label", LABELS.clickForMapPreview);

    function handleActivate() {
      if (isPersonal) {
        openMapPreviewModal(tr, row.mode, row.map, row.rows, isPersonal);
        return;
      }
      toggleExpandRow(tr, function () {
        return buildMapExpandRow(row.mode, row.map, row.rows);
      });
    }
    tr.addEventListener("click", handleActivate);
    tr.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handleActivate();
    });

    return tr;
  }

  // === GLOBAL BRAWLER TABLE (Felles/Statistikk view) — clickable rows, each toggling that
  // === brawler's own opponent-matchup breakdown (buildBrawlerExpandRow/toggleExpandRow above).
  // === Builds on buildBrawlerRow's own cell markup (identical Brawler/Sett/Seire/Tap/Uavgjort/
  // === Trend/Winrate columns to the per-player Brawler table) rather than duplicating it, adding
  // === only the click/keyboard affordances — same "wrap the plain row builder" relationship
  // === buildMapRow has to renderMapTable's shared column set. ===
  function buildGlobalBrawlerRow(row) {
    const tr = buildBrawlerRow(row);
    tr.className = "clickable-row";
    tr.setAttribute("role", "button");
    tr.tabIndex = 0;
    tr.title = LABELS.clickForBrawlerMatchups;
    tr.setAttribute("aria-label", LABELS.clickForBrawlerMatchups);

    function handleActivate() {
      toggleExpandRow(tr, function () {
        return buildBrawlerExpandRow(row.rows);
      });
    }
    tr.addEventListener("click", handleActivate);
    tr.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handleActivate();
    });

    return tr;
  }

  const GLOBAL_BRAWLER_PAGE_SIZE = 10;

  // Top-level table for the new Brawler (alle spillere) section — same header/pagination shape as
  // renderMapTable, just with buildGlobalBrawlerRow's clickable rows instead of buildMapRow's, and
  // the shared brawlerTableColumns() field set (same as renderExpandBrawlerTable/renderBrawlerTable)
  // so a header click re-sorts every qualifying brawler, not just the loaded page. Always "global"
  // (`rows` already comes from computeGlobalBrawlerRows, tracked roster only) — there's no
  // per-player equivalent of this table to disambiguate against, so unlike renderMapTable this
  // always renders into the one `#global-brawler-table` id.
  function renderGlobalBrawlerListTable(container, rows) {
    renderSortableTable({
      container: container,
      tableId: "global-brawler-table",
      rows: rows,
      pageSize: GLOBAL_BRAWLER_PAGE_SIZE,
      columns: brawlerTableColumns(),
      buildRowFn: buildGlobalBrawlerRow,
      emptyText: LABELS.noSetsRecorded,
    });
  }

  // `tableId` defaults to "map-table" (the per-player Map section) — the Felles-page global map
  // table (stats-leaderboard.js) passes "global-map-table" instead so the 2 tables, both present
  // in the DOM at once (just never both visible), never collide on id. `isPersonal` is passed
  // straight through to buildMapRow/openMapPreviewModal (true from the per-player caller, false
  // from the Felles-page caller) — see the MAP PREVIEW MODAL comment in stats-recent-matches.js.
  // Paginated MAP_PAGE_SIZE at a time via renderSortableTable (a header click re-sorts every
  // qualifying map, not just the loaded page) — only the personal (map-table) case re-runs the
  // min-sample-filter/panel-count refresh on each page render (applyMinSampleFilter/
  // updateMinSetsHint/updatePanelRightText); the Felles global table was never wired into that
  // system (computeGlobalMapRows, stats-state.js, already excludes below-threshold rows outright
  // instead of rendering-then-hiding them), so isPersonal false skips it rather than showing a
  // stale/misleading "0 rader over grensen" on that panel.
  function renderMapTable(container, rows, tableId, isPersonal) {
    renderSortableTable({
      container: container,
      tableId: tableId || "map-table",
      rows: rows,
      pageSize: MAP_PAGE_SIZE,
      columns: [
        { label: LABELS.tableMap, field: function (row) { return row.map; } },
        { label: LABELS.tableSets, field: function (row) { return row.sets_played; } },
        { label: LABELS.tableWins, field: function (row) { return row.wins; } },
        { label: LABELS.tableLosses, field: function (row) { return row.losses; } },
        { label: LABELS.tableDraws, field: function (row) { return row.draws; } },
        { label: LABELS.tableTrend },
        { label: LABELS.tableWinrate, field: function (row) { return row.winrate; } },
      ],
      buildRowFn: function (row) {
        return buildMapRow(row, isPersonal);
      },
      emptyText: LABELS.noSetsRecorded,
      onPageRendered: isPersonal
        ? function () {
            applyMinSampleFilter();
            updateMinSetsHint();
            updatePanelRightText("map-panel", countFilteredOutRows("map-table"));
          }
        : undefined,
    });
  }

  // =========================================================================================
  // === SECTION 3: BY BRAWLER ===
  // =========================================================================================

  // Extracted out of renderBrawlerTable's own forEach so renderExpandBrawlerTable and
  // buildGlobalBrawlerRow (stats-tables.js's INLINE EXPAND ROWS / GLOBAL BRAWLER TABLE sections
  // below) can build the exact same row markup — for a map's brawler breakdown, a brawler's
  // opponent-matchup breakdown, and the top-level global Brawler table itself — not just the full
  // per-player Brawler table.
  function buildBrawlerRow(row) {
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
    return tr;
  }

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
      tbody.appendChild(buildBrawlerRow(row));
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

  // Column order: Teammate (icon + name, no sub-label), Tag, Sets together, W, Trend, Winrate.
  // Paginated TEAMMATE_PAGE_SIZE at a time via renderSortableTable — a header click re-sorts every
  // qualifying teammate, not just the loaded page. Newly rendered pages need the same min-sets
  // filtering/counts already applied to the rows loaded before them — applyMinSampleFilter()/
  // friends only touch rows present in the DOM — so onPageRendered re-runs them after every page
  // (initial render AND each "load more"/sort).
  function renderTeammateTable(container, rows) {
    renderSortableTable({
      container: container,
      tableId: "teammate-table",
      rows: rows,
      pageSize: TEAMMATE_PAGE_SIZE,
      columns: [
        {
          label: LABELS.tableTeammate,
          field: function (row) {
            return row.teammate_name || row.teammate_tag;
          },
        },
        { label: LABELS.tableTag, field: function (row) { return row.teammate_tag; } },
        { label: LABELS.tableSetsTogether, field: function (row) { return row.sets_together; } },
        { label: LABELS.tableWins, field: function (row) { return row.wins; } },
        { label: LABELS.tableTrend },
        { label: LABELS.tableWinrate, field: function (row) { return row.winrate; } },
      ],
      buildRowFn: buildTeammateRow,
      emptyText: LABELS.noSetsRecorded,
      onPageRendered: function () {
        applyMinSampleFilter();
        updateMinSetsHint();
        updatePanelRightText("teammate-panel", countFilteredOutRows("teammate-table"));
      },
    });
  }

