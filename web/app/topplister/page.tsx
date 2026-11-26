import type { Metadata } from "next";
import { Fragment } from "react";
import { getToplists } from "@/lib/toplists";
import { formatNumber, type Toplist, type ToplistEntry, type Toplists } from "@/lib/toplistsBuild";
import { pageTitle } from "@/lib/slug";
import { Toc } from "@/components/Infobox";
import ToplistEditor from "./ToplistEditor";

// Topplister: the top players in 3v3 wins, Showdown wins, fame and highest ranked elo, among
// everyone on the wiki, the ranked roster and the extra players editors add here. Numbers are
// refreshed once a day by rankedstats/toplists.py (lib/toplists.ts).

export const metadata: Metadata = { title: pageTitle("Topplister") };

const SHOWN = 10;

const ANCHOR: Record<Toplist["key"], string> = {
  wins3v3: "3v3-seire",
  showdown: "showdown-seire",
  fame: "fame",
  ranked: "ranked-elo",
  experience: "xp-niva",
  maxed: "maxet-konto",
};

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

const pctFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/** Whole percent, rounded down: 217/218 shows 99 %, only a full part shows 100 %. */
function partPercent(owned: number, max: number): number {
  return owned >= max ? 100 : Math.floor((owned / max) * 100);
}

/**
 * Maxet konto: the % is a toggle. Its breakdown is the next table row (BreakdownRow), shown by CSS
 * while this is open (tr:has(details[open]) + tr), so it gets the full width of the table, also
 * on phones.
 */
function BreakdownToggle({ entry }: { entry: ToplistEntry }) {
  return (
    <details className="toplist-breakdown">
      <summary aria-label={`${entry.display}, vis hva kontoen har av hver del`}>
        <span className="toplist-number">{entry.display}</span>
      </summary>
    </details>
  );
}

