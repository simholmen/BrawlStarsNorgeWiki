// Brawl Stars player tags, as stored in ranked_profiles.tag / players.tag: "#" + upper case,
// using only the characters 0289PYLQGRJCUV (same check as migration 016).

export const TAG_PATTERN = /^#[0289PYLQGRJCUV]{3,14}$/;

/**
 * Turn whatever an editor typed ("#2gy22jur", " 2GY22JUR ", "#2GY 22JUR") into "#2GY22JUR".
 * The letter O never appears in tags, so it's read as zero (a common typo).
 */
export function normalizeTag(input: string): string {
  const core = input.toUpperCase().replace(/[\s#]/g, "").replace(/O/g, "0");
  return `#${core}`;
}

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag);
}

/** A stored tag with or without "#" (people.bsid has none) as "#ABC…", or null if it isn't valid. */
export function tagOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tag = `#${raw.trim().replace(/^#/, "").toUpperCase()}`;
  return isValidTag(tag) ? tag : null;
}
