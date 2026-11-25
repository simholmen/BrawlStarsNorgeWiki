import { serveFromDocs } from "@/lib/devStatic";

// Dev-only: production serves /images/** from docs/ via Caddy (see lib/devStatic.ts).
export async function GET(_req: Request, ctx: RouteContext<"/images/[...path]">) {
  const { path } = await ctx.params;
  return serveFromDocs(["images", ...path.map(decodeURIComponent)].join("/"));
}
