"use cache";

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import type { Club, Person } from "./types";

// Every export here is cached ('use cache' at module level), so page views are served from the
// Next.js cache instead of hitting Supabase: keeps free-plan egress near zero. Content refreshes
// at most hourly, and immediately after an edit: the save actions call updateTag('people' | 'clubs').

const PERSON_COLUMNS =
  "slug,name,subtitle,hjemsted,born,bsid,favorittbrus,favoritt_brawler,quote,fiende," +
  "image_ext,image_key,hidden_profile_years,portrait_url,profile_urls,facts,body_md";
const CLUB_COLUMNS =
  "slug,name,aktiv,stiftet,leder,medlemmer,underklubber,image_ext,image_key,portrait_url,profile_urls,facts,body_md";

function client() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getPeople(): Promise<Person[]> {
  cacheLife("hours");
  cacheTag("people");
  const { data, error } = await client().from("people").select(PERSON_COLUMNS).order("name");
  if (error) throw new Error(`people: ${error.message}`);
  return data as unknown as Person[];
}

export async function getPerson(slug: string): Promise<Person | null> {
  const people = await getPeople();
  return people.find((p) => p.slug === slug) ?? null;
}

export async function getClubs(): Promise<Club[]> {
  cacheLife("hours");
  cacheTag("clubs");
  const { data, error } = await client().from("clubs").select(CLUB_COLUMNS).order("name");
  if (error) throw new Error(`clubs: ${error.message}`);
  return data as unknown as Club[];
}

export async function getClub(slug: string): Promise<Club | null> {
  const clubs = await getClubs();
  return clubs.find((c) => c.slug === slug) ?? null;
}

export type MiniAccount = { tag: string; name: string };

/**
 * Active mini accounts (ranked_profiles with main_tag, migration 017), grouped by the main's tag
 * ("#2GY22JUR"). Person pages show them in the infobox. Refreshed when a profile is saved
 * (app/ranked-profiler/actions.ts expires the "ranked_profiles" tag).
 */
export async function getMinisByMain(): Promise<Record<string, MiniAccount[]>> {
  cacheLife("hours");
  cacheTag("ranked_profiles");
  const { data, error } = await client()
    .from("ranked_profiles")
    .select("tag,name,main_tag")
    .eq("active", true)
    .not("main_tag", "is", null)
    .order("name");
  if (error) throw new Error(`ranked_profiles: ${error.message}`);
  const byMain: Record<string, MiniAccount[]> = {};
  for (const row of data ?? []) {
    (byMain[row.main_tag as string] ??= []).push({ tag: row.tag, name: row.name });
  }
  return byMain;
}

export type InGameInfo = {
  name: string | null;
  clubTag: string | null;
  clubName: string | null;
  /** Highest all-time ranked rank, e.g. { label: "Masters I", tier: "Masters", elo: 9816 }. */
  highestRank: { label: string; tier: string; elo: number | null } | null;
  wins3v3: number | null;
};

/**
 * In-game info per tracked tag ("#2GY22JUR"), from the live profile rankedstats/ingest.py stores
 * on `players` every run (migration 018). Person pages show it in the infobox. Refreshed every
 * 30 min to match ingest; serves the cached copy meanwhile.
 */
export async function getInGameInfo(): Promise<Record<string, InGameInfo>> {
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });
  cacheTag("players");
  const db = client();
  const [players, tiers] = await Promise.all([
    db
      .from("players")
      .select("tag,name,profile_name,club_tag,club_name,highest_ranked_rank,highest_ranked_elo,wins_3v3")
      .not("profile_updated_at", "is", null),
    db.from("rank_tiers").select("value,label,tier_name"),
  ]);
  if (players.error) throw new Error(`players: ${players.error.message}`);
  if (tiers.error) throw new Error(`rank_tiers: ${tiers.error.message}`);
  const tierByValue = new Map((tiers.data ?? []).map((t) => [t.value as number, t]));

  const info: Record<string, InGameInfo> = {};
  for (const p of players.data ?? []) {
    const tier = p.highest_ranked_rank ? tierByValue.get(p.highest_ranked_rank) : undefined;
    info[p.tag] = {
      name: p.profile_name ?? p.name ?? null,
      clubTag: p.club_tag,
      clubName: p.club_name,
      highestRank: tier ? { label: tier.label, tier: tier.tier_name, elo: p.highest_ranked_elo } : null,
      wins3v3: p.wins_3v3,
    };
  }
  return info;
}
