import type { Metadata } from "next";
import { Suspense } from "react";
import { SITE_TITLE } from "@/lib/slug";
import { requireEditorPage } from "@/app/historikk/gate";
import PlayerManager, { type PlayerView } from "@/components/players/PlayerManager";
import { loadPlayers } from "./actions";

// Spillere: every player on the site (wiki pages with a tag, the ranked roster, toplist-only
// players) in one list, with the shared "Legg til spiller" box. Replaces /ranked-profiler/ and
// /ny/person/ (both redirect here). ?ny=wiki or ?ny=ranked ticks that box; ?vis=wiki|ranked|
// topplister picks the filter.

export const metadata: Metadata = { title: `Spillere - ${SITE_TITLE}`, robots: { index: false } };

const VIEWS: PlayerView[] = ["all", "wiki", "ranked", "topplister"];

export default function PlayersPage(props: PageProps<"/spillere">) {
  return (
    <div className="auth-panel wide">
      <h2>Spillere</h2>
      <p className="auth-small">
        Alle spillerne på siden: de med wiki-side (med tag), de som følges på{" "}
        <a href="/rankedstats/stats.html">ranked-siden</a> (nye kommer med etter neste henting, hver halvtime) og
        de som bare er lagt til på <a href="/topplister/">topplistene</a>. Alle er med på topplistene.
      </p>
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <Players searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Players({ searchParams }: { searchParams: PageProps<"/spillere">["searchParams"] }) {
  await requireEditorPage("/spillere/");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const ny = one(params.ny);
  const vis = one(params.vis) as PlayerView | undefined;
  const result = await loadPlayers();
  if (!result.ok) return <p className="auth-error">{result.message}</p>;
  return (
    <PlayerManager
      initial={result.directory}
      via="spillere"
      defaults={{
        wiki: ny === "wiki",
        ranked: ny === "ranked",
        view: vis && VIEWS.includes(vis) ? vis : "all",
      }}
    />
  );
}
