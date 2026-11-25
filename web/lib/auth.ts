import "server-only";
import { createClient } from "@/lib/supabase/server";

// Data access layer for the logged-in visitor. Everything here reads cookies, so callers must sit
// inside <Suspense> (pages) or be Server Actions / Route Handlers. Authorization is enforced by the
// database (RLS + functions in migration 012); these helpers only decide what to show.

export type CurrentUser = {
  id: string;
  name: string;
  discordName: string | null;
  avatarUrl: string | null;
};

export type Role = "admin" | "editor" | null;

export type AccessRequest = {
  id: string;
  user_id: string;
  discord_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  message: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  reviewed_at: string | null;
};

/** The verified user (JWT checked by getClaims), or null when not logged in. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const meta = (data.claims.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const customClaims = (meta.custom_claims ?? {}) as Record<string, unknown>;
  // Supabase's Discord provider: full_name = handle, name = handle + "#0", custom_claims.global_name
  // = display name (same rules as migration 013's trigger).
  const discordName =
    str(meta.user_name) ??
    str(meta.full_name) ??
    str(meta.preferred_username) ??
    str(typeof meta.name === "string" ? meta.name.replace(/#0$/, "") : null);
  return {
    id: data.claims.sub,
    name: str(customClaims.global_name) ?? discordName ?? "Ukjent",
    discordName,
    avatarUrl: str(meta.avatar_url),
  };
}

/** The visitor's own role (RLS only lets them see their own editors row). */
export async function getRole(userId: string): Promise<Role> {
  const supabase = await createClient();
  const { data } = await supabase.from("editors").select("role").eq("user_id", userId).maybeSingle();
  return (data?.role as Role) ?? null;
}

/** The visitor's most recent access request, if any. */
export async function getLatestOwnRequest(userId: string): Promise<AccessRequest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("access_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AccessRequest) ?? null;
}
