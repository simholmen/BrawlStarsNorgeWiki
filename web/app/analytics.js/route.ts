import { serveFromDocs } from "@/lib/devStatic";

// Dev-only: production serves /analytics.js from docs/ via Caddy (see lib/devStatic.ts).
export async function GET() {
  return serveFromDocs("analytics.js");
}
