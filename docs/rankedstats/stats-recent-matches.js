  // =========================================================================================
  // === SECTION 5: RECENT MATCHES ===
  // =========================================================================================

  function formatDateTime(isoString) {
    if (!isoString) {
      return "—";
    }
    return new Date(isoString).toLocaleString();
  }

  // === Result → tone lookup (border-left colour, badge background/text colour, badge label) —
  // === shared by every recent row so the win/loss/draw mapping lives in exactly one place.
  const RESULT_TONES = {
    win: { border: "var(--win)", badgeBg: "var(--chip-bg-win)", label: LABELS.resultWin },
    loss: { border: "var(--loss)", badgeBg: "var(--chip-bg-loss)", label: LABELS.resultLoss },
    draw: { border: "var(--draw)", badgeBg: "var(--chip-bg-neutral)", label: LABELS.resultDraw },
  };

  function resultTone(result) {
    return RESULT_TONES[result] || RESULT_TONES.draw;
  }

  function openRowMatchDetail(rowEl, setId) {
    openMatchDetailModal(rowEl);
    loadMatchDetail(setId);
  }

  function buildRecentRow(row) {
    const tone = resultTone(row.result);

    const rowEl = document.createElement("div");
    rowEl.className = "recent-row";
    rowEl.setAttribute("role", "button");
    rowEl.setAttribute("tabindex", "0");
    rowEl.title = LABELS.clickForDetails;
    rowEl.setAttribute("aria-label", LABELS.clickForDetails);
    rowEl.style.borderLeftColor = tone.border;

    const dateEl = document.createElement("div");
    dateEl.className = "recent-date";
    dateEl.textContent = formatDateTime(row.ended_at);
    rowEl.appendChild(dateEl);

    const mapCell = document.createElement("div");
    mapCell.className = "recent-map-cell";
    const modeIcon = modeIconUrl(row.mode);
    if (modeIcon) {
      const mapIcon = document.createElement("img");
      mapIcon.className = "recent-map-icon";
      mapIcon.src = modeIcon;
      mapIcon.alt = prettyMode(row.mode);
      mapIcon.loading = "lazy";
      // A mode without shipped artwork (or a bad path) falls back to the plain placeholder
      // swatch instead of showing a broken-image icon — same pattern as buildRowIconCell.
      mapIcon.onerror = function () {
        mapIcon.onerror = null;
        mapIcon.className = "recent-map-placeholder";
        mapIcon.removeAttribute("src");
        mapIcon.alt = "";
      };
      mapCell.appendChild(mapIcon);
    } else {
      const mapPlaceholder = document.createElement("div");
      mapPlaceholder.className = "recent-map-placeholder";
      mapCell.appendChild(mapPlaceholder);
    }
    const mapText = document.createElement("div");
    const mapNameEl = document.createElement("div");
    mapNameEl.className = "recent-map-name";
    mapNameEl.textContent = row.map;
    mapText.appendChild(mapNameEl);
    const mapModeEl = document.createElement("div");
    mapModeEl.className = "recent-map-mode";
    mapModeEl.textContent = prettyMode(row.mode);
    mapText.appendChild(mapModeEl);
    mapCell.appendChild(mapText);
    rowEl.appendChild(mapCell);

    const brawlerCell = document.createElement("div");
    brawlerCell.className = "recent-brawler-cell";
    const brawlerIcon = brawlerIconUrl(row.brawler_name);
    if (brawlerIcon) {
      const brawlerImg = document.createElement("img");
      brawlerImg.className = "recent-brawler-icon";
      brawlerImg.src = brawlerIcon;
      brawlerImg.alt = row.brawler_name || "";
      brawlerImg.loading = "lazy";
      // A brawler without shipped artwork (or a bad path) falls back to the plain placeholder
      // swatch instead of showing a broken-image icon — same pattern as the map icon above.
      brawlerImg.onerror = function () {
        brawlerImg.onerror = null;
        brawlerImg.className = "recent-brawler-placeholder";
        brawlerImg.removeAttribute("src");
        brawlerImg.alt = "";
      };
      brawlerCell.appendChild(brawlerImg);
    } else {
      const brawlerPlaceholder = document.createElement("div");
      brawlerPlaceholder.className = "recent-brawler-placeholder";
      brawlerCell.appendChild(brawlerPlaceholder);
    }
    const brawlerNameEl = document.createElement("span");
    brawlerNameEl.className = "recent-brawler-name";
    brawlerNameEl.textContent = row.brawler_name;
    brawlerCell.appendChild(brawlerNameEl);
    rowEl.appendChild(brawlerCell);

    // The rank tier the player was sitting at when this set was played — v_player_set_rows
    // already joins rank_tiers per-row (same tier_name/rank_label pair the hero badge uses), so
    // this reuses tierIconUrl rather than duplicating the icon-path convention.
    const rankCell = document.createElement("div");
    rankCell.className = "recent-rank-cell";
    const rankIconUrl = tierIconUrl(row.tier_name);
    if (rankIconUrl) {
      const rankImg = document.createElement("img");
      rankImg.className = "recent-rank-icon";
      rankImg.src = rankIconUrl;
      rankImg.alt = row.tier_name || "";
      rankImg.loading = "lazy";
      // Same "fall back to a plain placeholder swatch on error" pattern as the map/brawler icons
      // above, for a tier with no shipped sticker artwork (or a bad path).
      rankImg.onerror = function () {
        rankImg.onerror = null;
        rankImg.className = "recent-rank-placeholder";
        rankImg.removeAttribute("src");
        rankImg.alt = "";
      };
      rankCell.appendChild(rankImg);
    } else {
      const rankPlaceholder = document.createElement("div");
      rankPlaceholder.className = "recent-rank-placeholder";
      rankCell.appendChild(rankPlaceholder);
    }
    const rankLabelEl = document.createElement("span");
    rankLabelEl.className = "recent-rank-label";
    rankLabelEl.textContent = row.rank_label || "—";
    rankCell.appendChild(rankLabelEl);
    rowEl.appendChild(rankCell);

    const resultCell = document.createElement("div");
    resultCell.className = "recent-result-cell";
    const resultBadge = document.createElement("span");
    resultBadge.className = "recent-result-badge";
    resultBadge.textContent = tone.label;
    resultBadge.style.background = tone.badgeBg;
    resultBadge.style.color = tone.border;
    resultCell.appendChild(resultBadge);
    const scoreEl = document.createElement("span");
    scoreEl.className = "recent-score";
    scoreEl.textContent = row.team0_wins + "–" + row.team1_wins;
    resultCell.appendChild(scoreEl);
    rowEl.appendChild(resultCell);

    const chevronEl = document.createElement("div");
    chevronEl.className = "recent-chevron";
    chevronEl.textContent = "›";
    rowEl.appendChild(chevronEl);

    rowEl.addEventListener("click", function () {
      openRowMatchDetail(rowEl, row.set_id);
    });
    rowEl.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openRowMatchDetail(rowEl, row.set_id);
    });

    return rowEl;
  }

  function renderRecentTable(container, rows) {
    clearElement(container);

    const list = document.createElement("div");
    list.className = "recent-list";

    rows.forEach(function (row) {
      list.appendChild(buildRecentRow(row));
    });

    container.appendChild(list);
  }

  async function loadMatchDetail(setId) {
    const container = document.getElementById("match-detail-content");
    renderSkeletonLines(container, 5);

    const { data, error } = await sb
      .from("v_set_detail")
      .select("*")
      .eq("set_id", setId);

    if (error) {
      setStatus(container, "error", LABELS.errorPrefix + error.message);
      return;
    }

    if (!data || data.length === 0) {
      setStatus(container, "empty", LABELS.matchDetailNotFound);
      return;
    }

    // Fills the modal header's static #match-detail-title (outside `container`, so untouched by
    // renderMatchDetail itself) once the set's mode/map are known — added here rather than inside
    // renderMatchDetail so that function's own DOM-building body stays byte-for-byte identical to
    // its pre-Task-14 form aside from the CSS class additions documented in the notepad.
    document.getElementById("match-detail-title").textContent = data[0].mode + " — " + data[0].map;
    setMatchDetailThumb(data[0].mode);

    renderMatchDetail(container, data[0]);
  }

  function setMatchDetailThumb(mode) {
    const thumbEl = document.getElementById("match-detail-thumb");
    thumbEl.style.backgroundImage = "";
    const iconUrl = modeIconUrl(mode);
    if (!iconUrl) {
      return;
    }
    // Probe the icon before committing to it, so a mode without shipped artwork keeps the
    // plain placeholder swatch instead of showing a broken image — same fallback pattern as
    // buildRowIconCell/the recent-list mode icon.
    const probe = new Image();
    probe.onload = function () {
      thumbEl.style.backgroundImage = "url(" + iconUrl + ")";
    };
    probe.src = iconUrl;
  }

  // === Icon-forward match detail body (replaces the old text summary list + 2 team tables +
  // === rounds table). Uses the SAME icon lookups as the rest of the page (brawlerIconUrl/
  // === modeIconUrl/tierIconUrl) so a player's brawler portrait, the mode glyph, and rank-tier
  // === colour are all real assets, not placeholders — the vertical map image comes from
  // === BrawlAPI (see setMapVisualImage), degrading to a plain swatch if the lookup fails.

  const TIER_COLOR_VARS = {
    Bronze: "--tier-bronze",
    Silver: "--tier-silver",
    Gold: "--tier-gold",
    Diamond: "--tier-diamond",
    Mythic: "--tier-mythic",
    Legendary: "--tier-legendary",
    Masters: "--tier-masters",
    Pro: "--tier-pro",
  };

  function tierColorValue(tierName) {
    return "var(" + (TIER_COLOR_VARS[tierName] || "--tier-default") + ")";
  }

  function initialsFor(name) {
    if (!name) {
      return "?";
    }
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (word) {
        return word.charAt(0).toUpperCase();
      })
      .join("");
  }

  function buildIconSvg(paths, options) {
    const svg = document.createElementNS(SVG_NS, "svg");
    const size = (options && options.size) || 14;
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.style.flex = "none";
    if (options && options.fillOnly) {
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "none");
    } else {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.8");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
    }
    paths.forEach(function (d) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function outcomeIconSvg(outcome) {
    if (outcome === "win") {
      return buildIconSvg(["M20 6L9 17l-5-5"], { size: 15 });
    }
    if (outcome === "loss") {
      return buildIconSvg(["M6 6l12 12M18 6L6 18"], { size: 15 });
    }
    return buildIconSvg(["M5 12h14"], { size: 15 });
  }

  // Builds a circular avatar: brawler portrait on top of an initials swatch, same "try the real
  // asset, fall back to a plain swatch" convention as buildRowIconCell/profileIconUrl elsewhere
  // on this page — never a broken image if the portrait 404s.
  function buildAvatarEl(participant, size) {
    const avatar = document.createElement("div");
    avatar.className = "rm-avatar";
    avatar.style.width = size + "px";
    avatar.style.height = size + "px";
    avatar.style.fontSize = Math.round(size * 0.34) + "px";
    avatar.textContent = initialsFor(participant.player_name || participant.player_tag);
    avatar.title =
      (participant.player_name || participant.player_tag) + " — " + participant.brawler_name;

    const iconUrl = brawlerIconUrl(participant.brawler_name);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      img.onerror = function () {
        img.remove();
      };
      avatar.appendChild(img);
    }
    return avatar;
  }

  // Small rank-tier badge shown next to each player's name in the face-off — same tierIconUrl
  // asset and "real icon first, colour-only dot as a last resort" convention as the recent-list's
  // rank cell (see buildRow's rankCell), just without its text label (no room for one in this
  // narrow, mirrored 2-column layout — `title` still carries the exact rank label on hover).
  function buildRankBadge(rankLabel) {
    const badge = document.createElement("span");
    badge.className = "rm-rank-badge";
    badge.title = rankLabel || "";

    const tierName = (rankLabel || "").split(" ")[0];
    const iconUrl = tierIconUrl(tierName);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = rankLabel || "";
      img.onerror = function () {
        img.remove();
        badge.classList.add("rm-rank-badge--dot");
        badge.style.background = tierColorValue(tierName);
      };
      badge.appendChild(img);
    } else {
      badge.classList.add("rm-rank-badge--dot");
      badge.style.background = tierColorValue(tierName);
    }
    return badge;
  }

  function buildTeamSide(teamParticipants, alignRight) {
    const side = document.createElement("div");
    side.className = alignRight ? "rm-side rm-side--right" : "rm-side";
    teamParticipants.forEach(function (participant) {
      const row = document.createElement("div");
      row.className = "rm-player";

      row.appendChild(buildAvatarEl(participant, 34));

      const name = document.createElement("span");
      name.className = "rm-pname";
      name.textContent = participant.player_name || participant.player_tag;
      row.appendChild(name);

      row.appendChild(buildRankBadge(participant.rank_label));

      side.appendChild(row);
    });
    return side;
  }

  function mostFrequentStarPlayerTag(games) {
    const counts = new Map();
    games.forEach(function (game) {
      if (!game.star_player_tag) {
        return;
      }
      counts.set(game.star_player_tag, (counts.get(game.star_player_tag) || 0) + 1);
    });
    let bestTag = null;
    let bestCount = 0;
    counts.forEach(function (count, tag) {
      if (count > bestCount) {
        bestCount = count;
        bestTag = tag;
      }
    });
    return bestTag;
  }

  function renderMatchDetail(container, set) {
    clearElement(container);

    const participants = set.participants || [];
    const games = set.games || [];

    const viewerParticipant = participants.find(function (participant) {
      return participant.player_tag === STATE.tag;
    });
    const viewerTeamIndex = viewerParticipant ? viewerParticipant.team_index : null;
    const winnerTeamIndex =
      set.winning_team_index === null || set.winning_team_index === undefined
        ? null
        : set.winning_team_index;

    const mapVisual = document.createElement("div");
    mapVisual.className = "rm-map";
    container.appendChild(mapVisual);
    setMapVisualImage(mapVisual, set.mode, set.map);

    const modeChip = document.createElement("div");
    modeChip.className = "rm-mode-chip";
    const modeIconSrc = modeIconUrl(set.mode);
    if (modeIconSrc) {
      const modeIconImg = document.createElement("img");
      modeIconImg.src = modeIconSrc;
      modeIconImg.alt = "";
      modeIconImg.onerror = function () {
        modeIconImg.remove();
      };
      modeChip.appendChild(modeIconImg);
    }
    modeChip.appendChild(document.createTextNode(prettyMode(set.mode)));
    container.appendChild(modeChip);

    const team0Participants = participants.filter(function (participant) {
      return participant.team_index === 0;
    });
    const team1Participants = participants.filter(function (participant) {
      return participant.team_index === 1;
    });

    // No real pick-order data exists yet — approximates it from roster position: left team's
    // 1st pick, then right team drafts all 3, then left team's remaining 2 (a 1-3-2 pattern),
    // per the confirmed layout. Swap this for a real field the moment one is ingested.
    // Draft section disabled — not shown for any set.
    // const draftOrder = [];
    // [team0Participants[0], team1Participants[0], team1Participants[1], team1Participants[2], team0Participants[1], team0Participants[2]].forEach(
    //   function (participant, index) {
    //     if (!participant) {
    //       return;
    //     }
    //     draftOrder.push({
    //       participant: participant,
    //       side: index === 0 || index >= 4 ? 0 : 1,
    //     });
    //   }
    // );
    // if (draftOrder.length > 0) {
    //   const draftLabel = document.createElement("div");
    //   draftLabel.className = "rm-draft-label";
    //   draftLabel.appendChild(buildIconSvg(["M4 6h16M4 12h16M4 18h10"], { size: 11 }));
    //   draftLabel.appendChild(document.createTextNode(LABELS.draftLabel));
    //   container.appendChild(draftLabel);
    //
    //   const draftRow = document.createElement("div");
    //   draftRow.className = "rm-draft";
    //   draftOrder.forEach(function (entry, index) {
    //     const pick = document.createElement("div");
    //     pick.className = "rm-draft-pick";
    //     const avatar = buildAvatarEl(entry.participant, 32);
    //     avatar.style.border = "2px solid " + (entry.side === 0 ? "var(--win)" : "var(--loss)");
    //     pick.appendChild(avatar);
    //     const num = document.createElement("span");
    //     num.className = "rm-draft-num";
    //     num.textContent = String(index + 1);
    //     pick.appendChild(num);
    //     draftRow.appendChild(pick);
    //   });
    //   container.appendChild(draftRow);
    // }

    const faceoff = document.createElement("div");
    faceoff.className = "rm-faceoff";

    const leftSide = buildTeamSide(team0Participants, false);
    const rightSide = buildTeamSide(team1Participants, true);

    const mid = document.createElement("div");
    mid.className = "rm-mid";
    const scoreEl = document.createElement("div");
    scoreEl.className = "rm-score";
    const t0 = document.createElement("span");
    t0.textContent = String(set.team0_wins);
    if (winnerTeamIndex === 0) {
      t0.style.color = "var(--win)";
    }
    const sep = document.createElement("span");
    sep.textContent = " : ";
    sep.style.color = "var(--text-muted-3)";
    const t1 = document.createElement("span");
    t1.textContent = String(set.team1_wins);
    if (winnerTeamIndex === 1) {
      t1.style.color = "var(--win)";
    }
    scoreEl.appendChild(t0);
    scoreEl.appendChild(sep);
    scoreEl.appendChild(t1);
    mid.appendChild(scoreEl);
    if (winnerTeamIndex === null) {
      const drawNote = document.createElement("span");
      drawNote.className = "rm-draw-note";
      drawNote.textContent = LABELS.drawUnresolved;
      mid.appendChild(drawNote);
    }

    faceoff.appendChild(leftSide);
    faceoff.appendChild(mid);
    faceoff.appendChild(rightSide);
    container.appendChild(faceoff);

    const starTag = mostFrequentStarPlayerTag(games);
    const starParticipant = starTag
      ? participants.find(function (participant) {
          return participant.player_tag === starTag;
        })
      : null;
    if (starParticipant) {
      const starRow = document.createElement("div");
      starRow.className = "rm-star";
      starRow.appendChild(
        buildIconSvg(["M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.3 5.7 20.8l1.7-6.9L2 9.2l7.1-.6z"], {
          fillOnly: true,
          size: 16,
        })
      );
      starRow.appendChild(buildAvatarEl(starParticipant, 30));
      const starText = document.createElement("span");
      starText.className = "rm-star-text";
      starText.appendChild(document.createTextNode(LABELS.tableStarPlayer + ": "));
      const starName = document.createElement("b");
      starName.textContent = starParticipant.player_name || starParticipant.player_tag;
      starText.appendChild(starName);
      starRow.appendChild(starText);
      container.appendChild(starRow);
    }

    if (games.length > 0) {
      const roundsRow = document.createElement("div");
      roundsRow.className = "rm-rounds";
      games.forEach(function (game) {
        const chip = document.createElement("div");
        let outcome = "draw";
        if (
          game.winning_team_index !== null &&
          game.winning_team_index !== undefined &&
          viewerTeamIndex !== null
        ) {
          outcome = game.winning_team_index === viewerTeamIndex ? "win" : "loss";
        }
        chip.className = "rm-round rm-round--" + outcome;
        chip.title = LABELS.tableGameNumber + game.game_number;
        chip.appendChild(outcomeIconSvg(outcome));
        roundsRow.appendChild(chip);
      });
      container.appendChild(roundsRow);
    }
  }

  // =========================================================================================
  // === MAP PREVIEW MODAL (top brawlers by winrate on a map) ===
  // === Reuses the SAME modal chrome as the match-detail modal below — openMatchDetailModal/
  // === closeMatchDetailModal just open/close #match-detail-overlay and manage focus, they don't
  // === know or care which content loaded into it. Only #match-detail-content's contents and the
  // === header's title/thumb differ from a match row's. Triggered by clicking a map instead of a
  // === match: either the per-player By Map table's rows / best-worst callout cards (personal —
  // === `sourceRows` is just that one player's own sets, `isPersonal` true), or the Felles page's
  // === global Map table (everyone — `sourceRows` spans every tracked player, `isPersonal` false).
  // === The modal has no scope logic of its own beyond picking which LABELS.mapPreview* string to
  // === show — see computeTopBrawlerWinrates (stats-state.js) for why `sourceRows` alone is enough.
  // =========================================================================================

  function openMapPreviewModal(triggerEl, mode, map, sourceRows, isPersonal) {
    openMatchDetailModal(triggerEl);
    loadMapPreview(mode, map, sourceRows, isPersonal);
  }

  function loadMapPreview(mode, map, sourceRows, isPersonal) {
    const container = document.getElementById("match-detail-content");
    document.getElementById("match-detail-title").textContent = prettyMode(mode) + " — " + map;
    setMatchDetailThumb(mode);
    renderMapPreview(container, mode, map, sourceRows, isPersonal);
  }

  // One row of the top-5 list: rank number, brawler portrait, name, sample size, and the same
  // bar+percentage winrate markup the map/brawler/teammate tables use (buildWinrateBarContent,
  // stats-tables.js) — just laid out in a flex row instead of a table cell.
  function buildMapPreviewRow(group, rank) {
    const row = document.createElement("div");
    row.className = "map-preview-row";

    const rankEl = document.createElement("div");
    rankEl.className = "map-preview-rank";
    rankEl.textContent = "#" + rank;
    row.appendChild(rankEl);

    const iconUrl = brawlerIconUrl(group.label);
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.className = "map-preview-icon";
      icon.src = iconUrl;
      icon.alt = group.label;
      icon.loading = "lazy";
      icon.onerror = function () {
        icon.onerror = null;
        icon.className = "map-preview-icon-placeholder";
        icon.removeAttribute("src");
        icon.alt = "";
      };
      row.appendChild(icon);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "map-preview-icon-placeholder";
      row.appendChild(placeholder);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "map-preview-name";
    nameEl.textContent = group.label;
    row.appendChild(nameEl);

    const setsEl = document.createElement("div");
    setsEl.className = "map-preview-sets";
    setsEl.textContent = group.sets + " " + LABELS.setsSuffix;
    row.appendChild(setsEl);

    const winrateEl = document.createElement("div");
    winrateEl.className = "map-preview-winrate";
    winrateEl.appendChild(buildWinrateBarContent(group.winrate));
    row.appendChild(winrateEl);

    return row;
  }

  // Same "map art on top, mode chip below" opening as renderMatchDetail, then the top-brawlers
  // list (computeTopBrawlerWinrates, stats-state.js) in place of the face-off/rounds a match
  // shows. `isPersonal` only ever picks which LABELS.mapPreview* string to display — `sourceRows`
  // already carries whichever scope (personal vs everyone) the caller means.
  function renderMapPreview(container, mode, map, sourceRows, isPersonal) {
    clearElement(container);

    const mapVisual = document.createElement("div");
    mapVisual.className = "rm-map";
    container.appendChild(mapVisual);
    setMapVisualImage(mapVisual, mode, map);

    const modeChip = document.createElement("div");
    modeChip.className = "rm-mode-chip";
    const modeIconSrc = modeIconUrl(mode);
    if (modeIconSrc) {
      const modeIconImg = document.createElement("img");
      modeIconImg.src = modeIconSrc;
      modeIconImg.alt = "";
      modeIconImg.onerror = function () {
        modeIconImg.remove();
      };
      modeChip.appendChild(modeIconImg);
    }
    modeChip.appendChild(document.createTextNode(prettyMode(mode)));
    container.appendChild(modeChip);

    const heading = document.createElement("div");
    heading.className = "map-preview-heading";
    heading.textContent = isPersonal ? LABELS.mapPreviewHeadingPersonal : LABELS.mapPreviewHeadingGlobal;
    container.appendChild(heading);

    const mapStats = computeTopBrawlerWinrates(sourceRows || []);

    if (mapStats.topGroups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "status empty";
      empty.textContent = isPersonal ? LABELS.mapPreviewNoDataPersonal : LABELS.mapPreviewNoDataGlobal;
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "map-preview-list";
    mapStats.topGroups.forEach(function (group, index) {
      list.appendChild(buildMapPreviewRow(group, index + 1));
    });
    container.appendChild(list);

    const totalSuffix = isPersonal ? LABELS.mapPreviewTotalSuffixPersonal : LABELS.mapPreviewTotalSuffixGlobal;
    const footnote = document.createElement("p");
    footnote.className = "map-preview-footnote";
    footnote.textContent = mapStats.totalSets + " " + LABELS.setsSuffix + " " + totalSuffix;
    container.appendChild(footnote);
  }

  // =========================================================================================
  // === MATCH DETAIL MODAL (open/close + focus management) ===
  // === Adds what the mockup itself never had: ESC-to-close, backdrop-click-to-close, and focus
  // === restoration to the row that opened the modal. `matchDetailTriggerEl` is a real
  // === module-level variable (not a DOM attribute) so `closeMatchDetailModal` can move focus back
  // === even after `renderRecentTable` has rebuilt the recent list (e.g. after a re-render) —
  // === it re-checks the element is still attached to the document before focusing it.
  // =========================================================================================

  let matchDetailTriggerEl = null;

  function isMatchDetailModalOpen() {
    return document.getElementById("match-detail-overlay").classList.contains("open");
  }

  function openMatchDetailModal(triggerElement) {
    matchDetailTriggerEl = triggerElement;
    document.getElementById("match-detail-overlay").classList.add("open");
    document.getElementById("match-detail-close").focus();
  }

  function closeMatchDetailModal() {
    document.getElementById("match-detail-overlay").classList.remove("open");
    clearElement(document.getElementById("match-detail-content"));
    document.getElementById("match-detail-title").textContent = "";
    document.getElementById("match-detail-thumb").style.backgroundImage = "";

    if (matchDetailTriggerEl && document.body.contains(matchDetailTriggerEl)) {
      matchDetailTriggerEl.focus();
    }
    matchDetailTriggerEl = null;
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
      return;
    }
    if (!isMatchDetailModalOpen()) {
      return;
    }
    closeMatchDetailModal();
  });

  document.getElementById("match-detail-overlay").addEventListener("click", function (event) {
    const overlayEl = document.getElementById("match-detail-overlay");
    if (event.target !== overlayEl) {
      return;
    }
    closeMatchDetailModal();
  });

  document.getElementById("match-detail-close").addEventListener("click", function () {
    closeMatchDetailModal();
  });

