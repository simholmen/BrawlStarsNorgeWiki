import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { publicOrigin } from "@/lib/origin";

// Discord -> Supabase -> here with ?code=... (PKCE). Exchange it for a session cookie, then send
// the visitor on to ?next (same-site paths only).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (searchParams.get("error")) {
    // e.g. the visitor pressed "Cancel" on Discord's consent screen
    return NextResponse.redirect(new URL("/logg-inn/?feil=avbrutt", origin), 303);
  }
  if (!code) return NextResponse.redirect(new URL("/logg-inn/?feil=feil", origin), 303);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/logg-inn/?feil=feil", origin), 303);

  return NextResponse.redirect(new URL(next, origin), 303);
}
