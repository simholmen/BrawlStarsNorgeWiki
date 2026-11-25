# web — Brawl Stars Norge wiki (Next.js)

The Next.js replacement for the Jekyll site in `../docs`, reading wiki content from Supabase.
Plan: `notes/claude-specs/plans/wiki-phase1-readonly.md` (local notes, not in git).

```bash
cp .env.example .env.local   # fill in SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:3000 — /images, /rankedstats, /script.js come from ../docs
npm test                     # renderer unit tests
npm run build
```

- Content: `public.people` / `public.clubs`, filled from `docs/_personer` + `docs/_klubber` by
  `python tools/import_wiki.py` (repo root). The Markdown files stay the source of truth until
  editing goes live.
- `lib/data.ts` is cached (`'use cache'`, hourly), so page views don't hit Supabase.
- `lib/markdown.ts` renders `body_md` / facts: `[[person:slug|Label]]` links, kramdown-compatible
  heading ids, sanitized HTML.
- In production Caddy serves `/`, `/images/**`, `/rankedstats/**` and `/script.js` straight from
  `docs/`; the matching routes in `app/` are dev-only stand-ins.
