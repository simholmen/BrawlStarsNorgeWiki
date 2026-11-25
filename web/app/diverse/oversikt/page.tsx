import type { Metadata } from "next";
import { Fragment } from "react";
import { getClubs, getPeople } from "@/lib/data";
import { SITE_TITLE } from "@/lib/slug";

// Generated replacement for the hand-maintained docs/diverse/oversikt/index.html: same markup,
// but counts and the A-Å list come from the database, so adding a person needs no edit here.

export const metadata: Metadata = { title: `Sideoversikt - ${SITE_TITLE}` };

const DIVERSE = [
  { name: "MZ Turneringer", href: "/diverse/mz-turneringer/" },
  { name: "Ranked Historie", href: "/diverse/rankedhistorie/" },
  { name: "Sideoversikt", href: "/diverse/oversikt/" },
  { name: "Slindringene", href: "/diverse/slindringene/" },
];

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ"];
const collator = new Intl.Collator("nb", { sensitivity: "base" });

type Entry = { name: string; href: string };

export default async function Oversikt() {
  const [people, clubs] = await Promise.all([getPeople(), getClubs()]);
  const clubNames = new Set(clubs.map((c) => c.name.toLowerCase()));

  const entries: Entry[] = [
    ...people.map((p) => ({
      // A person who shares a club's name gets a suffix, as on the old page.
      name: clubNames.has(p.name.toLowerCase()) ? `${p.name} (person)` : p.name,
      href: `/personer/${p.slug}/`,
    })),
    ...clubs.map((c) => ({ name: c.name, href: `/klubber/${c.slug}/` })),
    ...DIVERSE,
  ].sort((a, b) => collator.compare(a.name, b.name));

  const byLetter = new Map<string, Entry[]>(LETTERS.map((l) => [l, []]));
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
              <td>{people.length}</td>
            </tr>
            <tr>
              <th>Antall klubb-sider</th>
              <td>{clubs.length}</td>
            </tr>
            <tr>
              <th>Antall diverse sider</th>
              <td>{DIVERSE.length}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div id="toc">
        <h2>Contents</h2>
        <ul>
          <li>
            <a href="#Sideoversikt">1. Sideoversikt</a>
          </li>
        </ul>
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
