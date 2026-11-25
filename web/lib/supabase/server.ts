import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

/**
 * Supabase client acting as the logged-in visitor (session from cookies). Uses the publishable
 * key, so the database's RLS decides what this client may do. Reads cookies: only call it inside
 * a <Suspense> boundary, a Server Action or a Route Handler.
 */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, which can't set cookies. proxy.ts refreshes the
          // session cookie on the routes that need it, so this is safe to ignore.
        }
      },
    },
  });
}
