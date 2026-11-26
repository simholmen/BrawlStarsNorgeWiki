"use cache";

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import { buildToplists, type ExtraPlayer, type Toplists } from "./toplistsBuild";

// Data for /topplister/ (migration 021). The numbers come from toplist_stats, refreshed once a
// day by rankedstats/toplists.py; which accounts count and what they're called comes from the
// wiki (people.bsid), the ranked roster (main profiles) and toplist_players (extra accounts
// editors add on the page). "Maxet konto" also needs brawler_catalogue (migration 022: what each
// brawler can have, incl. detected buffies). Cached for hours, and expired right away when the
// people / ranked roster / extra players change.

function client() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getToplists(): Promise<Toplists> {
  // "minutes": players added on the page get numbers from the --new cron within a minute
  // (rankedstats/toplists.py), which can't expire this cache, so check the database often.
  cacheLife("minutes");
  cacheTag("toplists", "people", "ranked_profiles");
  const db = client();
  const [stats, people, profiles, extras, tiers, catalogue] = await Promise.all([
    db
      .from("toplist_stats")
      .select(
        "tag,profile_name,club_name,wins_3v3,wins_solo,wins_duo,fame,fame_tier_name,highest_ranked_elo,highest_ranked_rank,fetched_at,exp_level,exp_points,brawlers_owned,owned_levels,owned_star_powers,owned_gadgets,owned_gears,owned_hypercharges,owned_buffies",
      ),
    db.from("people").select("slug,name,bsid").not("bsid", "is", null),
    db.from("ranked_profiles").select("tag,name").eq("active", true).is("main_tag", null),
    db
      .from("toplist_players")
      .select("tag,name,active,created_by_name,created_at")
      .order("name"),
    db.from("rank_tiers").select("value,label,tier_name"),
    db
      .from("brawler_catalogue")
      .select("released,star_powers,gadgets,gears,hypercharges,buffie_gadget,buffie_star_power,buffie_hypercharge"),
  ]);
  for (const [label, r] of Object.entries({ stats, people, profiles, extras, tiers, catalogue })) {
    if (r.error) throw new Error(`toplists ${label}: ${r.error.message}`);
  }
  return buildToplists({
    stats: stats.data ?? [],
    people: people.data ?? [],
    profiles: profiles.data ?? [],
    extras: (extras.data ?? []) as ExtraPlayer[],
    tiers: tiers.data ?? [],
    catalogue: catalogue.data ?? [],
  });
}
