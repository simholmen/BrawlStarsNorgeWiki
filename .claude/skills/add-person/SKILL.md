---
name: add-person
description: Create a new person page under docs/_personer and register it in the sideoversikt index. Use when asked to add/create a page for a person/spiller, with a name and usually a Brawl Stars tag/ID, hjemsted (location), and/or born (year). Other fields (favorittbrus, favoritt_brawler, quote, fiende, facts) are optional and should be left blank unless given.
---

# Add a person page

Creates a new page in the `personer` collection and links it from the sideoversikt (`docs/diverse/oversikt/index.html`).

## 1. Gather fields

Required from the user: **name**. Commonly also given: **bsid** (Brawl Stars tag, no `#`), **hjemsted**, **born**.

Optional, leave blank (`""`) or omit entirely if not given: `favorittbrus`, `favoritt_brawler`, `quote`, `fiende`. Never invent values for these — only fill in what the user explicitly provides.

## 2. Pick the filename

`docs/_personer/<slug>.md`, where `<slug>` is the name lowercased with spaces replaced by underscores (e.g. "Star Virus" → `star_virus.md`, "Sus Ram" → `sus_ram.md`). Look at existing files in `docs/_personer/` for precedent if the name is ambiguous.

The site permalink is `/personer/:name/` where Jekyll slugifies the filename (underscores/spaces → hyphens, lowercased) — e.g. `sus_ram.md` → `/personer/sus-ram/`, `the_lord_of_dab.md` → `/personer/the-lord-of-dab/`.

## 3. Check for a profile image

Look under `docs/images/profilbilde/`, `docs/images/bsProfiler2024/`, `docs/images/bsProfiler2025/`, `docs/images/bsProfiler2026/` for a file matching the slug. If none of the yearly profile images exist (the normal case for a brand-new page), set `no_2024_profile: true`, `no_2025_profile: true`, and `no_2026_profile: true` so the layout doesn't render broken `<img>` tags. If an image does exist for a given year, drop that year's flag.

## 4. Write the page

Use this template (see `docs/_personer/scaresquad.md` or `docs/_personer/soulzz.md` for a live example of a minimal page):

```markdown
---
layout: person
title: <Name> - Brawl Stars Norge Wiki
name: <Name>
subtitle: <Name>
hjemsted: <value or blank>
born: <value or blank>
quote: ""
fiende: ""
bsid: <TAG>
facts: []

no_2024_profile: true
no_2025_profile: true
no_2026_profile: true
image_ext: png
---

## Bakgrunn
...

## Karriere
...

## Prestasjoner
...
```

- `title` is always `"<Name> - Brawl Stars Norge Wiki"`.
- `subtitle` defaults to the same as `name` unless the user gives a real subtitle (e.g. a real first name).
- Omit `favorittbrus`/`favoritt_brawler` entirely rather than adding them empty, matching existing minimal pages.
- Keep `facts: []` unless the user gives specific facts.

## 5. Register in the sideoversikt

Edit `docs/diverse/oversikt/index.html`. Find the `<h3>LETTER</h3>` block matching the first letter of the name (uppercase). Insert a link alphabetically among the existing entries in that section:

- If the section currently has one entry inside a single-line `<p> - <a href="...">X</a></p>`, convert it to the multi-line form when adding a second entry:
  ```html
  <p>
      - <a href="/personer/existing/">Existing</a>
      <br>
      - <a href="/personer/new-slug/">New</a>
  </p>
  ```
- If the section already has multiple `<br>`-separated entries, insert the new `- <a href="...">Name</a>` line (with a trailing `<br>` after it, unless it's now last) in alphabetical order among all entries in that letter's block (person pages, klubber, and diverse pages are mixed together alphabetically by their link text — see existing sections like `<h3>M</h3>` or `<h3>S</h3>` for the pattern).
- If the letter's `<h3>` has no `<p>` block yet (empty section), add one.

Do not touch the "Antall person-sider" counter in the infobox unless the user asks — it's tracked separately and isn't part of this task.

## 6. Report back

Summarize what fields were filled vs. left blank, and confirm the alphabetical placement in the oversikt.
