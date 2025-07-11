# Brawl Stars Norge Wiki

Dette er et fritidsprosjekt for å samle og vise statistikk, historie og profiler fra det norske Brawl Stars-miljøet.  

Prosjektet bruker [Jekyll](https://jekyllrb.com/) for å generere en statisk nettside, og inneholder automatiske oppdateringer av spillerstatistikk via Python- og Shell-skript.

## 🌐 Live 
[Live Server](https://brawlstarsnorge.com/index.html)

## Innhold

- **docs/** – Kildekoden til nettsiden, inkludert HTML, CSS, JS, og Jekyll-data.
- **winratefetching/** – Python-skript for å hente og oppdatere win/loss/star player-statistikk fra Brawl Stars API.
- **klubbleaderboardfetching/** – Skript for å hente og vise klubb-leaderboards.

## Funksjoner

- **Spillerprofiler** med bakgrunn, prestasjoner og favoritter.
- **Automatisk oppdatert winrate/statistikk** for alle spillere.
- **Klubboversikt** og historiske resultater.
- **Turneringshistorikk** og leaderboard.

BrawlStarsNorgeWiki/
│
├── docs/                       # Nettsidekilde (HTML, CSS, JS, Jekyll-data)
│   ├── _data/                  # YAML-data (f.eks. winloss.yml)
│   ├── _personer/              # Spillerprofiler i Markdown
│   ├── diverse/                # Diverse undersider
│   ├── style.css               # Hovedstilark
│   ├── script.js               # Hoved JavaScript-fil
│   └── index.html              # Hovedside
│
├── winratefetching/            # Python-skript for winrate/statistikk
│   ├── winrate.py
│   ├── extract_names_and_tags.py
│   ├── run_winrate_with_names.py
│   ├── update_all.sh           # Shell Skript for å kjøre winratefetching
│   └── docs/fetchresult/       # JSON-filer med battlelogs og resultater
│
├── klubbleaderboardfetching/   # Python-skript for klubb-leaderboards
│
├── .github/workflows/          # GitHub Actions for automatisk oppdatering
│
├── automation.log              # Loggfil for automatiske oppdateringer
├── README.md                   # Prosjektbeskrivelse
└── Gemfile                     # Ruby/Jekyll avhengigheter
```

## Komme i gang

1. **Installer avhengigheter**  
   Sørg for at du har Ruby og Bundler installert.
   ```sh
   gem install bundler
   bundle install
   ```

2. **Start Jekyll-serveren lokalt**
   ```sh
   bundle exec jekyll serve
   ```
   Nettsiden vil være tilgjengelig på [http://localhost:4000](http://localhost:4000).

3. **Oppdater statistikk**
   - Kjør Python-skriptene i `winratefetching/` for å hente og oppdatere data.
   - Statistikk oppdateres automatisk via GitHub Actions.

## Bidra

Dette er et hobbyprosjekt, men du kan gjerne sende inn forslag eller pull requests.  
Kontakt @Zimma2832 på Discord for ideer eller spørsmål.

## Lisens

Prosjektet er kun til privat bruk og har ingen offisiell lisens.  
All kode og innhold er laget av Simen "Zimma".

---