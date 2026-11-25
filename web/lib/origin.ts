import type { NextRequest } from "next/server";

/**
 * The public origin the visitor used (https://beta.brawlstarsnorge.com), not the internal
 * http://127.0.0.1:3000 that Next.js sees behind Caddy. Caddy passes the Host header through and
 * sets X-Forwarded-Proto.
 */
export function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!host) return request.nextUrl.origin;
  return `${proto ?? request.nextUrl.protocol.replace(":", "")}://${host}`;
}
