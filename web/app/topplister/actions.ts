"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidTag, normalizeTag } from "@/lib/rankedTag";
import { createEntity } from "@/app/rediger/actions";
import { addProfile, setProfileActive } from "@/app/ranked-profiler/actions";

// Writes for toplist_players (migration 021): extra accounts on /topplister/ that have no wiki
// page and aren't on the ranked roster. Runs as the logged-in visitor, so RLS decides (editors
// only); the checks here only give clear Norwegian messages.

export type ToplistResult = {
  ok: boolean;
  message: string;
  /** Set when a wiki page was made: its address, for an "open it" link. */
  url?: string;
  /** Set when the player was just put on the ranked roster: what "Angre" needs to take it back. */
  undo?: RankedUndo;
};

/** Taking back "Følg på ranked": the profile, and the toplist-only row it switched off (if any). */
export type RankedUndo = { tag: string; name: string; restoreExtra: boolean };

const DAILY_NOTE = "Tallene dukker opp om et par minutter (last siden på nytt).";

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

/** Change the name a toplist-only player is shown under (not their in-game name). */
export async function renameToplistPlayer(tag: string, rawName: string): Promise<ToplistResult> {
  const name = String(rawName ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, message: "Skriv et navn (1–60 tegn)." };
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };
  const { data, error: dbError } = await supabase
    .from("toplist_players")
    .update({ name })
    .eq("tag", tag)
    .select("tag");
  if (dbError) return { ok: false, message: dbMessage(dbError) };
  if (!data?.length) return { ok: false, message: "Spilleren finnes ikke." };
  updateTag("toplists");
  return { ok: true, message: `Navnet er endret til ${name}.` };
}

export type AddOptions = { ranked: boolean; wiki: boolean };

/**
 * The shared "Legg til spiller" form (components/players/PlayerManager.tsx): put a player on the ranked roster and/or give them a wiki page (both
 * put them on the toplists automatically), or with neither ticked, add them to the toplists
 * only. Also used to promote a toplist-only player; their toplist_players row is then switched
 * off, since the wiki page / ranked profile now covers them.
 */
export async function addPlayer(rawTag: string, rawName: string, options: AddOptions): Promise<ToplistResult> {
  if (!options.ranked && !options.wiki) return addToplistPlayer(rawTag, rawName);
  // Only a wiki page and no tag: a person page without a tag (not on the toplists).
  if (options.wiki && !options.ranked && !String(rawTag ?? "").replace(/[\s#]/g, "")) {
    const r = await createEntity("person", { name: String(rawName ?? "").trim() });
    return r.ok
      ? { ok: true, message: `Wiki-side laget for ${String(rawName).trim()}.`, url: r.url }
      : { ok: false, message: r.message };
  }

  const tag = normalizeTag(rawTag);
  if (!isValidTag(tag)) {
    return { ok: false, message: "Ugyldig tag. Brawl Stars-tagger bruker bare 0289PYLQGRJCUV, f.eks. #2GY22JUR." };
  }
  const name = String(rawName ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, message: "Skriv et navn (1–60 tegn)." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const messages: string[] = [];
  let url: string | undefined;
  let failed = false;
  let covered = false;
  let rankedAdded = false;
  let wikiMade = false;

  if (options.wiki) {
    const { data: person } = await supabase.from("people").select("name,slug").ilike("bsid", tag.slice(1)).maybeSingle();
    if (person) {
      messages.push(`Har allerede en wiki-side (${person.name}).`);
      covered = true;
    } else {
      const r = await createEntity("person", { name, bsid: tag });
      if (r.ok) {
        url = r.url;
        wikiMade = true;
        messages.push("Wiki-side laget.");
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
      messages.push(`Lagt til på ranked-siden; kommer på topplistene om et par minutter.`);
      covered = true;
      rankedAdded = true;
    } else if (/spores allerede/.test(r.message)) {
      messages.push(r.message);
      covered = true;
    } else {
      messages.push(`Ranked: ${r.message}`);
      failed = true;
    }
  }

  // Covered by the wiki / ranked roster now: the toplist-only row is no longer needed.
  let extraOff = false;
  if (covered) {
    const { data: off } = await supabase
      .from("toplist_players")
      .update({ active: false })
      .eq("tag", tag)
      .eq("active", true)
      .select("tag");
    extraOff = Boolean(off?.length);
    if (options.wiki && !options.ranked) messages.push(DAILY_NOTE);
  }

  updateTag("toplists");
  // A wiki page made in the same go keeps them on the toplists, so undo then leaves the
  // toplist-only row off.
  const undo = rankedAdded ? { tag, name, restoreExtra: extraOff && !wikiMade } : undefined;
  return { ok: !failed, message: `${name} (${tag}): ${messages.join(" ")}`, url, undo };
}

/** "Angre" after "Følg på ranked": remove the profile again, and put back the toplist-only row. */
export async function undoFollowRanked(undo: RankedUndo): Promise<ToplistResult> {
  const r = await setProfileActive(undo.tag, false);
  if (!r.ok) return r;
  if (undo.restoreExtra) {
    const back = await setToplistPlayerActive(undo.tag, true);
    if (!back.ok) return { ok: false, message: `Fjernet fra ranked, men ikke lagt tilbake på topplistene: ${back.message}` };
  }
  updateTag("toplists");
  return { ok: true, message: `Angret: ${undo.name} følges ikke lenger på ranked-siden.` };
}
