  // =========================================================================================
  // === DOM HELPERS ===
  // =========================================================================================

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function setStatus(container, statusClass, message) {
    clearElement(container);
    const paragraph = document.createElement("p");
    paragraph.className = "status " + statusClass;
    paragraph.textContent = message;
    container.appendChild(paragraph);
  }

  // =========================================================================================
  // === SKELETON LOADERS ===
  // === Shimmering placeholders shown in place of setStatus(..., "loading", ...) while a
  // === section's data is in flight. Each builder mirrors the exact markup its section's real
  // === renderer produces (buildRowIconCell's icon+text anatomy for the map/brawler/teammate/
  // === leaderboard tables, .recent-row's grid for the recent-matches lists) so nothing reflows
  // === once the real content replaces it — only .skeleton-bar/.skeleton-shimmer fillers stand in
  // === for real text/icons. Purely decorative: none of this reads or writes STATE.
  // =========================================================================================

  // Cycled by a per-cell seed so neighbouring bars don't all render the exact same width —
  // cosmetic variation only, no meaning attached to any particular width.
  const SKELETON_WIDTHS = ["skeleton-w-45", "skeleton-w-60", "skeleton-w-75", "skeleton-w-85"];

  function skeletonWidthClass(seed) {
    return SKELETON_WIDTHS[seed % SKELETON_WIDTHS.length];
  }

  // Same DOM shape as buildRowIconCell's icon column (.table-row-cell > placeholder +
  // .table-row-text), so a skeleton row lines up pixel-for-pixel with the real row that replaces
  // it.
  function buildSkeletonIconCell(seed) {
    const cell = document.createElement("td");
    const wrapper = document.createElement("div");
    wrapper.className = "table-row-cell";

    const iconPlaceholder = document.createElement("div");
    iconPlaceholder.className = "table-icon-placeholder skeleton-shimmer";
    wrapper.appendChild(iconPlaceholder);

    const textStack = document.createElement("div");
    textStack.className = "table-row-text";
    const labelBar = document.createElement("div");
    labelBar.className = "skeleton-bar skeleton-bar--label skeleton-shimmer " + skeletonWidthClass(seed);
    textStack.appendChild(labelBar);
    wrapper.appendChild(textStack);

    cell.appendChild(wrapper);
    return cell;
  }

  function buildSkeletonCell(seed) {
    const cell = document.createElement("td");
    const bar = document.createElement("div");
    bar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(seed);
    cell.appendChild(bar);
    return cell;
  }

  // === Renders a skeleton <table> with the section's REAL header (so headers never "pop in"
  // === once loading finishes) plus `rowCount` shimmering rows. `iconColumnIndex` is the 0-based
  // === column that gets the icon+label treatment; every other column gets a plain bar. Used by
  // === the map/brawler/teammate tables (loadPlayerData) and the leaderboard (loadLeaderboardData).
  function renderSkeletonTable(container, headerLabels, iconColumnIndex, rowCount) {
    clearElement(container);

    const table = document.createElement("table");
    table.className = "skeleton-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerLabels.forEach(function (label) {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const tr = document.createElement("tr");
      headerLabels.forEach(function (label, columnIndex) {
        tr.appendChild(
          columnIndex === iconColumnIndex
            ? buildSkeletonIconCell(rowIndex + columnIndex)
            : buildSkeletonCell(rowIndex + columnIndex)
        );
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    container.appendChild(table);
  }

  // === Renders `rowCount` shimmering `.recent-row`s — the same grid layout buildRecentRow's real
  // === rows use (`isCombined` adds the extra leading player-identity column) — in place of the
  // === recent-matches list while it loads.
  function renderSkeletonRecentList(container, rowCount, isCombined) {
    clearElement(container);

    const list = document.createElement("div");
    list.className = "recent-list";

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = document.createElement("div");
      row.className = isCombined ? "recent-row recent-row--combined" : "recent-row";
      row.style.borderLeftColor = "var(--panel-border)";

      if (isCombined) {
        const playerCell = document.createElement("div");
        playerCell.className = "recent-player-cell";
        const playerIconPlaceholder = document.createElement("div");
        playerIconPlaceholder.className = "recent-player-placeholder skeleton-shimmer";
        playerCell.appendChild(playerIconPlaceholder);
        const playerBar = document.createElement("div");
        playerBar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(rowIndex);
        playerCell.appendChild(playerBar);
        row.appendChild(playerCell);
      }

      const dateBar = document.createElement("div");
      dateBar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(rowIndex + 1);
      row.appendChild(dateBar);

      const mapCell = document.createElement("div");
      mapCell.className = "recent-map-cell";
      const mapIconPlaceholder = document.createElement("div");
      mapIconPlaceholder.className = "recent-map-placeholder skeleton-shimmer";
      mapCell.appendChild(mapIconPlaceholder);
      const mapTextBar = document.createElement("div");
      mapTextBar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(rowIndex + 2);
      mapCell.appendChild(mapTextBar);
      row.appendChild(mapCell);

      const brawlerCell = document.createElement("div");
      brawlerCell.className = "recent-brawler-cell";
      const brawlerIconPlaceholder = document.createElement("div");
      brawlerIconPlaceholder.className = "recent-brawler-placeholder skeleton-shimmer";
      brawlerCell.appendChild(brawlerIconPlaceholder);
      const brawlerTextBar = document.createElement("div");
      brawlerTextBar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(rowIndex + 3);
      brawlerCell.appendChild(brawlerTextBar);
      row.appendChild(brawlerCell);

      const rankCell = document.createElement("div");
      rankCell.className = "recent-rank-cell";
      const rankIconPlaceholder = document.createElement("div");
      rankIconPlaceholder.className = "recent-rank-placeholder skeleton-shimmer";
      rankCell.appendChild(rankIconPlaceholder);
      const rankTextBar = document.createElement("div");
      rankTextBar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(rowIndex + 4);
      rankCell.appendChild(rankTextBar);
      row.appendChild(rankCell);

      const resultCell = document.createElement("div");
      resultCell.className = "recent-result-cell";
      const resultBar = document.createElement("div");
      resultBar.className = "skeleton-bar skeleton-shimmer " + skeletonWidthClass(rowIndex + 5);
      resultCell.appendChild(resultBar);
      row.appendChild(resultCell);

      row.appendChild(document.createElement("div"));

      list.appendChild(row);
    }

    container.appendChild(list);
  }

  // === Generic fallback for sections with no dedicated table/list shape to mirror (currently
  // === just the match-detail modal) — a handful of shimmering lines of varying width.
  function renderSkeletonLines(container, lineCount) {
    clearElement(container);

    const wrapper = document.createElement("div");
    wrapper.className = "skeleton-lines";

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const bar = document.createElement("div");
      bar.className = "skeleton-bar skeleton-bar--label skeleton-shimmer " + skeletonWidthClass(lineIndex);
      bar.style.marginBottom = "10px";
      wrapper.appendChild(bar);
    }

    container.appendChild(wrapper);
  }

  function formatWinrate(winrate) {
    if (winrate === null || winrate === undefined) {
      return "—";
    }
    return (winrate * 100).toFixed(1) + "%";
  }

  function makeCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  // =========================================================================================
  // === MODE / TIER HELPERS ===
  // === Pure, dependency-free display formatters. `prettyMode` degrades gracefully for any
  // === unseen camelCase mode string (new modes ship regularly, so no closed lookup list here).
  // === `tierIconUrl` takes `tier_name` as an already-structured input (never parses
  // === `rank_label`) — that column comes straight from rank_tiers via the views in
  // === 007_redesign_views.sql.
  // =========================================================================================

  function prettyMode(mode) {
    if (!mode) {
      return "";
    }
    const spaced = mode.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  // =========================================================================================
  // === ICON LOOKUPS (map/brawler tables) ===
  // === `modeIconUrl` maps a raw ranked mode string (e.g. "gemGrab") to its game-mode icon in
  // === images/gamemodes/ — only the 6 ranked-eligible modes have artwork, so anything else falls
  // === back to null (caller keeps the placeholder). `brawlerIconUrl` derives a brawler's portrait
  // === path in images/brawlers/Assets2026-08-25/ from `brawler_name` by lowercasing/hyphenating —
  // === this generalizes to new brawlers automatically, with a small override table for the 3 names
  // === whose punctuation doesn't hyphenate cleanly (and 1 filename that doesn't follow the
  // === `<slug>_portrait.png` convention).
  // =========================================================================================

  // === `profileIconUrl` turns a player's `icon_id` (fetched server-side from the live API's
  // === player-profile endpoint, stored in `players.icon_id`) into an image URL on Brawlify's
  // === public CDN, which mirrors every Supercell profile icon by id — this project never
  // === downloads or bundles the icon images themselves. `PLAYER_ICON_FALLBACK_URL` is shown
  // === instead of the blank swatch whenever the id is unknown or the CDN image fails to load.
  // =========================================================================================

  const PLAYER_ICON_FALLBACK_URL = "../images/rankedstats/fallback.png";

  function profileIconUrl(iconId) {
    return iconId ? "https://cdn.brawlify.com/profile-icons/regular/" + iconId + ".png" : null;
  }

  const MODE_ICON_FILENAMES = {
    bounty: "bounty_icon.png",
    brawlBall: "brawl_ball_icon.png",
    gemGrab: "gem_grab_icon.png",
    heist: "heist_icon.png",
    hotZone: "hot_zone_icon.png",
    knockout: "knock_out_icon.png",
  };

  function modeIconUrl(mode) {
    const filename = MODE_ICON_FILENAMES[mode];
    return filename ? "images/gamemodes/" + filename : null;
  }

  const BRAWLER_ICON_SLUG_OVERRIDES = {
    "R-T": "rt",
    "STARR NOVA": "starr_nova",
    "LARRY & LAWRIE": "larry&lawrie",
  };

  const BRAWLER_ICON_FILENAME_OVERRIDES = {
    SPROUT: "sprout_portrait_new.png",
  };

  function brawlerIconUrl(brawlerName) {
    if (!brawlerName) {
      return null;
    }
    const upperName = brawlerName.toUpperCase();
    const overrideFilename = BRAWLER_ICON_FILENAME_OVERRIDES[upperName];
    if (overrideFilename) {
      return "images/brawlers/Assets2026-08-25/" + overrideFilename;
    }
    const slug =
      BRAWLER_ICON_SLUG_OVERRIDES[upperName] ||
      upperName
        .toLowerCase()
        .replace(/\./g, "")
        .replace(/[^a-z0-9&]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return "images/brawlers/Assets2026-08-25/" + slug + "_portrait.png";
  }

  function tierIconUrl(tier_name) {
    if (!tier_name) {
      return null;
    }
    return "images/ranks/icon_rank_sticker_" + tier_name.toLowerCase() + ".png";
  }

  // =========================================================================================
  // === MAP IMAGES (BrawlAPI) ===
  // === Real map artwork has no local asset bundle (unlike the brawler/mode/rank icons above),
  // === so this fetches it from BrawlAPI's public maps list — the actively maintained
  // === continuation of the Brawlify project already used for profile icons elsewhere on this
  // === page (`cdn.brawlify.com`, same CDN the `imageUrl` field below points at). One request,
  // === cached in the resolved index for the rest of the page's lifetime. Keyed by
  // === "<api game mode name>||<map name>" (both lowercased) since a handful of map NAMES repeat
  // === across different modes (e.g. "Deathcap Trap" exists in both Bounty and Gem Grab) with
  // === different artwork per mode. Where a mode+map has multiple list entries (older, reskinned,
  // === or disabled versions), the newest non-disabled entry (highest id) wins.
  // =========================================================================================

  const MODE_API_NAMES = {
    bounty: "Bounty",
    brawlBall: "Brawl Ball",
    gemGrab: "Gem Grab",
    heist: "Heist",
    hotZone: "Hot Zone",
    knockout: "Knockout",
  };

  let mapImageIndexPromise = null;

  function loadMapImageIndex() {
    if (mapImageIndexPromise) {
      return mapImageIndexPromise;
    }
    mapImageIndexPromise = fetch("https://api.brawlapi.com/v1/maps")
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        const index = new Map();
        (data.list || []).forEach(function (mapEntry) {
          const modeName = mapEntry.gameMode && mapEntry.gameMode.name;
          if (!modeName || !mapEntry.name) {
            return;
          }
          const key = modeName.toLowerCase() + "||" + mapEntry.name.toLowerCase();
          const existing = index.get(key);
          const isBetter =
            !existing ||
            (existing.disabled && !mapEntry.disabled) ||
            (existing.disabled === mapEntry.disabled && mapEntry.id > existing.id);
          if (isBetter) {
            index.set(key, mapEntry);
          }
        });
        return index;
      })
      .catch(function () {
        return new Map();
      });
    return mapImageIndexPromise;
  }

  // Sets `targetEl`'s CSS background-image once the real map artwork resolves; leaves whatever
  // background `.rm-map` already has (the neutral placeholder swatch) untouched if the map is
  // unknown or the request fails — same "never show a broken image" instinct as every other icon
  // lookup on this page.
  function setMapVisualImage(targetEl, mode, map) {
    if (!mode || !map) {
      return;
    }
    const apiModeName = MODE_API_NAMES[mode];
    if (!apiModeName) {
      return;
    }
    loadMapImageIndex().then(function (index) {
      const entry = index.get(apiModeName.toLowerCase() + "||" + map.toLowerCase());
      if (entry && entry.imageUrl) {
        targetEl.style.backgroundImage = "url(" + entry.imageUrl + ")";
      }
    });
  }

