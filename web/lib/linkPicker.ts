// Pure text helpers for the "[[" wiki-link picker in the editor.

export type WikiEntity = { kind: "person" | "klubb"; slug: string; name: string };

/** If the caret is inside an unfinished "[[query", return where it starts and the query text. */
export function findLinkQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (/[\]\n|]/.test(query) || query.length > 40) return null;
  return { start, query };
}

/** Replace "[[query" (start..caret) with a finished link; returns the new text and caret. */
export function insertLink(
  text: string,
  start: number,
  caret: number,
  entity: WikiEntity,
): { text: string; caret: number } {
  const link = `[[${entity.kind}:${entity.slug}|${entity.name}]]`;
  return { text: text.slice(0, start) + link + text.slice(caret), caret: start + link.length };
}

const fold = (s: string) => s.normalize("NFC").toLocaleLowerCase("nb");

/** Best matches first: name starts with the query, then contains it; people before clubs. */
export function filterEntities(all: WikiEntity[], query: string, limit = 8): WikiEntity[] {
  const q = fold(query.trim());
  const scored = all
    .map((e) => {
      const name = fold(e.name);
      const score = !q ? 1 : name.startsWith(q) ? 0 : name.includes(q) || e.slug.includes(q) ? 1 : -1;
      return { e, score };
    })
    .filter((x) => x.score >= 0);
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (a.e.kind === b.e.kind ? 0 : a.e.kind === "person" ? -1 : 1) ||
      a.e.name.localeCompare(b.e.name, "nb"),
  );
  return scored.slice(0, limit).map((x) => x.e);
}
