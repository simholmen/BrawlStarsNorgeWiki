"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidTag, normalizeTag } from "@/lib/rankedTag";

// Writes for ranked_profiles (migrations 016-017), the roster rankedstats/ingest.py tracks. Every
// call runs as the logged-in visitor, so the database decides: RLS lets only editors
// insert/update, triggers stamp who did it and keep minis one level deep. The checks here only
// give clear Norwegian messages.
//
// Minis (main_tag set) show on wiki pages, which are cached under the "ranked_profiles" tag, so
// every write expires it. revalidateTag (not updateTag) because addProfile is also called from a
// Route Handler (app/api/ranked-profiler).

export type ProfileResult = { ok: boolean; message: string };

type Row = { tag: string; name: string; active: boolean; main_tag: string | null };

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

function checkTag(raw: string): { tag: string } | { error: string } {
  const tag = normalizeTag(raw);
  if (!isValidTag(tag)) {
    return { error: "Ugyldig tag. Brawl Stars-tagger bruker bare 0289PYLQGRJCUV, f.eks. #2GY22JUR." };
  }
  return { tag };
}

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "23514") return "Taggen eller navnet er ugyldig.";
  if (error.code === "42501") return "Du har ikke tilgang til å gjøre dette.";
  return "Kunne ikke lagre. Prøv igjen.";
}

function changed() {
  revalidateTag("ranked_profiles", { expire: 0 });
}

const ADDED_NOTE = "Kampene dukker opp på ranked-siden etter neste henting (innen 30 min).";

/** Add a main profile, or turn a removed one back on (with the new name, as a main). */
export async function addProfile(rawTag: string, rawName: string): Promise<ProfileResult> {
  const checked = checkTag(rawTag);
  if ("error" in checked) return { ok: false, message: checked.error };
  const { tag } = checked;
  const name = cleanName(rawName);
  if (!name) return { ok: false, message: "Skriv et navn (1–60 tegn)." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data: existing } = await supabase
    .from("ranked_profiles")
    .select("tag, name, active, main_tag")
    .eq("tag", tag)
    .maybeSingle<Row>();
  if (existing?.active) {
    return {
      ok: false,
      message: existing.main_tag
        ? `${tag} spores allerede som mini-konto («${existing.name}»).`
        : `${tag} spores allerede (som «${existing.name}»).`,
    };
  }

  const { error: dbError } = existing
    ? await supabase.from("ranked_profiles").update({ name, active: true, main_tag: null }).eq("tag", tag)
    : await supabase.from("ranked_profiles").insert({ tag, name });
  if (dbError) return { ok: false, message: dbMessage(dbError) };

  changed();
  return { ok: true, message: `${name} (${tag}) er lagt til. ${ADDED_NOTE}` };
}

/**
 * Add a mini account under `mainTag`. If the tag is already a profile it's moved under the main
 * (e.g. an old separate "Zimmas mini" profile); a removed one is turned back on.
 */
export async function addMini(mainTag: string, rawTag: string, rawName: string): Promise<ProfileResult> {
  const checked = checkTag(rawTag);
  if ("error" in checked) return { ok: false, message: checked.error };
  const { tag } = checked;
  if (tag === mainTag) return { ok: false, message: "En konto kan ikke være sin egen mini." };
  const name = cleanName(rawName);
  if (!name) return { ok: false, message: "Skriv et navn (1–60 tegn)." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data: rows } = await supabase
    .from("ranked_profiles")
    .select("tag, name, active, main_tag")
    .in("tag", [mainTag, tag])
    .returns<Row[]>();
  const main = rows?.find((r) => r.tag === mainTag);
  const existing = rows?.find((r) => r.tag === tag);
  if (!main || !main.active) return { ok: false, message: "Hovedkontoen finnes ikke lenger." };
  if (main.main_tag) return { ok: false, message: "En mini-konto kan ikke ha egne mini-kontoer." };
  if (existing?.active && existing.main_tag === mainTag) {
    return { ok: false, message: `${tag} er allerede en mini-konto av ${main.name}.` };
  }

  const { error: dbError } = existing
    ? await supabase.from("ranked_profiles").update({ name, active: true, main_tag: mainTag }).eq("tag", tag)
    : await supabase.from("ranked_profiles").insert({ tag, name, main_tag: mainTag });
  if (dbError) return { ok: false, message: dbMessage(dbError) };

  changed();
  const moved = existing?.active ? " (flyttet fra egen profil)" : "";
  return { ok: true, message: `${name} (${tag}) er lagt til som mini-konto av ${main.name}${moved}. ${ADDED_NOTE}` };
}

export async function renameProfile(tag: string, rawName: string): Promise<ProfileResult> {
  const name = cleanName(rawName);
  if (!name) return { ok: false, message: "Skriv et navn (1–60 tegn)." };
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };
  const { data, error: dbError } = await supabase.from("ranked_profiles").update({ name }).eq("tag", tag).select("tag");
  if (dbError) return { ok: false, message: dbMessage(dbError) };
  if (!data?.length) return { ok: false, message: "Profilen finnes ikke." };
  changed();
  return { ok: true, message: "Lagret." };
}

/**
 * Remove (active = false) or restore a profile; rows are kept either way. Removing a main also
 * removes its minis. A mini can only be restored while its main is active.
 */
export async function setProfileActive(tag: string, active: boolean): Promise<ProfileResult> {
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data: row } = await supabase
    .from("ranked_profiles")
    .select("tag, name, active, main_tag")
    .eq("tag", tag)
    .maybeSingle<Row>();
  if (!row) return { ok: false, message: "Profilen finnes ikke." };

  if (active && row.main_tag) {
    const { data: main } = await supabase
      .from("ranked_profiles")
      .select("active")
      .eq("tag", row.main_tag)
      .maybeSingle<{ active: boolean }>();
    if (!main?.active) return { ok: false, message: "Legg til hovedkontoen igjen først." };
  }

  const { error: dbError } = await supabase.from("ranked_profiles").update({ active }).eq("tag", tag);
  if (dbError) return { ok: false, message: dbMessage(dbError) };

  let extra = "";
  if (!active && !row.main_tag) {
    const { data: minis, error: miniError } = await supabase
      .from("ranked_profiles")
      .update({ active: false })
      .eq("main_tag", tag)
      .eq("active", true)
      .select("tag");
    if (miniError) return { ok: false, message: dbMessage(miniError) };
    if (minis?.length) extra = ` Mini-kontoene (${minis.length}) ble også fjernet.`;
  }

  changed();
  return { ok: true, message: (active ? "Lagt til igjen." : "Fjernet.") + extra };
}
