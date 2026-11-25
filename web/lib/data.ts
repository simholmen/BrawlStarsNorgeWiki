"use cache";

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { Club, Person } from "./types";

// Every export here is cached ('use cache' at module level), so page views are served from the
// Next.js cache instead of hitting Supabase: keeps free-plan egress near zero. Content refreshes
// at most hourly; Phase 4 will call revalidateTag('people' | 'clubs') on save.

const PERSON_COLUMNS =
  "slug,name,subtitle,hjemsted,born,bsid,favorittbrus,favoritt_brawler,quote,fiende," +
  "image_ext,hidden_profile_years,facts,body_md";
const CLUB_COLUMNS =
  "slug,name,aktiv,stiftet,leder,medlemmer,underklubber,image_ext,facts,body_md";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing (see web/.env.example)");
  }
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
