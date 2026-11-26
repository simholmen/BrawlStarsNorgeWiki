import "server-only";
import { getClubs, getPeople } from "./data";
import { getDiversePages } from "./diverse";

// Every page on the wiki, for the Sideoversikt and the search field in the page bar
// (components/PageNav.tsx, via /api/sider/). Built from the cached people/clubs/diverse lists, so
// it refreshes when those do.

export type PageEntry = { name: string; href: string; kind: "person" | "klubb" | "side" };

// Pages outside the wiki's own routes (static, served from docs/ by Caddy).
const OTHER: PageEntry[] = [
  { name: "Wiki forside", href: "/wiki/", kind: "side" },
  { name: "Ranked Stats", href: "/rankedstats/stats.html", kind: "side" },
];

const collator = new Intl.Collator("nb", { sensitivity: "base" });

export async function getPageIndex() {
  const [people, clubs, diversePages] = await Promise.all([getPeople(), getClubs(), getDiversePages()]);
  const clubNames = new Set(clubs.map((c) => c.name.toLowerCase()));
  // The Sideoversikt is in docs/diverse/ too, but doesn't list itself.
  const diverse: PageEntry[] = [
    ...diversePages
      .filter((p) => p.slug !== "oversikt")
      .map((p) => ({ name: p.name, href: p.href, kind: "side" as const })),
    ...OTHER.filter((o) => o.href !== "/wiki/"),
  ];

  const entries: PageEntry[] = [
    ...people.map((p) => ({
      // A person who shares a club's name gets a suffix, as on the old page.
      name: clubNames.has(p.name.toLowerCase()) ? `${p.name} (person)` : p.name,
      href: `/personer/${p.slug}/`,
      kind: "person" as const,
    })),
    ...clubs.map((c) => ({ name: c.name, href: `/klubber/${c.slug}/`, kind: "klubb" as const })),
    ...diverse,
  ].sort((a, b) => collator.compare(a.name, b.name));

  return { entries, people: people.length, clubs: clubs.length, diverse: diverse.length };
}

/** What the search field can find: every listed page, plus the front page and the Sideoversikt. */
export async function getSearchIndex(): Promise<PageEntry[]> {
  const { entries } = await getPageIndex();
  return [...entries, OTHER[0], { name: "Sideoversikt", href: "/diverse/oversikt/", kind: "side" }];
}
