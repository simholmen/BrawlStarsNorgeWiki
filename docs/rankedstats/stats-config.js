  // =========================================================================================
  // === CONFIG ===
  // === Publishable key only (RLS/grants govern access, SELECT-only). Safe to commit.
  // =========================================================================================

  const SUPABASE_URL = "https://pojzifcfobmsnsvrnvob.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3WuJOVb5GuP4h6fCBGBV-Q_HjOjfH54";

  // Named `sb`, never `supabase` at top level — the UMD bundle above occupies the global
  // `window.supabase`, so shadowing that name with a top-level `const supabase = ...` would break it.
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  // =========================================================================================
  // === LABELS ===
  // === Every user-facing string on this page, in Norwegian, in one flat object — per the
  // === rankedstats-redesign plan's RESOLVED "UI language" decision (Norwegian, matching the
  // === mockup's own confirmed labels and the public docs/ wiki's language). Change wording here,
  // === not inline, so a future language change is a one-object edit. Internal code (variable/
  // === function names, CSS classes/ids, comments) stays English — only strings actually rendered
  // === to the user live here. Some genuinely static HTML (plain <label> text, <h2> titles, the
  // === initial hero placeholder) is hardcoded as Norwegian directly in the markup below instead
  // === of referencing this object, because no JS render pass ever (re)writes that exact text at
  // === runtime — see the notepad entry for this task for the full list of which strings that
  // === applies to. Future tasks (8, 10, 13, 15) should add their own new keys to THIS object
  // === rather than hardcoding more strings — reserved terms already confirmed by the mockup but
  // === not yet needed by any landed code ("Nullstill", "TYNT", "Periode", "Vis alle brawlere",
  // === "rader skjult", "rader over grensen") are intentionally omitted until the task that needs
  // === them lands. Task 14 has already landed and added its own "recent matches / modal" keys
  // === below (including "Klikk for settdetaljer", no longer reserved/unused).
  // =========================================================================================

  const LABELS = {
    // --- status messages (setStatus() calls shared by the map/brawler/teammate/recent panels
    // --- and the match-detail modal) ---
    loading: "Laster...",
    errorPrefix: "Feil: ",
    noSetsRecorded: "Ingen rangerte sett registrert ennå.",
    selectPlayerToViewStats: "Velg en spiller for å se statistikk.",

    // --- hero ---
    selectPlayer: "Velg en spiller",
    form: "Form",
    setsPlayed: "Sett spilt",
    winrate: "Winrate",
    wins: "Seire",
    losses: "Tap",
    draws: "Uavgjort",

    // --- sidebar ---
    playerLabel: "Spiller",
    minSetsLabel: "Minimum sett",
    loadingPlayers: "Laster spillere...",
    errorLoadingPlayers: "Feil ved lasting av spillere: ",
    noTrackedPlayers: "Ingen sporede spillere funnet ennå.",
    failedToLoadPlayers: "(klarte ikke å laste spillere)",
    noTrackedPlayersOption: "(ingen sporede spillere)",
    choosePlayer: "- Felles leaderboard -",

    // --- section titles ---
    mapSectionTitle: "Map",
    brawlerSectionTitle: "Brawler",
    teammateSectionTitle: "Teammates",
    recentSectionTitle: "Siste sett",

    // --- best/worst map callouts ---
    bestMap: "Beste map",
    worstMap: "Dårligste map",
    setsSuffix: "sett",

    // --- table headers (map/brawler/teammate/recent tables) ---
    tableMode: "Mode",
    tableMap: "Map",
    tableSets: "Sett",
    tableWins: "Seire",
    tableLosses: "Tap",
    tableDraws: "Uavgjort",
    tableWinrate: "Winrate",
    tableBrawler: "Brawler",
    tableTeammate: "Teammate",
    tableTag: "Tag",
    tableSetsTogether: "Sett sammen",
    roster: "Liste",
    tableDate: "Dato",
    tableResult: "Resultat",
    tableTrend: "Trend",
    loadMore: "Last inn flere",

    // --- table rows / badges (Task 10) ---
    thinBadge: "TYNT",
    thinBadgeTooltip: "Lite datagrunnlag",
    rowsOverThreshold: "rader over grensen",

    // --- match-detail modal ---
    loadingMatchDetail: "Laster settdetaljer...",
    matchDetailNotFound: "Fant ikke settdetaljer.",
    started: "Startet: ",
    ended: "Avsluttet: ",
    gamesPlayed: "Runder spilt: ",
    team0Wins: "Lag 0 seire: ",
    team1Wins: "Lag 1 seire: ",
    winningTeam: "Vinnende lag: ",
    drawUnresolved: "— (uavgjort / uavklart)",
    teamPrefix: "Lag ",
    complete: "Fullført: ",
    yes: "ja",
    no: "nei",
    gamesHeading: "Runder",
    tablePlayer: "Spiller",
    tableBrawlerCol: "Brawler",
    tablePower: "Styrke",
    tableRank: "Rank",
    tableGameNumber: "#",
    tableBattleTime: "Kamptidspunkt",
    tableDuration: "Varighet (s)",
    tableWinningTeam: "Vinnende lag",
    tableStarPlayer: "Star player",
    draw: "uavgjort",

    // --- filters (mode/period chips, min-sets slider, active-filter bar) ---
    allModes: "Alle modes",
    modeGroupTitle: "Mode",
    periodGroupTitle: "Periode",
    allTime: "All time",
    last30Days: "Siste 30 dager",
    last7Days: "Siste 7 dager",
    thisSeason: "Denne sesongen",

    // --- custom period (date-range chip) ---
    periodCustom: "Egendefinert",
    customFromLabel: "Fra",
    customToLabel: "Til",

    // --- hero rank delta (Task 15) — period-relative suffix appended after the +/- number, so
    // --- the delta reads e.g. "+263 elo denne sesongen" instead of a bare "+263" ---
    heroDeltaUnitElo: "elo",
    heroDeltaPeriodAllTime: "totalt",
    heroDeltaPeriodSeason: "denne sesongen",
    heroDeltaPeriodLast30: "siste 30 dager",
    heroDeltaPeriodLast7: "siste 7 dager",
    heroDeltaPeriodCustom: "i valgt periode",
    rowsHiddenSuffix: "rader skjult",
    activeFilterLabel: "Aktivt filter",
    clear: "Nullstill",

    // --- sidebar brawler class filter tree (Task 13) ---
    // --- LABELS.clear (above) is reused for the tree's own "✕ Nullstill" clear link, not
    // --- duplicated under a new key. ---
    brawlerTreeTitle: "Brawler",

    // --- sidebar rank-tier filter tree (Pro/Masters/Legendary/Mythic/Diamond only) ---
    rankTreeTitle: "Rank",

    // --- recent matches / modal (Task 14) ---
    clickForDetails: "Klikk for settdetaljer",
    draftLabel: "Draft",
    closeModal: "Lukk",
    resultWin: "Seier",
    resultLoss: "Tap",
    resultDraw: "Uavgjort",

    // --- leaderboard (no player selected) ---
    leaderboardSectionTitle: "Ledertavle",
    leaderboardRankColumn: "#",
    leaderboardPrevPage: "‹ Forrige",
    leaderboardNextPage: "Neste ›",
    leaderboardPageLabel: "Side",
    leaderboardPageOfLabel: "av",
    leaderboardExcludedSuffix: "spillere ekskludert (under minimum sett)",
    leaderboardHeroTitle: "Brawl Stars Norge ranked leaderboard",
    leaderboardHeroSubtitle: "Velg eller klikk på en spiller for å se spillerenes individuelle statistikk.",
    leaderboardHeroContactHint: "Ta kontakt med @Zimma2832 på Discord om du vil bli lagt til",
    leaderboardLogoAlt: "Brawl Stars Norge",

    // --- view switcher (Ledertavle/Kart toggle, no player selected — Task 16) ---
    mapsHeroTitle: "Brawl Stars Norge kart-statistikk",
    mapsHeroSubtitle: "Velg et kart for å se de beste brawlerne der, blant alle sporede spillere.",

    // --- combined recent matches (no player selected) — pagination reuses the leaderboard's
    // --- own Prev/Next/Page/of labels above rather than duplicating them under new keys ---
    combinedRecentSectionTitle: "Siste kamper (alle spillere)",

    // --- global map stats (no player selected) — reuses the per-player Map section's own
    // --- tableMap/tableSets/etc. column labels above, just this section's own panel title ---
    globalMapSectionTitle: "Map (alle spillere)",

    // --- map preview modal (top brawlers by winrate on a map) — reuses the match-detail modal's
    // --- own chrome (closeModal, setsSuffix, etc. above), just this section's own strings ---
    clickForMapPreview: "Klikk for å se topp brawlere",
    mapPreviewHeadingGlobal: "Topp 5 brawlere (winrate blant alle sporede spillere)",
    mapPreviewHeadingPersonal: "Topp brawlere (dine sett på dette kartet)",
    mapPreviewNoDataGlobal: "Ikke nok data for dette kartet ennå (blant alle sporede spillere).",
    mapPreviewNoDataPersonal: "Ikke nok av dine egne sett på dette kartet ennå.",
    mapPreviewTotalSuffixGlobal: "totalt på dette kartet, blant alle sporede spillere",
    mapPreviewTotalSuffixPersonal: "av dine egne sett på dette kartet",

    // --- global brawler stats + matchup breakdown (no player selected, Statistikk/Kart view) —
    // --- reuses tableBrawler/tableSets/etc. above for its own column labels, just this section's
    // --- panel title and the click-to-expand row hint (parallel to clickForMapPreview above) ---
    globalBrawlerSectionTitle: "Brawler (alle spillere)",
    clickForBrawlerMatchups: "Klikk for å se motstandere",
  };

