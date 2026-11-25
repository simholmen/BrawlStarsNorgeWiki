// Supabase project URL + publishable key. Both are public (the key only grants what RLS allows),
// and the browser client needs them, so they're NEXT_PUBLIC_ (inlined into the client bundle at
// build time). Older SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY names still work on the server.

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing (see web/.env.example)",
    );
  }
  return { url, key };
}
