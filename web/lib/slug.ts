/** Route params may arrive percent-encoded for non-ASCII slugs (norske-brød); normalize them. */
export function normalizeSlug(raw: string): string {
  let slug = raw;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    // not encoded
  }
  return slug.normalize("NFC");
}

export const SITE_TITLE = "Brawl Stars Norge Wiki";

export function pageTitle(name: string): string {
  return `${name} - ${SITE_TITLE}`;
}
