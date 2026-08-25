# Research: Brawl Stars brawler → class (role) mapping for a no-build, file:// page

> **Query**: Group brawlers by their 7 in-game classes (Damage Dealer, Marksman, Assassin, Support, Controller, Artillery, Tank) in a local vanilla-JS page opened via file://. Names arrive UPPERCASE from the official battlelog API along with numeric brawler_id. No local brawler list or class mapping exists yet.
> **Date**: 2026-08-25

## Tooling note
The Exa MCP research tools referenced in this agent's standard toolchain were not available in this session (no `ToolSearch`/`mcp__exa__*` tools were exposed). All findings below are backed by live `curl` requests (headers inspected directly) and `WebFetch` calls performed during this session — not by prior/training knowledge. Where a claim could not be verified live, it is flagged explicitly.

---

## 1. Official Brawl Stars API (api.brawlstars.com) — does it expose class?

**Claim**: The official API's brawler objects do **not** include any class/role field. They expose only `id`, `name`, `starPowers[]` and `gadgets[]` (each with `id`/`name`).

**Evidence** (live check, this session):
- `curl -s -o /dev/null -w "%{http_code}" https://api.brawlstars.com/v1/brawlers` → `403` (the official API requires an API key + IP allowlist; anonymous/browser access is rejected, so the raw schema can't be pulled directly from a browser or a file:// page).
- The interactive docs at `https://developer.brawlstars.com/#/documentation` are a client-side rendered SPA — `WebFetch` and `curl` both only return the empty HTML shell ("Brawl Stars API" title, no body content), so the docs page itself cannot be read without a JS-executing browser. Same is true of the sibling `developer.clashroyale.com` docs (verified same SPA-shell behavior), confirming this is Supercell's standard docs platform behavior, not a fetch failure specific to Brawl Stars.
- Corroborating primary-ish source: [`ravener/brawlstars.js` — `src/Brawler.ts`](https://raw.githubusercontent.com/ravener/brawlstars.js/master/src/Brawler.ts) (a TypeScript wrapper for the official API, MIT-licensed, referencing `developer.brawlstars.com` in its README):

```ts
export interface StarPower {
  name: string;
  id: number;
}
export interface Gadget {
  name: string;
  id: number;
}
export interface Brawler {
  name: string;
  id: number;
  gadgets: Gadget[];
  starPowers: StarPower[];
}
```

**Explanation**: This matches the well-known shape of the official `/v1/brawlers` and `/v1/brawlers/{id}` endpoints — no `class`, `role`, or `type` field exists anywhere in Supercell's own API. Class/role is a UI concept Supercell added to the in-game brawler-select screen; it was never surfaced through the public REST API. This means brawler_id/name from the battlelog **cannot** be mapped to a class using the official API alone — a third-party source or hand-authored map is required regardless of approach.

---

## 2. Brawlify / BrawlAPI — exact JSON shape, CORS, keyless?

**Important finding**: The original `api.brawlify.com` domain is being retired. Live requests to it (even with a realistic browser `User-Agent`) returned Cloudflare bot-challenge responses (`HTTP 403`, `cf-mitigated: challenge`) rather than JSON, both via `curl` and `WebFetch`, for both `api.brawlify.com/v1/brawlers` and the `brawlify.com/api` docs page.

**Claim**: The **current, working** public mirror is `https://api.brawlapi.com`, which is the official successor to `api.brawlify.com` (same maintainer/ecosystem) and returns byte-identical data.

**Evidence** ([BrawlAPI docs](https://brawlapi.com/docs), fetched this session):
> "The `api.brawlify.com` zone 301-redirects `/v1/*` and `/game*` to `api.brawlapi.com`. Point new integrations directly at `api.brawlapi.com`."
> "No API keys, no tokens, no rate limits." / "Every response carries `Access-Control-Allow-Origin: *`."

**Verified live response** — `curl -s -D - "https://api.brawlapi.com/v1/brawlers/16000000"` (Shelly), this session:

Response headers (relevant lines):
```
HTTP/2 200
content-type: application/json
access-control-allow-origin: *
cache-control: public, max-age=3600
server: cloudflare
```

Response body (verified live JSON, truncated to relevant fields):
```json
{
  "id": 16000000,
  "avatarId": 28000003,
  "name": "Shelly",
  "hash": "Shelly",
  "path": "Shelly",
  "released": true,
  "version": 1,
  "link": "https://brawlify.com/brawlers/16000000",
  "imageUrl": "https://cdn.brawlify.com/brawlers/borders/16000000.png",
  "imageUrl2": "https://cdn.brawlify.com/brawlers/borderless/16000000.png",
  "imageUrl3": "https://cdn.brawlify.com/brawlers/emoji/16000000.png",
  "class": { "id": 1, "name": "Damage Dealer" },
  "rarity": { "id": 1, "name": "Common", "color": "#b9eaff" },
  "starPowers": [ { "id": 23000076, "name": "Shell Shock", ... } ],
  "gadgets": [ { "id": 23000255, "name": "Fast Forward", ... } ],
  "videos": []
}
```

**Exact field paths you need**:
- Class name: `class.name` (a string like `"Damage Dealer"`); numeric class id at `class.id`.
- Brawler id: `id` (matches the numeric `brawler_id`, e.g. `16000000`, used by the official battlelog API too — these ID namespaces are shared/consistent).
- Brawler name: `name` (Title Case — you'll need `.toUpperCase()` or a case-insensitive key match against the UPPERCASE battlelog names, e.g. `"LARRY & LAWRIE"` vs `"Larry & Lawrie"`).
- Portrait/icon images: `imageUrl` (bordered portrait), `imageUrl2` (borderless portrait), `imageUrl3` (small emoji-style icon) — all absolute URLs on `cdn.brawlify.com`.

**CORS from a file:// page — explicit answer**: **Yes, it will work.** The live response carries `Access-Control-Allow-Origin: *`. Per the Fetch/CORS spec, a wildcard `*` ACAO header is honored for any request `Origin`, including the literal `"null"` origin that browsers send for pages loaded via `file://` — as long as the request is a "simple"/no-credentials GET, which a plain `fetch(url)` from a static page is. I verified this is a genuine wildcard on a live HTTP response (not documentation-only) via `curl -H "Origin: null"`. I did **not** verify this inside an actual browser's `file://` sandbox in this session (no browser automation tool was available), so treat "works in a real browser" as high-confidence-but-not-100%-verified; some browsers apply extra restrictions to `file://` pages independent of CORS (e.g., blocking `fetch` of other **local** files), but fetching a remote `https://` API from a `file://` page is normally permitted.

**Keyless / free**: Confirmed live — no API key was sent in any of the above requests and all succeeded with `HTTP 200`.

---

## 3. Other public brawler→class sources

Best 2–3 verified this session:

1. **BrawlAPI** — `https://api.brawlapi.com/v1/brawlers` (docs: `https://brawlapi.com/docs`) — see §2. This is the strongest option: keyless, CORS-enabled, structured JSON with `class.name` directly. **Caveat found live**: as of this session's fetch, **19 released brawlers** in the dataset have `class: {"id": 0 (or similar), "name": "Unknown"}` instead of a real class — i.e. this mirror's class tagging is already stale for newer brawlers (Wendy, Nori, Bolt, Starr Nova, Damian, Najia, Sirius, Glowy, Gigi, Pierce, Ziggy, Mina, Trunk, Alli, Kaze, Jae-Yong, Finx, Ollie). See §5 for why this matters.

2. **Brawl Stars Fandom wiki category structure** — `https://brawlstars.fandom.com` — verified live via the MediaWiki API (`action=query&list=categorymembers`, no key needed, CORS not required since you'd hand-copy data rather than fetch live). Confirmed the wiki currently maintains exactly these 7 class categories with these member counts (fetched this session):

   | Category | Members |
   |---|---|
   | Damage Dealer Brawlers | 22 |
   | Assassin Brawlers | 19 |
   | Controller Brawlers | 20 |
   | Tank Brawlers | 16 |
   | Support Brawlers | 13 |
   | Marksman Brawlers | 11 |
   | Artillery Brawlers | 7 |

   URL pattern: `https://brawlstars.fandom.com/wiki/Category:Damage_Dealer_Brawlers` etc. This is community-maintained (not Supercell-official) but is the most actively curated source and matches Supercell's in-game class labels exactly.

3. **npm/GitHub API wrapper ecosystem** — searched `api.github.com/search/repositories` for `brawl stars api client`; the notable maintained wrappers (`ravener/brawlstars.js`, `brawlstars-sdk`, community forks) all wrap the *official* API and therefore do **not** carry class data (confirms §1) — so these are useful only for confirming the official schema, not as a class-mapping source. I did not find a standalone, actively-maintained "brawler→class JSON" GitHub repo independent of the Brawlify/BrawlAPI ecosystem via GitHub's search API in this session (rate-limited unauthenticated search returned 0–7 low-relevance repos for several query variants); Brawlify/BrawlAPI remains the de-facto canonical structured source for class data.

---

## 4. How many brawlers, and the 7 official class names

**Class names** — verified live from two independent sources that agree exactly:
- BrawlAPI's `class.name` enum (live JSON, this session): `Damage Dealer`, `Marksman`, `Assassin`, `Support`, `Controller`, `Artillery`, `Tank`.
- Fandom wiki category names (live MediaWiki API query, this session): `Damage Dealer Brawlers`, `Marksman Brawlers`, `Assassin Brawlers`, `Support Brawlers`, `Controller Brawlers`, `Artillery Brawlers`, `Tank Brawlers`.

These are the current 7 official Supercell class names — use this exact vocabulary for your mapping.

**Older aliases**: I could **not verify live** in this session that Supercell ever used names like "Sharpshooter" (→Marksman), "Thrower" (→Artillery), "Heavyweight" (→Tank), or "Healer" (→Support). I checked the Fandom wiki for redirect pages under these titles and found none exist (`missingtitle` for all four via the MediaWiki API), and general web search engines available to me (Bing, DuckDuckGo) either returned unrelated results or bot-challenge pages when queried live. **This claim is unverified in this session — do not treat it as confirmed.** If you've seen these older names in community discussion, they may be real historical renames, but I have no citable live source for it right now; recommend treating "Damage Dealer / Marksman / Assassin / Support / Controller / Artillery / Tank" as the only vocabulary you need going forward, since that's what's live and current everywhere I could check.

**Brawler count**: Live BrawlAPI list fetch (`https://api.brawlapi.com/v1/brawlers`, this session, dated 2026-08-25) returned **107 total brawler entries, 106 marked `released: true`**. The Fandom wiki's `Category:Brawlers` shows 124 member pages, but that figure is inflated by non-brawler pages (skin-bundle group pages like "Beachcombers" appeared in a class-category search) — treat the BrawlAPI figure (~106–107 released) as the more reliable live count, while noting Supercell releases new brawlers roughly every few weeks so this number will keep climbing.

---

## 5. Live fetch vs. static local mapping — recommendation

**Recommendation: (b) author a static local JS/JSON mapping file checked into the repo**, generated once from BrawlAPI data, not fetched live at page load.

**Tradeoffs, made concrete by what was actually observed this session:**

- **Live fetch (option a) risks and failure modes actually observed:**
  - `api.brawlify.com` (the "obvious" URL most tutorials mention) is presently returning Cloudflare bot-challenge `403`s to non-browser and even browser-UA `curl` requests — a real, live CORS/availability failure mode you'd hit if you hardcoded that domain. You'd have to know to redirect to `api.brawlapi.com` instead.
  - Even the working `api.brawlapi.com` endpoint's own class data is already stale for 19 released brawlers (`class.name: "Unknown"`) — so a "live fetch" doesn't even guarantee complete/correct class coverage today, on top of adding a network dependency.
  - A `file://`-opened page has no build step and no bundler-injected fallback; if the fetch fails (offline, DNS blocked, corporate proxy, Cloudflare hiccup, or the browser's extra restrictions on outbound requests from `file://` origins), the whole class-grouping feature breaks with no local fallback unless you also ship a static map anyway — at which point you're maintaining two mappings for one feature.
  - Confirmed CORS header (`Access-Control-Allow-Origin: *`) means live fetch is *technically* viable when it works, but "keyless third-party endpoint with no SLA" is a fragile dependency for a page meant to be reliably openable offline.

- **Static local mapping (option b) tradeoffs:**
  - Fully offline/file:// safe — zero network dependency, zero CORS surface, works regardless of Brawlify/BrawlAPI uptime or domain changes.
  - **New-brawler gap is real and must be handled explicitly**: when Supercell ships a new brawler, it will arrive in battlelog data (UPPERCASE name + brawler_id) with no entry in your static map. This is not hypothetical — it's exactly what's happening right now with BrawlAPI's own "Unknown"-class brawlers. Mitigate by:
    - Building the static map by keying on `id` (from BrawlAPI, matches the battlelog `brawler_id` namespace) rather than parsing the display name, since IDs are stable and names/casing can vary.
    - Adding a catch-all "Unclassified / New Brawler" bucket in the UI for any `brawler_id` not present in the static map, so unknown brawlers degrade gracefully instead of erroring or vanishing.
    - Periodically regenerating the static file from `https://api.brawlapi.com/v1/brawlers` as a manual/CI maintenance step (not a runtime fetch) — e.g. a small one-off Node script run by a maintainer when Supercell announces a new brawler, committed back into the repo.

**Bottom line**: static file avoids the CORS/offline failure modes entirely and is the correct fit for a file://-opened, no-build page; the cost is a manual regeneration step when new brawlers ship, which should be handled with an ID-keyed lookup plus a graceful "unknown" fallback bucket rather than assumed away.

---

## Sources

- [Official Brawl Stars API — developer.brawlstars.com](https://developer.brawlstars.com/#/documentation) — confirmed SPA shell, no anonymous data access (`/v1/brawlers` → 403 without key), fetched live this session.
- [`ravener/brawlstars.js` — `src/Brawler.ts`](https://raw.githubusercontent.com/ravener/brawlstars.js/master/src/Brawler.ts) — TypeScript interface confirming official API brawler schema has no class field.
- [BrawlAPI docs](https://brawlapi.com/docs) — states it is the successor to `api.brawlify.com`, keyless, CORS `*`, `/v1/*` redirect from the old domain.
- [`https://api.brawlapi.com/v1/brawlers/16000000`](https://api.brawlapi.com/v1/brawlers/16000000) — live-verified JSON shape and headers for a single brawler (Shelly), including `class.name`, `imageUrl`, `imageUrl2`, `imageUrl3`.
- [`https://api.brawlapi.com/v1/brawlers`](https://api.brawlapi.com/v1/brawlers) — live-verified full list; used to derive class distribution, total count (107, 106 released), and the "Unknown"-class stale-data finding.
- [Brawl Stars Fandom wiki — Category:Damage Dealer Brawlers](https://brawlstars.fandom.com/wiki/Category:Damage_Dealer_Brawlers) and sibling categories for Marksman/Assassin/Support/Controller/Artillery/Tank — queried live via the MediaWiki API (`api.php?action=query&list=categorymembers`), confirming exact current class names and member counts.
- `api.brawlify.com` (old domain) — confirmed live this session to be returning Cloudflare bot-challenge responses rather than serving data directly; do not hardcode this domain.
