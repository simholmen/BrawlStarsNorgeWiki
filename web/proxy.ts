import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

// Refreshes the Supabase session cookie before the account/admin/auth routes render (Server
// Components can't write cookies themselves). Deliberately NOT run on wiki pages: those are
// prerendered and never wait on Supabase.

export async function proxy(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Verifies the JWT and refreshes it if expired (writing new cookies via setAll).
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/konto/:path*", "/admin/:path*", "/auth/:path*", "/logg-inn/:path*"],
};
