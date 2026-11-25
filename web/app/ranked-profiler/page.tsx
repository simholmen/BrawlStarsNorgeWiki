import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SITE_TITLE } from "@/lib/slug";
import { requireEditorPage } from "@/app/historikk/gate";
import ProfileManager, { type Profile, type WikiPerson } from "./ProfileManager";

// The ranked roster (ranked_profiles, migration 016): which players rankedstats/ingest.py
// tracks. Editors add/rename/remove profiles and their mini accounts here, without needing a wiki
// page.

export const metadata: Metadata = { title: `Ranked-profiler - ${SITE_TITLE}`, robots: { index: false } };

export default function RankedProfilesPage() {
  return (
    <div className="auth-panel wide">
      <h2>Ranked-profiler</h2>
      <p className="auth-small">
        Spillerne som hentes til <a href="/rankedstats/stats.html">ranked-siden</a>. Nye profiler kommer med
        etter neste henting (hver halvtime). En profil trenger ikke en wiki-side.
      </p>
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <Profiles />
      </Suspense>
    </div>
  );
}

async function Profiles() {
  await requireEditorPage("/ranked-profiler/");
  const supabase = await createClient();
  const [{ data: profiles }, { data: people }] = await Promise.all([
    supabase
      .from("ranked_profiles")
      .select("tag, name, active, main_tag, created_at, created_by_name, updated_at, updated_by_name")
      .order("name"),
    supabase.from("people").select("slug, name, bsid").not("bsid", "is", null).order("name"),
  ]);

  const wikiPeople: WikiPerson[] = (people ?? [])
    .filter((p) => p.bsid && p.bsid.trim())
    .map((p) => ({ slug: p.slug, name: p.name, tag: `#${p.bsid!.trim().toUpperCase()}` }));

  return <ProfileManager profiles={(profiles ?? []) as Profile[]} wikiPeople={wikiPeople} />;
}
