import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { addProfile } from "@/app/ranked-profiler/actions";

// Add a ranked profile from the static ranked page's menu (docs/rankedstats/site-menu.js).
// Same checks as the /ranked-profiler/ page: it calls the same function, which runs as the
// logged-in visitor so RLS decides. Cookie-authenticated, so it only accepts same-origin JSON
// (a cross-site form can't send application/json, and the Origin header must match).

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== publicOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Ugyldig forespørsel." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false, message: "Ugyldig forespørsel." }, { status: 415 });
  }

  let body: { tag?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Ugyldig forespørsel." }, { status: 400 });
  }

  const result = await addProfile(String(body.tag ?? ""), String(body.name ?? ""));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
