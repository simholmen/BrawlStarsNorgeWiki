"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getRole } from "@/lib/auth";
import { buildPlayerDirectory, type ExtraRow, type PersonRow, type PlayerDirectory, type RankedRow } from "@/lib/playerDirectory";

// Reads for the shared "Legg til spiller" box (components/players/PlayerManager.tsx). Editors
// only: the list shows who added and removed whom. The writes are the existing actions in
// app/topplister/actions.ts (addPlayer and the toplist-only player) and
// app/ranked-profiler/actions.ts (ranked profiles and minis).

export type LoadResult = { ok: true; directory: PlayerDirectory } | { ok: false; message: string };

export async function loadPlayers(): Promise<LoadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Du er ikke logget inn lenger. Logg inn på nytt." };
  if (!(await getRole(user.id))) return { ok: false, message: "Du har ikke redigeringstilgang." };

  const supabase = await createClient();
  const [people, ranked, extras] = await Promise.all([
    supabase.from("people").select("slug,name,bsid,created_at").not("bsid", "is", null),
    supabase
      .from("ranked_profiles")
      .select("tag,name,active,main_tag,created_at,created_by_name,updated_at,updated_by_name"),
    supabase
      .from("toplist_players")
      .select("tag,name,active,created_at,created_by_name,updated_at,updated_by_name"),
  ]);
  if (people.error || ranked.error || extras.error) {
    return { ok: false, message: "Kunne ikke hente spillerne. Last siden på nytt." };
  }
  return {
    ok: true,
    directory: buildPlayerDirectory({
      people: people.data as PersonRow[],
      ranked: ranked.data as RankedRow[],
      extras: extras.data as ExtraRow[],
    }),
  };
}
