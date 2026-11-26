# web — Brawl Stars Norge wiki (Next.js)

The wiki at brawlstarsnorge.com, reading its content from Supabase. (It replaced the old Jekyll
site; static files still come from `../docs`.)
Plan: `notes/claude-specs/plans/wiki-phase1-readonly.md` (local notes, not in git).

```bash
cp .env.example .env.local   # fill in SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:3000 — /images, /rankedstats, /script.js come from ../docs
npm test                     # renderer unit tests
npm run build
```

- Content: `public.people` / `public.clubs`, edited on the site by editors (the old Markdown files
  they were imported from are gone; see git history).
- `lib/data.ts` is cached (`'use cache'`, hourly), so page views don't hit Supabase.
- `lib/markdown.ts` renders `body_md` / facts: `[[person:slug|Label]]` links, kramdown-compatible
  heading ids, sanitized HTML.
- In production Caddy serves `/`, `/images/**`, `/rankedstats/**` and `/script.js` straight from
  `docs/`; the matching routes in `app/` are dev-only stand-ins.
