"use client";

import { Fragment, useMemo, useState } from "react";
import { formatNumber, type Toplist, type ToplistEntry } from "@/lib/toplistsBuild";
import { unpackLists, type ToplistsWire } from "@/lib/toplistsWire";
import MinisSwitch from "./MinisSwitch";
import { ANCHOR } from "./anchors";

// The lists on /topplister/ (app/topplister/page.tsx). A client component so the page sends the
// lists once as data and draws only the top 10 of each; the rest is drawn when "Vis alle" is
// opened.

const SHOWN = 10;

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
  const total = entry.coins;
  return (
    <tr className="toplist-breakdown-row">
      <td colSpan={3}>
        {total && (
          <p className="toplist-coins-total">
            Brukt <b>{formatNumber(total.spent)}</b> av {formatNumber(total.max)} coins
            {total.spent < total.max && (
              <>
                {" "}
                · mangler <b>{formatNumber(total.max - total.spent)}</b>
              </>
            )}
            <span className="toplist-coins-note"> (1 power point = 2 coins)</span>
          </p>
        )}
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
              {p.coins && p.coins.max > 0 && (
                <span className="toplist-part-coins">
                  {formatNumber(p.coins.spent)} coins
                  {p.coins.spent < p.coins.max && ` · mangler ${formatNumber(p.coins.max - p.coins.spent)}`}
                </span>
              )}
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
                  {e.miniOf && <> · mini av {e.miniOf}</>}
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
        Alt telles i hva det koster i coins (1 power point = 2 coins):
        <span className="toplist-help-floors">
          nivå 1→11: 15 245 (3 740 PP + 7 765 coins) · star power 2 000 · gadget 1 000 · gear 1 000 (opptil 6) ·
          hypercharge 5 000 · buffie 5 000 (2 000 PP + 1 000 coins)
        </span>
        Prosenten er coinsene kontoen har brukt, delt på det en helt maxet konto ville brukt for alle {brawlers} brawlere som
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

function ListTable({ list, extra }: { list: Toplist; extra: ToplistsExtra }) {
  // Rows past the top 10 are only drawn once "Vis alle" is opened: drawing all of them for all
  // six lists (twice, with and without minis) made the page several MB.
  const [showAll, setShowAll] = useState(false);
  const head = (
    <thead>
      <tr>
        <th className="toplist-pos">#</th>
        <th>Spiller</th>
        <th className="toplist-value">
          {list.title}
          {list.key === "ranked" && <EloHelp />}
          {list.key === "maxed" && <MaxedHelp brawlers={extra.brawlerCount} buffieBrawlers={extra.buffieBrawlers} />}
          {list.key === "experience" && <XpHelp />}
        </th>
      </tr>
    </thead>
  );
  if (list.entries.length === 0) return <p className="auth-small">Ingen tall ennå.</p>;
  const rest = list.entries.length - SHOWN;
  // One table for every row, so the columns line up with the top 10.
  return (
    <table className="toplist">
      {head}
      <tbody>
        <Rows entries={list.entries.slice(0, SHOWN)} offset={0} />
      </tbody>
      {rest > 0 && (
        <>
          <tbody className="toplist-more-row">
            <tr>
              <td colSpan={3}>
                <details className="toplist-more" onToggle={(e) => setShowAll(e.currentTarget.open)}>
                  <summary>Vis alle ({list.entries.length})</summary>
                </details>
              </td>
            </tr>
          </tbody>
          {showAll && (
            <tbody className="toplist-rest">
              <Rows entries={list.entries.slice(SHOWN)} offset={SHOWN} />
            </tbody>
          )}
        </>
      )}
    </table>
  );
}

function Lists({ lists, extra }: { lists: Toplist[]; extra: ToplistsExtra }) {
  return (
    <>
      {lists.map((list) => (
        <section key={list.key}>
          <h2 id={ANCHOR[list.key]} className="toplist-heading">
            {list.title}
          </h2>
          <ListTable list={list} extra={extra} />
        </section>
      ))}
    </>
  );
}

export type ToplistsExtra = { brawlerCount: number; buffieBrawlers: number };

/** The six lists, with the "Ta med minis" switch above them. */
export default function ToplistsView({
  wire,
  miniCount,
  extra,
}: {
  wire: ToplistsWire;
  miniCount: number;
  extra: ToplistsExtra;
}) {
  const lists = useMemo(() => unpackLists(wire, false), [wire]);
  const listsWithMinis = useMemo(() => unpackLists(wire, true), [wire]);
  return (
    <MinisSwitch
      count={miniCount}
      plain={<Lists lists={lists} extra={extra} />}
      withMinis={<Lists lists={listsWithMinis} extra={extra} />}
    />
  );
}