function BreakdownRow({ entry }: { entry: ToplistEntry }) {
  return (
    <tr className="toplist-breakdown-row">
      <td colSpan={3}>
        <ul className="toplist-parts">
          {entry.breakdown!.map((p) => (
            <li key={p.label} className={p.max > 0 && p.owned >= p.max ? "full" : undefined}>
              <span className="toplist-part-label">{p.label}</span>
              <span className="toplist-part-count">
                {formatNumber(p.owned)}/{formatNumber(p.max)}
              </span>
              <span className="toplist-part-pct">
                {p.max > 0 ? `${pctFormat.format(partPercent(p.owned, p.max))}\u00a0%` : "–"}
              </span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

function Rows({ entries, offset }: { entries: ToplistEntry[]; offset: number }) {
  return (
    <>
      {entries.map((e, i) => {
        const pos = offset + i + 1;
        return (
          <Fragment key={e.tag}>
            <tr className={pos <= 3 ? "toplist-top3" : undefined}>
              <td className="toplist-pos">{pos}</td>
              <td>
                {e.href ? <a href={e.href}>{e.name}</a> : <span>{e.name}</span>}
                {e.inGameName && <span className="toplist-ingame"> ({e.inGameName})</span>}
                <div className="toplist-sub">
                  <a href={`https://brawlace.com/players/%23${e.tag.slice(1)}`} className="toplist-tag">
                    {e.tag}
                  </a>
                  {e.club && <> · {e.club}</>}
                </div>
              </td>
              <td className="toplist-value">
                {e.breakdown ? (
                  <BreakdownToggle entry={e} />
                ) : (
                  <span className="toplist-number">
                    {e.rankIcon && (
                      // eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy
                      <img
                        src={`/rankedstats/images/ranks/icon_rank_sticker_${e.rankIcon}.png`}
                        alt=""
                        width={18}
                        height={18}
                      />
                    )}
                    {e.display ?? formatNumber(e.value)}
                  </span>
                )}
                {e.detail && <div className="toplist-sub">{e.detail}</div>}
              </td>
            </tr>
            {e.breakdown && <BreakdownRow entry={e} />}
          </Fragment>
        );
      })}
    </>
  );
}

/** The "?" on the ranked list's header: why some elos are lowered (lib/toplistsBuild.ts fairRankedElo). */
function EloHelp() {
  return (
    <span className="toplist-help" tabIndex={0} role="button" aria-label="Om justert elo">
      ?
      <span className="toplist-help-text" role="tooltip">
        Noen kontoer har en høyeste elo fra det gamle ranked-systemet som er høyere enn ranken de faktisk nådde. For
        å gjøre listen rettferdig teller en elo som når starten på neste rank, som starten på ranken spilleren nådde:
        <span className="toplist-help-floors">
          Diamond I 3 000 · II 3 500 · III 4 000
          <br />
          Mythic I 4 500 · II 5 000 · III 5 500
          <br />
          Legendary I 6 000 · II 6 750 · III 7 500
          <br />
          Masters I 8 250 · II 9 250 · III 10 250 · Pro 11 250
        </span>
        Noen få har fått elo-en sin rettet for hånd når den riktige er kjent. Justerte spillere viser «justert fra»
        med tallet profilen deres viser.
      </span>
    </span>
  );
}

/** The "?" on the Maxet konto header: how the % is counted (lib/toplistsBuild.ts maxPoints). */
function MaxedHelp({ brawlers, buffieBrawlers }: { brawlers: number; buffieBrawlers: number }) {
  return (
    <span className="toplist-help" tabIndex={0} role="button" aria-label="Om maxet konto">
      ?
      <span className="toplist-help-text" role="tooltip">
        Hver brawler gir poeng for det kontoen har låst opp:
        <span className="toplist-help-floors">
          nivå (1 per nivå, maks 11) · 2 star powers · 2 gadgets · opptil 6 gears · hypercharge · buffies (0–3)
        </span>
        Prosenten er poengene kontoen har, delt på det en helt maxet konto ville hatt for alle {brawlers} brawlere som
        kan låses opp nå (brawlere som er annonsert, men ikke kommet ennå, telles ikke). Brawlere kontoen ikke har gir
        0. Buffies telles bare for brawlere som har dem; det oppdages automatisk
        når noen her har låst dem opp ({buffieBrawlers} brawlere så langt).
      </span>
    </span>
  );
}

/** The "?" on the XP-nivå header: what the number is. */
function XpHelp() {
  return (
    <span className="toplist-help" tabIndex={0} role="button" aria-label="Om XP-nivå">
      ?
      <span className="toplist-help-text" role="tooltip">
        XP-nivå er det gamle erfaringsnivået på Brawl Stars-profilen. Spillet viser det knapt lenger, men du får
        fortsatt XP for kampene du spiller, så nivået går sakte oppover. Listen sorteres etter antall XP-poeng (tallet
        under nivået), så to spillere på samme nivå står i riktig rekkefølge.
      </span>
    </span>
  );
}

function ListTable({ list, data }: { list: Toplist; data: Toplists }) {
  const head = (
    <thead>
      <tr>
        <th className="toplist-pos">#</th>
        <th>Spiller</th>
        <th className="toplist-value">
          {list.title}
          {list.key === "ranked" && <EloHelp />}
          {list.key === "maxed" && <MaxedHelp brawlers={data.brawlerCount} buffieBrawlers={data.buffieBrawlers} />}
          {list.key === "experience" && <XpHelp />}
        </th>
      </tr>
    </thead>
  );
  if (list.entries.length === 0) return <p className="auth-small">Ingen tall ennå.</p>;
  const rest = list.entries.slice(SHOWN);
  return (
    <>
      <table className="toplist">
        {head}
        <tbody>
          <Rows entries={list.entries.slice(0, SHOWN)} offset={0} />
        </tbody>
      </table>
      {rest.length > 0 && (
        <details className="toplist-more">
          <summary>Vis alle ({list.entries.length})</summary>
          <table className="toplist">
            <tbody>
              <Rows entries={rest} offset={SHOWN} />
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}

export default async function ToplistsPage() {
  const data = await getToplists();
  return (
    <>
      {/* Editors: the add-player box, opened from the page bar. */}
      <ToplistEditor extras={data.extras} coveredTags={data.coveredTags} />

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
        <a href="/rankedstats/stats.html">ranked-siden</a>, og spillere redaktørene har lagt til her. Mini-kontoer er
        ikke med.
      </p>

      <Toc items={data.lists.map((l, i) => [`#${ANCHOR[l.key]}`, `${i + 1}. ${l.title}`])} />

      {data.lists.map((list) => (
        <section key={list.key}>
          <h2 id={ANCHOR[list.key]} className="toplist-heading">
            {list.title}
          </h2>
          <ListTable list={list} data={data} />
        </section>
      ))}

    </>
  );
}
