---
name: add-person
description: Add a new person (spiller) page to the wiki. Use when asked to add/create a page for a person/spiller, usually with a name and a Brawl Stars tag/ID, hjemsted (location) and/or born (year). Since Phase 4 of the wiki migration, people live in Supabase and are created on the site, not as Markdown files.
---

# Add a person page

**Since 2026-11-25 (wiki migration Phase 4) people and clubs live in Supabase**, and editors create
and edit them on the site. `docs/_personer/` and `docs/_klubber/` are **frozen**: don't add or edit
files there, and don't run `tools/import_wiki.py` (it refuses once the site has edits, because it
would overwrite them). See `notes/claude-specs/plans/wiki-migration.md` → "Where we are".

## Preferred: the user does it on the site

Tell the user to open **https://beta.brawlstarsnorge.com/ny/person/** (needs an editor account;
admins approve access on `/admin/tilgang/`):

1. Fill in **Navn** (required), and optionally **Brawl Stars ID** (without `#`), **Hjemsted**,
   **Født**. The page shows the URL it will get (`/personer/<slug>/`); it can't change later.
2. **Lag side** opens the new page in edit mode for the rest (quote, favoritter, fakta, tekst).
   Links to other pages: type `[[` and pick from the list.
3. The page is listed on `/diverse/oversikt/` automatically. No other file needs updating.

Only fill in values the user actually gave; never invent favorittbrus, quote, etc.

## If the user asks Claude to create it directly

Insert the row with the Supabase CLI (always `--remote`). Every rule the site applies is enforced
by the database (migration 014), so a bad value is rejected rather than stored:

- `slug`: Jekyll slugify of the name, see `web/lib/slugify.ts` (lowercase, runs of anything that
  isn't a letter/digit become `-`, e.g. "Star Virus" → `star-virus`). Check it doesn't exist.
- `image_key`: name lowercased with spaces → `_` (`star_virus`). Used for image file names.
- `bsid`: uppercase, no `#`.
- `body_md`: start with `## Bakgrunn\n\n\n## Karriere\n\n\n## Prestasjoner\n\n` so the TOC works.

```bash
npx supabase db query --remote --yes "insert into public.people (slug, name, image_key, bsid, hjemsted, born, body_md) values ('<slug>', '<Name>', '<image_key>', '<BSID>', '<hjemsted>', '<born>', E'## Bakgrunn\n\n\n## Karriere\n\n\n## Prestasjoner\n\n')"
```

Rows created this way are recorded in `revisions` as "Import fra Markdown" (no user). The beta site
picks the new page up within the hour (its cache), or immediately after the next deploy.

## Notes

- **Images** (portrait `docs/images/profilbilde/<image_key>.<ext>`, yearly profile screenshots)
  are still added as files in `docs/images/` by hand; pages without them simply show none.
- **Ranked tracking:** a wiki page's `bsid` does **not** make the person tracked. The ranked roster
  is the `ranked_profiles` table, managed on the site under ☰ → **Ranked-profiler** (wiki-migration
  Phase 2). If the user also wants the player on the ranked page, add them there (tag + name); a
  wiki page with a tag that isn't tracked shows up there as a one-click suggestion.
- **The live site** (brawlstarsnorge.com, Jekyll) doesn't show site edits until cutover (Phase 5).
