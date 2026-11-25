import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { DOCS_DIR } from "./paths";
import { supabaseEnv } from "./env";
import { isUploadedImage } from "./uploads";

/**
 * The Jekyll layouts' filename rule: `name | downcase | replace: ' ', '_'`.
 * (Liquid's downcase is ASCII-only, but no current name has non-ASCII capitals.)
 */
export function imageBaseName(name: string): string {
  return name.toLowerCase().replaceAll(" ", "_");
}

/**
 * True if `/images/...` exists under docs/. The live site renders <img> tags for images that
 * don't exist; the new site leaves those out instead.
 */
export function imageExists(urlPath: string): boolean {
  if (!urlPath.startsWith("/images/")) return false;
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const full = path.resolve(DOCS_DIR, rel);
  if (!full.startsWith(path.resolve(DOCS_DIR, "images") + path.sep)) return false;
  return existsSync(full);
}

/**
 * Whether a page may show an image (body text, portrait, profile screenshots): a file that exists
 * under docs/images, or one uploaded from the editor into this project's wiki-images bucket.
 * Anything else (other sites, missing files) is left out.
 */
export function imageAvailable(src: string): boolean {
  return imageExists(src) || isUploadedImage(src, supabaseEnv().url);
}
