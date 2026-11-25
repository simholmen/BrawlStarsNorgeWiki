import { NextResponse } from "next/server";
import { getCurrentUser, getRole } from "@/lib/auth";

// Who is logged in, for pages outside the Next.js app (the static ranked page,
// docs/rankedstats/site-menu.js). Same-origin only: it reads the session cookie.

export async function GET() {
  const user = await getCurrentUser();
  const body = user
    ? { status: "in", name: user.name, avatar: user.avatarUrl, role: await getRole(user.id) }
    : { status: "out" };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
