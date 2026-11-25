/**
 * Jekyll's default `slugify` (what its `:name` permalinks use, and what tools/import_wiki.py
 * ports): runs of anything that isn't a Unicode letter, mark or decimal digit become one "-",
 * leading/trailing "-" are dropped, and the result is lowercased. NFC first, so "ø" typed on any
 * system slugs the same. Every existing page's slug equals slugify(name) (see the fixtures test),
 * so new pages get URLs in the same style: "Star Virus" -> "star-virus", "Norske Brød" ->
 * "norske-brød".
 */
export function slugify(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{Nd}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Image file base name, frozen per page as image_key: Jekyll's `downcase | replace ' ' '_'`. */
export function imageKeyFor(name: string): string {
  return name.toLowerCase().replaceAll(" ", "_");
}
