  // =========================================================================================
  // === COLLAPSIBLE PANEL ===
  // === `makeCollapsiblePanel({id, title, tint, rightText, bodyEl})` builds a reusable
  // === `<section class="panel">` (header + body) that Tasks 10/14 wrap the map/brawler/teammate/
  // === recent sections in. Collapse/expand state lives in `STATE.collapsed[id]` (global STATE
  // === from the DATA LAYER section above) so a later `renderAll()` re-render can call this again
  // === without resetting a panel the user had collapsed. `STATE.collapsed[id] === true` means the
  // === panel is currently collapsed (body hidden); `false` or absent (the default) means expanded.
  // === Toggling is a pure class/attribute flip — `options.bodyEl`'s inner DOM is never touched,
  // === so sort state on `<th data-order>` elsewhere in the app survives a collapse/expand cycle.
  // =========================================================================================

  function makeCollapsiblePanel(options) {
    const panelId = options.id;

    if (STATE.collapsed[panelId] === undefined) {
      STATE.collapsed[panelId] = false;
    }

    const panel = document.createElement("section");
    panel.className = "panel";
    panel.id = panelId;

    const header = document.createElement("div");
    header.className = "panel-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.style.background = "linear-gradient(100deg, " + options.tint + ", var(--panel) 70%)";

    const chevron = document.createElement("span");
    chevron.className = "panel-chevron";

    const title = document.createElement("div");
    title.className = "panel-title";
    title.textContent = options.title;

    const rightText = document.createElement("span");
    rightText.className = "panel-right-text";
    rightText.textContent = options.rightText;

    header.appendChild(chevron);
    header.appendChild(title);
    header.appendChild(rightText);

    const body = document.createElement("div");
    body.className = "panel-body";
    body.appendChild(options.bodyEl);

    panel.appendChild(header);
    panel.appendChild(body);

    function updatePanelState() {
      const isCollapsed = STATE.collapsed[panelId] === true;
      chevron.textContent = isCollapsed ? "▸" : "▾";
      header.setAttribute("aria-expanded", String(!isCollapsed));
      panel.classList.toggle("panel-collapsed", isCollapsed);
    }

    function togglePanel() {
      STATE.collapsed[panelId] = STATE.collapsed[panelId] === true ? false : true;
      updatePanelState();
    }

    function handleHeaderClick() {
      togglePanel();
    }

    function handleHeaderKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      togglePanel();
    }

    header.addEventListener("click", handleHeaderClick);
    header.addEventListener("keydown", handleHeaderKeydown);

    updatePanelState();

    return panel;
  }

  // =========================================================================================
  // === SORT HELPER ===
  // === Mirrors the click-to-sort pattern from docs/script.js:3-21 (toggle asc/desc via a
  // === data-order attribute on the clicked header cell, parseFloat compare when both cells in
  // === the column are numeric, otherwise localeCompare) — generalized here to take an arbitrary
  // === table element and column index instead of a single hardcoded table id.
  // =========================================================================================

  function sortTableByColumn(table, columnIndex) {
    const headerRow = table.tHead.rows[0];
    const headerCell = headerRow.cells[columnIndex];
    const isAscending = headerCell.getAttribute("data-order") === "asc";
    const rows = Array.from(table.tBodies[0].rows);

    rows.sort(function (rowA, rowB) {
      const textA = rowA.cells[columnIndex].textContent.trim();
      const textB = rowB.cells[columnIndex].textContent.trim();
      const numA = parseFloat(textA.replace(/[%\s]/g, ""));
      const numB = parseFloat(textB.replace(/[%\s]/g, ""));
      if (!isNaN(numA) && !isNaN(numB)) {
        return isAscending ? numA - numB : numB - numA;
      }
      return isAscending ? textA.localeCompare(textB) : textB.localeCompare(textA);
    });

    rows.forEach(function (row) {
      table.tBodies[0].appendChild(row);
    });

    for (let i = 0; i < headerRow.cells.length; i++) {
      if (i !== columnIndex) {
        headerRow.cells[i].removeAttribute("data-order");
      }
    }
    headerCell.setAttribute("data-order", isAscending ? "desc" : "asc");
  }

  function makeSortableHeader(table, columnIndex, label) {
    const th = document.createElement("th");
    th.textContent = label;
    th.addEventListener("click", function () {
      sortTableByColumn(table, columnIndex);
    });
    return th;
  }

  // =========================================================================================
  // === MIN-SAMPLE FILTER ===
  // === Client-side only: every filterable row carries a data-sets attribute with the row's
  // === sample size, set once at render time. Changing the threshold input just toggles the
  // === "filtered-out" class on already-rendered rows — no re-query.
  // =========================================================================================

  function applyMinSampleFilter() {
    const minSampleInput = document.getElementById("min-sample-input");
    const threshold = parseInt(minSampleInput.value, 10) || 0;
    const filterableTableIds = ["map-table", "brawler-table", "teammate-table"];

    filterableTableIds.forEach(function (tableId) {
      const table = document.getElementById(tableId);
      if (!table || !table.tBodies[0]) {
        return;
      }
      const rows = Array.from(table.tBodies[0].rows);
      rows.forEach(function (row) {
        const rowSampleSize = parseInt(row.getAttribute("data-sets"), 10) || 0;
        if (rowSampleSize < threshold) {
          row.classList.add("filtered-out");
        } else {
          row.classList.remove("filtered-out");
        }
      });
    });
  }

  function updateMinSetsHint() {
    if (STATE.tag === null) {
      const hintEl = document.getElementById("min-sample-hint");
      // The leaderboard's "N spillere ekskludert" wording only makes sense for the Leaderboard
      // view (computeLeaderboardRows tracks an excluded-player count) — computeGlobalMapRows
      // (Kart view) just silently drops below-threshold maps with no count to report, so the hint
      // stays blank there rather than showing a stale/misleading leaderboard number.
      hintEl.textContent =
        STATE.browseView === "maps"
          ? ""
          : STATE.leaderboardExcludedCount + " " + LABELS.leaderboardExcludedSuffix;
      return;
    }

    const filterableTableIds = ["map-table", "brawler-table", "teammate-table"];
    let hiddenCount = 0;

    filterableTableIds.forEach(function (tableId) {
      const table = document.getElementById(tableId);
      if (!table || !table.tBodies[0]) {
        return;
      }
      hiddenCount += table.querySelectorAll("tr.filtered-out").length;
    });

    const hintEl = document.getElementById("min-sample-hint");
    hintEl.textContent = hiddenCount + " " + LABELS.rowsHiddenSuffix;
  }

  // === Task 10: per-panel "N rader over grensen" counts (the collapsible panels' own right-side
  // === text, distinct from the slider's single combined `#min-sample-hint`, above). Both read the
  // === same `.filtered-out` classes `applyMinSampleFilter()` already maintains — neither of these
  // === 2 helpers ever toggles that class itself. ===

  function countFilteredOutRows(tableId) {
    return document.querySelectorAll("#" + tableId + " tbody tr.filtered-out").length;
  }

  function updatePanelRightText(panelId, count) {
    const rightTextEl = document.querySelector("#" + panelId + " .panel-right-text");
    if (!rightTextEl) {
      return;
    }
    rightTextEl.textContent = count + " " + LABELS.rowsOverThreshold;
  }

  function onMinSetsInput() {
    const minSampleInput = document.getElementById("min-sample-input");
    STATE.minSets = parseInt(minSampleInput.value, 10);
    document.getElementById("min-sample-value").textContent = String(STATE.minSets);
    renderAll();
  }

  document.getElementById("min-sample-input").addEventListener("input", onMinSetsInput);

