"use cache";

import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import YAML from "yaml";
import { DOCS_DIR } from "./paths";
import { SITE_TITLE } from "./slug";

// The "diverse" pages: every docs/diverse/<slug>/index.html, found by listing the folder, so a
// new page there shows up on /diverse/[page] and in the Sideoversikt without touching code.
// The display name is the page's front matter title, minus the " - Brawl Stars Norge Wiki" suffix.

export type DiversePage = { slug: string; name: string; href: string };

function nameFromTitle(title: unknown, slug: string): string {
  if (typeof title !== "string" || !title.trim()) return slug;
  return title.replace(new RegExp(`\\s*-\\s*${SITE_TITLE}\\s*$`), "").trim() || slug;
}

export async function getDiversePages(): Promise<DiversePage[]> {
  // On the dev server, edits in docs/ show up on the next reload or the one after, without a
  // restart. (stale and expire stay at 5 minutes: anything shorter leaves the page out of its
  // static shell, which the dev server reports as a blocking-prerender error on every load.)
  if (process.env.NODE_ENV === "development") cacheLife({ stale: 300, revalidate: 1, expire: 300 });
  else cacheLife("hours");
  const dir = path.join(DOCS_DIR, "diverse");
  const pages: DiversePage[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let text: string;
    try {
      text = await readFile(path.join(dir, entry.name, "index.html"), "utf8");
    } catch {
      continue;
    }
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const title = front ? (YAML.parse(front[1]) as Record<string, unknown> | null)?.title : null;
    pages.push({ slug: entry.name, name: nameFromTitle(title, entry.name), href: `/diverse/${entry.name}/` });
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}
