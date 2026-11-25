import { serveFromDocs } from "@/lib/devStatic";

// Dev-only: production serves /rankedstats/** from docs/ via Caddy (see lib/devStatic.ts).
export async function GET(_req: Request, ctx: RouteContext<"/rankedstats/[...path]">) {
  const { path } = await ctx.params;
  return serveFromDocs(["rankedstats", ...path.map(decodeURIComponent)].join("/"));
}
