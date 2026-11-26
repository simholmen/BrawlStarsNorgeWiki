# Brawl Stars Norge Wiki

Dette er et fritidsprosjekt for å samle og vise statistikk, historie og profiler fra det norske Brawl Stars-miljøet.

## 🌐 Live

[brawlstarsnorge.com](https://brawlstarsnorge.com)

## Hvordan det henger sammen

- **Wikien** er en Next.js-app (`web/`). Person- og klubbsider ligger i Supabase-databasen og redigeres på
  siden av godkjente redaktører (logg inn med Discord og be om tilgang under «Min konto»).
- **Ranked Stats** (`docs/rankedstats/`) er en statisk side som leser rett fra Supabase.
- **Topplister** (`/topplister/`) henter profilene til alle spillerne én gang om dagen.
- Alt kjører på en droplet: Caddy serverer de statiske filene i `docs/` og sender resten til Next.js,
  og cron kjører Python-skriptene i `rankedstats/`.

## Innhold

- **web/** – Next.js-appen (wikien, innlogging, redigering, topplister).
- **supabase/** – Databasemigreringer og SQL-tester.
- **rankedstats/** – Python-skript som henter data fra Brawl Stars API til Supabase:
  `ingest.py` (ranked-kamper, hver halvtime) og `toplists.py` (topplistene, daglig).
- **docs/** – Statiske filer: forsiden (`index.html`), bilder, Ranked Stats-siden, og de håndskrevne
  wikisidene i `wiki/` og `diverse/` (med data i `_data/`), som Next.js-appen leser.
- **tournamentfetching/** – Skript som oppdaterer turneringsstatistikken i `docs/_data/`.
- **deploy/** – Caddy-oppsett, systemd-tjeneste og skript som holder dropleten oppdatert.
- **tools/** – Hjelpeskript (f.eks. SQL-tester mot databasen).

Den gamle Jekyll-versjonen av siden (Markdown-filer i `docs/_personer/` og `docs/_klubber/`) er fjernet;
innholdet ligger i databasen, og de gamle filene finnes i git-historikken.

## Komme i gang

1. **Start wikien lokalt**
   ```sh
   cd web
   npm install
   npm run dev
   ```
   Se `web/README.md` for miljøvariabler. Siden er da på [http://localhost:3000](http://localhost:3000).

2. **Statistikk**
   - Ranked-statistikk oppdateres automatisk av `rankedstats/ingest.py` via cron (se `rankedstats/README.md`).
   - Topplistene oppdateres hver morgen av `rankedstats/toplists.py`.

## Bidra

Dette er et hobbyprosjekt, men du kan gjerne sende inn forslag eller pull requests.
Kontakt @Zimma2832 på Discord for ideer eller spørsmål.

## Lisens

Prosjektet er kun til privat bruk og har ingen offisiell lisens.
All kode og innhold er laget av Simen "Zimma".
