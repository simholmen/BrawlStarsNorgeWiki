"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidTag, normalizeTag } from "@/lib/rankedTag";

// Writes for ranked_profiles (migration 016), the roster rankedstats/ingest.py tracks. Every call
// runs as the logged-in visitor, so the database decides: RLS lets only editors insert/update and
// a trigger stamps who did it. The checks here only give clear Norwegian messages.

export type ProfileResult = { ok: boolean; message: string };

async function requireEditor() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, error: "Du er ikke logget inn lenger. Logg inn på nytt." };
  const { data: editor } = await supabase.from("editors").select("role").eq("user_id", userId).maybeSingle();
  if (!editor) return { supabase, error: "Du har ikke redigeringstilgang." };
  return { supabase, error: null };
}

function cleanName(raw: unknown): string | null {
  const name = String(raw ?? "").trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

function dbMessage(error: { code?: string }): string {
  if (error.code === "23514") return "Taggen eller navnet er ugyldig.";
  if (error.code === "42501") return "Du har ikke tilgang til å gjøre dette.";
  return "Kunne ikke lagre. Prøv igjen.";
}

/** Add a profile, or turn a removed one back on (with the new name). */
export async function addProfile(rawTag: string, rawName: string): Promise<ProfileResult> {
  const tag = normalizeTag(rawTag);
  if (!isValidTag(tag)) {
    return { ok: false, message: "Ugyldig tag. Brawl Stars-tagger bruker bare 0289PYLQGRJCUV, f.eks. #2GY22JUR." };
  }
  const name = cleanName(rawName);
  if (!name) return { ok: false, message: "Skriv et navn (1–60 tegn)." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data: existing } = await supabase.from("ranked_profiles").select("name, active").eq("tag", tag).maybeSingle();
  if (existing?.active) return { ok: false, message: `${tag} spores allerede (som «${existing.name}»).` };

  const { error: dbError } = existing
    ? await supabase.from("ranked_profiles").update({ name, active: true }).eq("tag", tag)
    : await supabase.from("ranked_profiles").insert({ tag, name });
  if (dbError) return { ok: false, message: dbMessage(dbError) };

  return {
    ok: true,
    message: `${name} (${tag}) er lagt til. Kampene dukker opp på ranked-siden etter neste henting (innen 30 min).`,
  };
}

export async function renameProfile(tag: string, rawName: string): Promise<ProfileResult> {
  const name = cleanName(rawName);
  if (!name) return { ok: false, message: "Skriv et navn (1–60 tegn)." };
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };
  const { data, error: dbError } = await supabase.from("ranked_profiles").update({ name }).eq("tag", tag).select("tag");
  if (dbError) return { ok: false, message: dbMessage(dbError) };
  if (!data?.length) return { ok: false, message: "Profilen finnes ikke." };
  return { ok: true, message: "Lagret." };
}

/** Remove (active = false) or restore a profile. The row is kept either way. */
export async function setProfileActive(tag: string, active: boolean): Promise<ProfileResult> {
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };
  const { data, error: dbError } = await supabase.from("ranked_profiles").update({ active }).eq("tag", tag).select("tag");
  if (dbError) return { ok: false, message: dbMessage(dbError) };
  if (!data?.length) return { ok: false, message: "Profilen finnes ikke." };
  return { ok: true, message: active ? "Lagt til igjen." : "Fjernet." };
}
