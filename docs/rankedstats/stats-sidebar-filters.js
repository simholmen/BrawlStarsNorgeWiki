  // =========================================================================================
  // === SIDEBAR FILTERS: BRAWLER CLASS TREE ===
  // === `renderBrawlerTree()` is a pure DOM-rebuild function called from renderAll() on every
  // === render, same convention as renderModeChips/renderPeriodChips below — no network requests.
  // === The tree is built from STATE.setRows filtered by mode+period+rank (via the local
  // === `filterByModeAndPeriod` helper, a deliberate small duplication of applyFilters' period/mode
  // === logic) — never by STATE.filter itself, since that would collapse the tree to a single row.
  // === Selecting a class or brawler writes STATE.filter in the exact `{kind, value}` shape
  // === applyFilters/renderFilterBar already expect (Task 8's contract); the chevron only ever
  // === touches STATE.expandedClasses, never STATE.filter.
  // =========================================================================================

  function filterByModeAndPeriod(rows) {
    let filteredRows = rows;

    const cutoffDate = periodCutoffDate();
    if (cutoffDate !== null) {
      filteredRows = filteredRows.filter(function (row) {
        return new Date(row.ended_at) >= cutoffDate;
      });
    }

    if (STATE.mode !== "All modes") {
      filteredRows = filteredRows.filter(function (row) {
        return row.mode === STATE.mode;
      });
    }

    if (STATE.rankFilter !== null) {
      filteredRows = filteredRows.filter(function (row) {
        return row.tier_name === STATE.rankFilter;
      });
    }

    return filteredRows;
  }

  // === Same mode+period base as `filterByModeAndPeriod` (duplicated rather than reused, since
  // === that helper also applies STATE.rankFilter — deliberately excluded here), plus the active
  // === brawler/class filter — used only to build the RANK tree below, so that tree reflects any
  // === brawler/class already selected but never collapses to a single row from its own rank
  // === selection. ===
  function filterByModePeriodAndBrawler(rows) {
    let filteredRows = rows;

    const cutoffDate = periodCutoffDate();
    if (cutoffDate !== null) {
      filteredRows = filteredRows.filter(function (row) {
        return new Date(row.ended_at) >= cutoffDate;
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

    return filteredRows;
  }

  function currentTreeRows() {
    return STATE.tag === null ? STATE.allSetRows : STATE.setRows;
  }

  function buildBrawlerClassGroups() {
    const brawlerAggregates = aggregate(
      filterByModeAndPeriod(currentTreeRows()),
      function (row) {
        return row.brawler_id;
      },
      function (row) {
        return row.brawler_name || String(row.brawler_id);
      }
    );

    const groupsByClass = new Map();
    brawlerAggregates.forEach(function (brawlerAggregate) {
      const className = BRAWLER_CLASSES[brawlerAggregate.key] || "Unclassified";
      if (!groupsByClass.has(className)) {
        groupsByClass.set(className, { sets: 0, wins: 0, losses: 0, brawlers: [] });
      }
      const classTotals = groupsByClass.get(className);
      classTotals.sets += brawlerAggregate.sets;
      classTotals.wins += brawlerAggregate.wins;
      classTotals.losses += brawlerAggregate.losses;
      classTotals.brawlers.push(brawlerAggregate);
    });

    const orderedGroups = [];
    BRAWLER_CLASS_ORDER.forEach(function (className) {
      const classTotals = groupsByClass.get(className);
      if (!classTotals || classTotals.sets === 0) {
        return;
      }

      const winrate =
        classTotals.wins + classTotals.losses === 0
          ? null
          : classTotals.wins / (classTotals.wins + classTotals.losses);

      const sortedBrawlers = classTotals.brawlers.slice().sort(function (brawlerA, brawlerB) {
        return brawlerB.sets - brawlerA.sets;
      });

      orderedGroups.push({
        className: className,
        sets: classTotals.sets,
        winrate: winrate,
        brawlers: sortedBrawlers,
      });
    });

    return orderedGroups;
  }

  function buildBrawlerRow(brawlerAggregate) {
    const isActive =
      STATE.filter.kind === "brawler" && STATE.filter.value === brawlerAggregate.key;

    const row = document.createElement("div");
    row.className = isActive ? "tree-brawler-row active" : "tree-brawler-row";
    row.addEventListener("click", function () {
      STATE.filter = isActive
        ? { kind: null, value: null }
        : { kind: "brawler", value: brawlerAggregate.key };
      renderAll();
    });

    const nameEl = document.createElement("span");
    nameEl.className = "tree-brawler-name";
    nameEl.textContent = brawlerAggregate.label;
    row.appendChild(nameEl);

    const setsEl = document.createElement("span");
    setsEl.className = "tree-brawler-sets";
    setsEl.textContent = brawlerAggregate.sets + "s";
    row.appendChild(setsEl);

    const winrateEl = document.createElement("span");
    winrateEl.className = "tree-brawler-wr";
    winrateEl.textContent = formatWinrate(brawlerAggregate.winrate);
    const tone = winrateTone(brawlerAggregate.winrate);
    if (tone) {
      winrateEl.style.color = tone;
    }
    row.appendChild(winrateEl);

    return row;
  }

  function buildClassRow(classGroup) {
    const isActive =
      STATE.filter.kind === "class" && STATE.filter.value === classGroup.className;
    const isExpanded = STATE.expandedClasses[classGroup.className] === true;

    const classRow = document.createElement("div");
    classRow.className = isActive ? "tree-class active" : "tree-class";

    const header = document.createElement("div");
    header.className = "tree-class-header";
    // Clicking anywhere in the header (chevron excluded, see below) is the "name/bar area" click
    // that sets/clears the class filter.
    header.addEventListener("click", function () {
      STATE.filter = isActive
        ? { kind: null, value: null }
        : { kind: "class", value: classGroup.className };
      renderAll();
    });

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.textContent = isExpanded ? "▾" : "▸";
    chevron.addEventListener("click", function (event) {
      // stopPropagation is required here: the chevron is a DOM descendant of `header`, so without
      // this a chevron click would also bubble up into header's own click handler above and
      // incorrectly toggle STATE.filter — the chevron must only ever touch STATE.expandedClasses.
      event.stopPropagation();
      STATE.expandedClasses[classGroup.className] = !isExpanded;
      renderBrawlerTree();
    });
    header.appendChild(chevron);

    const main = document.createElement("div");
    main.className = "tree-class-main";

    const nameEl = document.createElement("div");
    nameEl.className = "tree-class-name";
    nameEl.textContent = classGroup.className;
    main.appendChild(nameEl);

    const meta = document.createElement("div");
    meta.className = "tree-class-meta";

    const barTrack = document.createElement("div");
    barTrack.className = "tree-bar-track";
    const barFill = document.createElement("div");
    barFill.className = "tree-bar-fill";
    const winratePercent = classGroup.winrate === null ? 0 : classGroup.winrate * 100;
    barFill.style.width = winratePercent + "%";
    barFill.style.background = winrateTone(classGroup.winrate) || "var(--text-muted-4)";
    barTrack.appendChild(barFill);
    meta.appendChild(barTrack);

    const winrateEl = document.createElement("span");
    winrateEl.className = "tree-wr";
    winrateEl.textContent = formatWinrate(classGroup.winrate);
    const tone = winrateTone(classGroup.winrate);
    if (tone) {
      winrateEl.style.color = tone;
    }
    meta.appendChild(winrateEl);

    const setsEl = document.createElement("span");
    setsEl.className = "tree-sets";
    setsEl.textContent = classGroup.sets + "s";
    meta.appendChild(setsEl);

    main.appendChild(meta);
    header.appendChild(main);
    classRow.appendChild(header);

    if (isExpanded) {
      const children = document.createElement("div");
      children.className = "tree-children";
      classGroup.brawlers.forEach(function (brawlerAggregate) {
        children.appendChild(buildBrawlerRow(brawlerAggregate));
      });
      classRow.appendChild(children);
    }

    return classRow;
  }

  function renderBrawlerTree() {
    const headerContainer = document.getElementById("brawler-tree-header");
    const listContainer = document.getElementById("brawler-tree-list");
    clearElement(headerContainer);
    clearElement(listContainer);

    const title = document.createElement("span");
    title.className = "control-group-title";
    title.textContent = LABELS.brawlerTreeTitle;
    headerContainer.appendChild(title);

    if (STATE.filter.kind !== null) {
      const clearLink = document.createElement("span");
      clearLink.className = "tree-clear";
      clearLink.textContent = "✕ " + LABELS.clear;
      clearLink.addEventListener("click", function () {
        STATE.filter = { kind: null, value: null };
        renderAll();
      });
      headerContainer.appendChild(clearLink);
    }

    const classGroups = buildBrawlerClassGroups();
    classGroups.forEach(function (classGroup) {
      listContainer.appendChild(buildClassRow(classGroup));
    });
  }

  // =========================================================================================
  // === SIDEBAR FILTERS: RANK TIER TREE ===
  // === Same shape/convention as the brawler tree above (flat rows, no nesting — there's no
  // === "class" grouping level for ranks), scoped to only the 5 tiers worth filtering on
  // === (Pro/Masters/Legendary/Mythic/Diamond, highest first) — Gold/Silver/Bronze are excluded
  // === per user request, since nobody filters ranked stats down to those. Built from
  // === `filterByModePeriodAndBrawler`, so it reflects mode/period/brawler selections but never
  // === collapses to a single row from its own STATE.rankFilter selection. Selecting a row writes
  // === STATE.rankFilter directly (a bare tier_name or null) — kept separate from STATE.filter so
  // === a rank and a brawler/class can be active at the same time (see STATE.rankFilter's own
  // === comment for why).
  // =========================================================================================

  const RANK_FILTER_ORDER = ["Pro", "Masters", "Legendary", "Mythic", "Diamond"];

  function buildRankGroups() {
    const rankAggregates = aggregate(
      filterByModePeriodAndBrawler(currentTreeRows()),
      function (row) {
        return row.tier_name;
      },
      function (row) {
        return row.tier_name;
      }
    );

    const aggregatesByTier = new Map();
    rankAggregates.forEach(function (rankAggregate) {
      aggregatesByTier.set(rankAggregate.key, rankAggregate);
    });

    const orderedGroups = [];
    RANK_FILTER_ORDER.forEach(function (tierName) {
      const rankAggregate = aggregatesByTier.get(tierName);
      if (!rankAggregate || rankAggregate.sets === 0) {
        return;
      }
      orderedGroups.push(rankAggregate);
    });

    return orderedGroups;
  }

  function buildRankRow(rankAggregate) {
    const isActive = STATE.rankFilter === rankAggregate.key;

    const row = document.createElement("div");
    row.className = isActive ? "tree-rank-row active" : "tree-rank-row";
    row.addEventListener("click", function () {
      STATE.rankFilter = isActive ? null : rankAggregate.key;
      renderAll();
    });

    const iconUrl = tierIconUrl(rankAggregate.key);
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.className = "tree-rank-icon";
      icon.src = iconUrl;
      icon.alt = rankAggregate.label;
      icon.loading = "lazy";
      row.appendChild(icon);
    }

    const nameEl = document.createElement("span");
    nameEl.className = "tree-rank-name";
    nameEl.textContent = rankAggregate.label;
    row.appendChild(nameEl);

    const setsEl = document.createElement("span");
    setsEl.className = "tree-rank-sets";
    setsEl.textContent = rankAggregate.sets + "s";
    row.appendChild(setsEl);

    const winrateEl = document.createElement("span");
    winrateEl.className = "tree-rank-wr";
    winrateEl.textContent = formatWinrate(rankAggregate.winrate);
    const tone = winrateTone(rankAggregate.winrate);
    if (tone) {
      winrateEl.style.color = tone;
    }
    row.appendChild(winrateEl);

    return row;
  }

  function renderRankTree() {
    const headerContainer = document.getElementById("rank-tree-header");
    const listContainer = document.getElementById("rank-tree-list");
    clearElement(headerContainer);
    clearElement(listContainer);

    const title = document.createElement("span");
    title.className = "control-group-title";
    title.textContent = LABELS.rankTreeTitle;
    headerContainer.appendChild(title);

    if (STATE.rankFilter !== null) {
      const clearLink = document.createElement("span");
      clearLink.className = "tree-clear";
      clearLink.textContent = "✕ " + LABELS.clear;
      clearLink.addEventListener("click", function () {
        STATE.rankFilter = null;
        renderAll();
      });
      headerContainer.appendChild(clearLink);
    }

    const rankGroups = buildRankGroups();
    rankGroups.forEach(function (rankAggregate) {
      listContainer.appendChild(buildRankRow(rankAggregate));
    });
  }

  // =========================================================================================
  // === SIDEBAR FILTERS: MODE / PERIOD CHIPS + ACTIVE-FILTER BAR ===
  // === `renderModeChips`/`renderPeriodChips`/`renderFilterBar` are all pure DOM-rebuild
  // === functions called from renderAll() on every render — no network requests, no cached
  // === chip lists. Mode chips are derived LIVE from STATE.setRows every call (cheap at this data
  // === volume); period chips are a fixed 3-entry list. Every click only mutates STATE and calls
  // === renderAll() again, same convention as the rest of the app.
  // =========================================================================================

  function renderModeChips() {
    const container = document.getElementById("mode-chips");
    clearElement(container);

    const distinctModes = new Set();
    currentTreeRows().forEach(function (row) {
      distinctModes.add(row.mode);
    });

    const chipValues = ["All modes"].concat(Array.from(distinctModes));

    chipValues.forEach(function (modeValue) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = modeValue === "All modes" ? LABELS.allModes : prettyMode(modeValue);
      if (STATE.mode === modeValue) {
        chip.classList.add("active");
      }
      chip.addEventListener("click", function () {
        STATE.mode = modeValue;
        renderAll();
      });
      container.appendChild(chip);
    });
  }

  function renderPeriodChips() {
    const container = document.getElementById("period-chips");
    clearElement(container);

    const periods = [
      { value: "This season", label: LABELS.thisSeason },
      { value: "Last 30 days", label: LABELS.last30Days },
      { value: "Last 7 days", label: LABELS.last7Days },
      { value: "All time", label: LABELS.allTime },
    ];

    periods.forEach(function (period) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = period.label;
      if (STATE.period === period.value) {
        chip.classList.add("active");
      }
      chip.addEventListener("click", function () {
        STATE.period = period.value;
        renderAll();
      });
      container.appendChild(chip);
    });
  }

  function renderFilterBar() {
    const container = document.getElementById("filter-bar");
    clearElement(container);

    const label = document.createElement("span");
    label.className = "filter-bar-label";
    label.textContent = LABELS.activeFilterLabel;
    container.appendChild(label);

    const modeText = STATE.mode === "All modes" ? LABELS.allModes : prettyMode(STATE.mode);
    const periodText =
      STATE.period === "All time"
        ? LABELS.allTime
        : STATE.period === "This season"
        ? LABELS.thisSeason
        : STATE.period === "Last 7 days"
        ? LABELS.last7Days
        : LABELS.last30Days;

    const summary = document.createElement("span");
    summary.className = "filter-bar-summary";
    summary.textContent =
      "· " +
      modeText +
      " · " +
      periodText +
      (STATE.rankFilter !== null ? " · " + STATE.rankFilter : "") +
      " · min " +
      STATE.minSets +
      " " +
      LABELS.tableSets;
    container.appendChild(summary);

    if (STATE.filter.kind !== null || STATE.rankFilter !== null) {
      const clearButton = document.createElement("span");
      clearButton.className = "filter-bar-clear";
      clearButton.textContent = LABELS.clear;
      clearButton.addEventListener("click", function () {
        STATE.filter = { kind: null, value: null };
        STATE.rankFilter = null;
        renderAll();
      });
      container.appendChild(clearButton);
    }
  }

