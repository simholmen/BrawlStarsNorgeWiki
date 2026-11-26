"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidTag, normalizeTag } from "@/lib/rankedTag";
import { createEntity } from "@/app/rediger/actions";
import { addProfile } from "@/app/ranked-profiler/actions";

// Writes for toplist_players (migration 021): extra accounts on /topplister/ that have no wiki
// page and aren't on the ranked roster. Runs as the logged-in visitor, so RLS decides (editors
// only); the checks here only give clear Norwegian messages.

export type ToplistResult = { ok: boolean; message: string };

const DAILY_NOTE = "Tallene kommer med etter neste daglige oppdatering (hver morgen).";

async function requireEditor() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, error: "Du er ikke logget inn lenger. Logg inn på nytt." };
  const { data: editor } = await supabase.from("editors").select("role").eq("user_id", userId).maybeSingle();
  if (!editor) return { supabase, error: "Du har ikke redigeringstilgang." };
  return { supabase, error: null };
}

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "23514") return "Taggen eller navnet er ugyldig.";
  if (error.code === "42501") return "Du har ikke tilgang til å gjøre dette.";
  return "Kunne ikke lagre. Prøv igjen.";
}

export async function addToplistPlayer(rawTag: string, rawName: string): Promise<ToplistResult> {
  const tag = normalizeTag(rawTag);
  if (!isValidTag(tag)) {
    return { ok: false, message: "Ugyldig tag. Brawl Stars-tagger bruker bare 0289PYLQGRJCUV, f.eks. #2GY22JUR." };
  }
  const name = String(rawName ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, message: "Skriv et navn (1–60 tegn)." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  // Already on the lists through a wiki page or the ranked roster?
  const bare = tag.slice(1);
  const [{ data: person }, { data: profile }, { data: existing }] = await Promise.all([
    supabase.from("people").select("name").ilike("bsid", bare).maybeSingle(),
    supabase.from("ranked_profiles").select("name").eq("tag", tag).eq("active", true).is("main_tag", null).maybeSingle(),
    supabase.from("toplist_players").select("name,active").eq("tag", tag).maybeSingle(),
  ]);
  if (person) return { ok: false, message: `${tag} er allerede med, fra wiki-siden til ${person.name}.` };
  if (profile) return { ok: false, message: `${tag} er allerede med, fra ranked-profilen ${profile.name}.` };
  if (existing?.active) return { ok: false, message: `${tag} er allerede lagt til (som «${existing.name}»).` };

  const { error: dbError } = existing
    ? await supabase.from("toplist_players").update({ name, active: true }).eq("tag", tag)
    : await supabase.from("toplist_players").insert({ tag, name });
  if (dbError) return { ok: false, message: dbMessage(dbError) };

  updateTag("toplists");
  return { ok: true, message: `${name} (${tag}) er lagt til. ${DAILY_NOTE}` };
}

export async function setToplistPlayerActive(tag: string, active: boolean): Promise<ToplistResult> {
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };
  const { data, error: dbError } = await supabase
    .from("toplist_players")
    .update({ active })
    .eq("tag", tag)
    .select("tag");
  if (dbError) return { ok: false, message: dbMessage(dbError) };
  if (!data?.length) return { ok: false, message: "Spilleren finnes ikke." };
  updateTag("toplists");
  return { ok: true, message: active ? `Lagt til igjen. ${DAILY_NOTE}` : "Fjernet fra topplistene." };
}

export type AddOptions = { ranked: boolean; wiki: boolean };

/**
 * The Topplister add form: put a player on the ranked roster and/or give them a wiki page (both
 * put them on the toplists automatically), or with neither ticked, add them to the toplists
 * only. Also used to promote a toplist-only player; their toplist_players row is then switched
 * off, since the wiki page / ranked profile now covers them.
 */
export async function addPlayer(rawTag: string, rawName: string, options: AddOptions): Promise<ToplistResult> {
  if (!options.ranked && !options.wiki) return addToplistPlayer(rawTag, rawName);

  const tag = normalizeTag(rawTag);
  if (!isValidTag(tag)) {
    return { ok: false, message: "Ugyldig tag. Brawl Stars-tagger bruker bare 0289PYLQGRJCUV, f.eks. #2GY22JUR." };
  }
  const name = String(rawName ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, message: "Skriv et navn (1–60 tegn)." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const messages: string[] = [];
  let failed = false;
  let covered = false;

  if (options.wiki) {
    const { data: person } = await supabase.from("people").select("name,slug").ilike("bsid", tag.slice(1)).maybeSingle();
    if (person) {
      messages.push(`Har allerede en wiki-side (${person.name}).`);
      covered = true;
    } else {
      const r = await createEntity("person", { name, bsid: tag });
      if (r.ok) {
        messages.push(`Wiki-side laget på ${r.url}.`);
        covered = true;
      } else {
        messages.push(`Wiki-side: ${r.message}`);
        failed = true;
      }
    }
  }

  if (options.ranked) {
    const r = await addProfile(tag, name);
    if (r.ok) {
      messages.push(`Lagt til på ranked-siden; kommer på topplistene innen 30 min.`);
      covered = true;
    } else if (/spores allerede/.test(r.message)) {
      messages.push(r.message);
      covered = true;
    } else {
      messages.push(`Ranked: ${r.message}`);
      failed = true;
    }
  }

  // Covered by the wiki / ranked roster now: the toplist-only row is no longer needed.
  if (covered) {
    await supabase.from("toplist_players").update({ active: false }).eq("tag", tag).eq("active", true);
    if (options.wiki && !options.ranked) messages.push(DAILY_NOTE);
  }

  updateTag("toplists");
  return { ok: !failed, message: `${name} (${tag}): ${messages.join(" ")}` };
}
