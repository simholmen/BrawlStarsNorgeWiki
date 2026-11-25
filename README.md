# Brawl Stars Norge Wiki

Dette er et fritidsprosjekt for å samle og vise statistikk, historie og profiler fra det norske Brawl Stars-miljøet.  

Prosjektet bruker [Jekyll](https://jekyllrb.com/) for å generere en statisk nettside, og inneholder automatiske oppdateringer av spillerstatistikk via Python- og Shell-skript.

## 🌐 Live 
[Live Server](https://brawlstarsnorge.com/index.html)

## 🚧 Ny versjon (beta)

Wikien flyttes fra Jekyll til en Next.js-app med innlogging og redigering, se
[beta.brawlstarsnorge.com](https://beta.brawlstarsnorge.com) (kode i `web/`, database i `supabase/`).

- **Person- og klubbsider redigeres nå på beta-siden** (av godkjente redaktører), ikke i
  `docs/_personer/` og `docs/_klubber/`. De Markdown-filene er frosset og brukes ikke lenger som kilde.
- Den gamle Jekyll-siden på brawlstarsnorge.com står uendret til overgangen er ferdig.

## Innhold

- **docs/** – Kildekoden til nettsiden, inkludert HTML, CSS, JS, og Jekyll-data.
- **rankedstats/** – Python-ingest som henter ranked-kamper fra Brawl Stars API til Supabase (kjøres via cron på en droplet).

## Funksjoner

- **Spillerprofiler** med bakgrunn, prestasjoner og favoritter.
- **Ranked-statistikk** for alle spillere.
- **Klubboversikt** og historiske resultater.
- **Turneringshistorikk** og leaderboard.

## Prosjektstruktur

docs/  
 ├─ _data/                    # YAML-data (f.eks. tournament_stats.yml)  
 ├─ _personer/                 # Spillerprofiler i Markdown  
 ├─ diverse/                   # Diverse undersider  
 ├─ style.css                  # Hovedstilark  
 ├─ script.js                  # Hoved JavaScript-fil  
 └─ index.html                 # Hovedside  

.github/workflows/  
 └─ ...                       # GitHub Actions for automatisk oppdatering  

automation.log                 # Loggfil for automatiske oppdateringer  
README.md                    # Prosjektbeskrivelse  
Gemfile                      # Ruby/Jekyll avhengigheter  


## Komme i gang

1. **Installer avhengigheter**  
   Sørg for at du har Ruby og Bundler installert.
   ```sh
   gem install bundler
   bundle install
   ```

2. **Start Jekyll-serveren lokalt**
   ```sh
   bundle exec jekyll serve --source docs --livereload
   ```
   Nettsiden vil være tilgjengelig på [http://localhost:4000](http://localhost:4000).

3. **Oppdater statistikk**
   - Ranked-statistikk oppdateres automatisk av `rankedstats/ingest.py` via cron (se `rankedstats/README.md`).

## Bidra

Dette er et hobbyprosjekt, men du kan gjerne sende inn forslag eller pull requests.  
Kontakt @Zimma2832 på Discord for ideer eller spørsmål.

## Lisens

Prosjektet er kun til privat bruk og har ingen offisiell lisens.  
All kode og innhold er laget av Simen "Zimma".

---