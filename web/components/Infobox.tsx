import type { ReactNode } from "react";
import type { Fact } from "@/lib/types";
import { renderInline } from "@/lib/markdown";
import type { InGameInfo } from "@/lib/data";

// The infobox table shared by the person and club layouts (docs/_layouts/{person,klubb}.html).

export type InfoRow = { label: string; value: ReactNode };

export function Infobox({
  title,
  image,
  rows,
  facts,
  children,
}: {
  title: ReactNode;
  image: { src: string; alt: string } | null;
  rows: InfoRow[];
  facts: Fact[];
  /** Extra blocks under the table (e.g. <MiniAccounts>). */
  children?: ReactNode;
}) {
  return (
    <div className="infobox">
      <div className="infobox-title">{title}</div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy
        <img src={image.src} alt={image.alt} />
      )}
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
          {facts.map((fact, i) => (
            <tr key={`fact-${i}`}>
              <th>{fact.label}</th>
              <td dangerouslySetInnerHTML={{ __html: renderInline(fact.value) }} />
            </tr>
          ))}
        </tbody>
      </table>
      {children}
    </div>
  );
}

const numberFormat = new Intl.NumberFormat("nb-NO");

/**
 * Live in-game info for a person's main account (players columns from migration 018, refreshed
 * by every ranked ingest run). `clubHref` links the club to its wiki page when one exists.
 */
export function InGameInfoSection({
  info,
  tag,
  clubHref,
}: {
  info: InGameInfo;
  tag: string;
  clubHref: string | null;
}) {
  const rows: Array<[label: string, value: ReactNode]> = [];
  if (info.name) {
    rows.push([
      "Ingame-navn",
      <a key="n" href={`/rankedstats/stats.html?player=${encodeURIComponent(tag)}`}>
        {info.name}
      </a>,
    ]);
  }
  rows.push([
    "Klubb",
    info.clubName ? (
      clubHref ? <a href={clubHref}>{info.clubName}</a> : info.clubName
    ) : (
      <span className="infobox-muted">Ingen klubb</span>
    ),
  ]);
  if (info.highestRank) {
    rows.push([
      "Høyeste ranked",
      <span key="r" className="infobox-rank">
        {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
        <img
          src={`/rankedstats/images/ranks/icon_rank_sticker_${info.highestRank.tier.toLowerCase()}.png`}
          alt=""
          width={18}
          height={18}
        />
        {info.highestRank.label}
        {info.highestRank.elo != null && (
          <span className="infobox-muted"> ({numberFormat.format(info.highestRank.elo)})</span>
        )}
      </span>,
    ]);
  }
  if (info.wins3v3 != null) rows.push(["3v3-seire", numberFormat.format(info.wins3v3)]);

  return (
    <div className="infobox-section">
      <div className="infobox-footnote above">Oppdateres automatisk fra Brawl Stars</div>
      <div className="infobox-section-title">Ingame-info</div>
      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A person's mini accounts (ranked_profiles with main_tag, migration 017), as its own block under
 * the infobox table: one row per account. The name opens the ranked page with just that account
 * selected; the tag links to Brawlace.
 */
export function MiniAccounts({ minis }: { minis: Array<{ tag: string; name: string }> }) {
  if (minis.length === 0) return null;
  return (
    <div className="infobox-section">
      <div className="infobox-section-title">
        Kjente Minis <span className="infobox-section-count">{minis.length}</span>
      </div>
      <ul className="infobox-minis">
        {minis.map((m) => (
          <li key={m.tag}>
            <a className="infobox-mini-name" href={`/rankedstats/stats.html?player=${encodeURIComponent(m.tag)}`}>
              {m.name}
            </a>
            <a className="infobox-mini-tag" href={`https://brawlace.com/players/%23${m.tag.slice(1)}`}>
              {m.tag}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Toc({ items }: { items: Array<[href: string, label: string]> }) {
  return (
    <div id="toc">
      <h2>Innhold</h2>
      <ul>
        {items.map(([href, label]) => (
          <li key={href}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProfileFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="bsprofil-container">
      {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
      <img src={src} alt={alt} className="bsprofil" />
      <figcaption className="bsprofil-caption">{caption}</figcaption>
    </figure>
  );
}
