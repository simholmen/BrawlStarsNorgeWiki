"use cache";

import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { Liquid } from "liquidjs";
import YAML from "yaml";
import { DOCS_DIR } from "./paths";

// Renders the hand-written Jekyll pages (docs/wiki/index.html, docs/diverse/*/index.html)
// straight from docs/, so there is no second copy to drift until cutover. Their Liquid
// ({{ site.baseurl }}, loops over site.data.tournament_stats) runs through liquidjs with the
// same `site` variables Jekyll provides. These files are repo content, not user input.

export type JekyllPage = { title: string | null; html: string };

const liquid = new Liquid({ strictVariables: false, strictFilters: true });

// Jekyll runs Ruby Liquid; two filters behave differently in liquidjs and are overridden here.
// `size` of a hash is its key count in Ruby (liquidjs returns 0 for plain objects).
liquid.registerFilter("size", (v: unknown) => {
  if (v == null) return 0;
  if (typeof v === "string" || Array.isArray(v)) return v.length;
  if (typeof v === "object") return Object.keys(v as object).length;
  return 0;
});
// `round: n` on a Float keeps a decimal in Ruby (100.0 -> "100.0"); the YAML stats are floats.
liquid.registerFilter("round", (v: unknown, places?: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  const p = Number(places ?? 0);
  if (p <= 0) return Math.round(n);
  const f = 10 ** p;
  const rounded = Math.round(n * f) / f;
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
});

async function loadSiteData(): Promise<Record<string, unknown>> {
  const dir = path.join(DOCS_DIR, "_data");
  const data: Record<string, unknown> = {};
  for (const file of await readdir(dir)) {
    const ext = path.extname(file);
    if (ext !== ".yml" && ext !== ".yaml") continue;
    data[path.basename(file, ext)] = YAML.parse(await readFile(path.join(dir, file), "utf8"));
  }
  return data;
}

function splitFrontMatter(text: string): { front: Record<string, unknown>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { front: {}, body: text };
  return { front: (YAML.parse(match[1]) as Record<string, unknown>) ?? {}, body: text.slice(match[0].length) };
}

/** `route` is the URL path without slashes, e.g. "wiki" or "diverse/slindringene". */
export async function renderJekyllPage(route: string): Promise<JekyllPage> {
  cacheLife("hours");
  const file = path.join(DOCS_DIR, ...route.split("/"), "index.html");
  const { front, body } = splitFrontMatter(await readFile(file, "utf8"));
  const html = await liquid.parseAndRender(body, {
    site: { baseurl: "", data: await loadSiteData() },
    page: front,
  });
  return { title: typeof front.title === "string" ? front.title : null, html };
}
