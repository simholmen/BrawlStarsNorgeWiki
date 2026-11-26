import type { Metadata } from "next";
import { Fragment } from "react";
import { getPageIndex, type PageEntry } from "@/lib/pageIndex";
import { SITE_TITLE } from "@/lib/slug";

// Generated replacement for the hand-maintained docs/diverse/oversikt/index.html: same markup,
// but nothing is listed by hand. People and clubs come from the database (refreshed right after a
// page is created, deleted or restored: those actions expire the "people"/"clubs" cache tags),
// the diverse pages from the docs/diverse/ folder, plus the ranked stats page (lib/pageIndex.ts).

export const metadata: Metadata = { title: `Sideoversikt - ${SITE_TITLE}` };

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ"];

export default async function Oversikt() {
  const { entries, people, clubs, diverse } = await getPageIndex();

  const byLetter = new Map<string, PageEntry[]>(LETTERS.map((l) => [l, []]));
  for (const entry of entries) {
    const letter = entry.name[0]?.toLocaleUpperCase("nb") ?? "";
    (byLetter.get(letter) ?? byLetter.get("A")!).push(entry);
  }

  return (
    <>
      <div className="infobox">
        <div className="infobox-title">
          Sideoversikt
          <br />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
        <img src="/images/bsnorge.jpg" alt="Sample Image" />
        <table>
          <tbody>
            <tr>
              <th>Antall person-sider</th>
              <td>{people}</td>
            </tr>
            <tr>
              <th>Antall klubb-sider</th>
              <td>{clubs}</td>
            </tr>
            <tr>
              <th>Antall diverse sider</th>
              <td>{diverse}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h2 id="Sideoversikt">Sideoversikt</h2>
      <p>Denne siden inneholder en sideoversikt over alle sidene på nettsiden.</p>

      {LETTERS.map((letter) => {
        const list = byLetter.get(letter)!;
        return (
          <Fragment key={letter}>
            <h3>{letter}</h3>
            {list.length > 0 && (
              <p>
                {list.map((e, i) => (
                  <Fragment key={e.href}>
                    {i > 0 && <br />}- <a href={e.href}>{e.name}</a>
                  </Fragment>
                ))}
              </p>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
