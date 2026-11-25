// Where a page's infobox portrait and Brawl Stars profile screenshots come from. Shared by the
// pages (server) and the editor (browser). An upload (portrait_url / profile_urls, migration 020)
// wins; otherwise the old file under docs/images is used, as before.

import type { EntityKind } from "./fields";

/** Profile screenshots as {"<year>": url}. */
export type ProfileUrls = Record<string, string>;

export const PROFILE_URLS_MAX = 20;
export const PROFILE_YEAR_MIN = 2018;
export const PROFILE_YEAR_MAX = 2099;

export type LegacyProfile = { year: number; src: string; when: string };

/** The old portrait file (docs/images), found via the frozen image_key. */
export function legacyPortrait(kind: EntityKind, imageKey: string, imageExt: string): string {
  return kind === "person"
    ? `/images/profilbilde/${imageKey}.${imageExt}`
    : `/images/klubber/klubb_profilbilde/${imageKey}.${imageExt}`;
}

/** The old profile screenshot files (docs/images), per year, with their original captions. */
export function legacyProfiles(kind: EntityKind, imageKey: string): LegacyProfile[] {
  if (kind === "club") {
    return [{ year: 2025, src: `/images/klubber/klubbprofil/${imageKey}.png`, when: "Juni 2025" }];
  }
  return [
    { year: 2024, src: `/images/bsProfiler2024/${imageKey}_profil.jpg`, when: "Juni 2024" },
    { year: 2025, src: `/images/bsProfiler2025/${imageKey}.png`, when: "Juni 2025" },
    { year: 2026, src: `/images/bsProfiler2026/${imageKey}.png`, when: "Oppdatert august 2026" },
  ];
}

export type ProfileImage = { year: number; src: string; when: string; uploaded: boolean };

/**
 * Every year with a profile screenshot, oldest first: uploads replace that year's old file,
 * uploads for other years are added. `keep` decides which sources may be shown (pages pass a
 * check against the files on disk / the bucket); `hidden` years are left out.
 */
export function profileImages(
  kind: EntityKind,
  imageKey: string,
  uploads: ProfileUrls | null | undefined,
  hidden: readonly number[] = [],
  keep: (src: string) => boolean = () => true,
): ProfileImage[] {
  const byYear = new Map<number, ProfileImage>();
  for (const p of legacyProfiles(kind, imageKey)) byYear.set(p.year, { ...p, uploaded: false });
  for (const [key, src] of Object.entries(uploads ?? {})) {
    const year = Number(key);
    if (!Number.isInteger(year)) continue;
    byYear.set(year, { year, src, when: String(year), uploaded: true });
  }
  return [...byYear.values()]
    .filter((p) => !hidden.includes(p.year) && keep(p.src))
    .sort((a, b) => a.year - b.year);
}
