"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser-side Supabase client (one per tab). Session lives in cookies shared with the server. */
export function getBrowserClient() {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createBrowserClient(url, key);
  }
  return client;
}
