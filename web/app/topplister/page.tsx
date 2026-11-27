import type { Metadata } from "next";
import { getToplists } from "@/lib/toplists";
import { packLists } from "@/lib/toplistsWire";
import { pageTitle } from "@/lib/slug";
import { Toc } from "@/components/Infobox";
import AddPlayersBox from "./AddPlayersBox";
import ToplistsView from "./ToplistsView";
import { ANCHOR } from "./anchors";

// Topplister: the top players in 3v3 wins, Showdown wins, fame and highest ranked elo, among
// everyone on the wiki, the ranked roster and the extra players editors add here. Numbers are
// refreshed once a day by rankedstats/toplists.py (lib/toplists.ts).

export const metadata: Metadata = { title: pageTitle("Topplister") };

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  }).format(new Date(iso));
}

export default async function ToplistsPage() {
  const data = await getToplists();
  return (
    <>
      {/* Editors: the shared add-player box (also on /spillere/), opened from the page bar. */}
      <AddPlayersBox />

      <div className="infobox">
        <div className="infobox-title">Topplister</div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
        <img src="/images/bsnorge.jpg" alt="Brawl Stars Norge" />
        <table>
          <tbody>
            <tr>
              <th>Spillere</th>
              <td>{data.accounts}</td>
            </tr>
            <tr>
              <th>Sist oppdatert</th>
              <td>{data.updatedAt ? formatDate(data.updatedAt) : "ikke ennå"}</td>
            </tr>
            <tr>
              <th>Oppdateres</th>
              <td>hver morgen (nye spillere med en gang)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="strekstopp">Topplister</h2>
      <p>
        De beste norske spillerne i hver kategori, hentet automatisk fra Brawl Stars én gang om dagen. Listene tar med
        alle som har en Brawl Stars-tag på wiki-siden sin, alle som følges på{" "}
        <a href="/rankedstats/stats.html">ranked-siden</a>, og spillere redaktørene har lagt til her. Kryss av for «Ta
        med minis» for å telle med mini-kontoene til spillerne på ranked-siden.
      </p>

      <Toc items={data.lists.map((l, i) => [`#${ANCHOR[l.key]}`, `${i + 1}. ${l.title}`])} />

      <ToplistsView
        wire={packLists(data.lists, data.listsWithMinis)}
        miniCount={data.miniCount}
        extra={{ brawlerCount: data.brawlerCount, buffieBrawlers: data.buffieBrawlers }}
      />
    </>
  );
}
