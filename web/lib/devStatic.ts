import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOCS_DIR } from "./paths";

// Development-only stand-in for Caddy: serves /images/**, /rankedstats/** and /script.js from
// docs/ so `npm run dev` looks complete. In production Caddy serves these paths itself and the
// requests never reach Next.js; this returns 404 there just in case.

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
};

export async function serveFromDocs(relPath: string): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const root = path.resolve(DOCS_DIR);
  const full = path.resolve(root, relPath);
  if (!full.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(full);
    const type = TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
    return new Response(body, { headers: { "Content-Type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
