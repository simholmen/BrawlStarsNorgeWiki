import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPeople, getPerson } from "@/lib/data";
import { imageExists } from "@/lib/images";
import { renderInline, renderMarkdown } from "@/lib/markdown";
import { normalizeSlug, pageTitle } from "@/lib/slug";
import { Html } from "@/components/Html";
import EditablePage from "@/components/editor/EditablePage";
import { Infobox, ProfileFigure, Toc } from "@/components/Infobox";

// Port of docs/_layouts/person.html, field for field. One deliberate difference: images whose
// file doesn't exist are left out instead of rendered broken.

export async function generateStaticParams() {
  const people = await getPeople();
  return people.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/personer/[slug]">): Promise<Metadata> {
  const person = await getPerson(normalizeSlug((await props.params).slug));
  return { title: person ? pageTitle(person.name) : "Fant ikke siden" };
}

const PROFILE_YEARS = [
  { year: 2024, src: (b: string) => `/images/bsProfiler2024/${b}_profil.jpg`, when: "Juni 2024" },
  { year: 2025, src: (b: string) => `/images/bsProfiler2025/${b}.png`, when: "Juni 2025" },
  { year: 2026, src: (b: string) => `/images/bsProfiler2026/${b}.png`, when: "Oppdatert august 2026" },
];

function inline(md: string | null) {
  return <span dangerouslySetInnerHTML={{ __html: renderInline(md) }} />;
}

export default async function PersonPage(props: PageProps<"/personer/[slug]">) {
  const person = await getPerson(normalizeSlug((await props.params).slug));
  if (!person) notFound();

  const base = person.image_key;
  const portrait = `/images/profilbilde/${base}.${person.image_ext}`;
  const profiles = PROFILE_YEARS.filter(
    (p) => !person.hidden_profile_years.includes(p.year) && imageExists(p.src(base)),
  );

  return (
    <EditablePage kind="person" slug={person.slug}>
      <Infobox
        title={
          <>
            {person.name}
            {person.subtitle && (
              <>
                {" "}
                <span className="subtitle" dangerouslySetInnerHTML={{ __html: renderInline(person.subtitle) }} />
              </>
            )}
          </>
        }
        image={imageExists(portrait) ? { src: portrait, alt: `${person.name} profilbilde` } : null}
        rows={[
          { label: "Hjemsted", value: inline(person.hjemsted) },
          { label: "Født", value: inline(person.born) },
          { label: "Favorittbrus", value: inline(person.favorittbrus) },
          { label: "Favoritt Brawler", value: inline(person.favoritt_brawler) },
          { label: "Quote", value: inline(person.quote) },
          { label: "Ærkefiende", value: inline(person.fiende) },
          {
            label: "Brawl Stars ID",
            value: (
              <a href={`https://brawlace.com/players/%23${person.bsid ?? ""}`}>{person.bsid}</a>
            ),
          },
        ]}
        facts={person.facts}
      />

      <h2 className="strekstopp">{person.name}</h2>

      <Toc
        items={[
          ["#bakgrunn", "1. Bakgrunn"],
          ["#karriere", "2. Karriere"],
          ["#prestasjoner", "3. Prestasjoner"],
          ["#brawl-stars-profil", "4. Brawl Stars profil"],
        ]}
      />

      <Html html={renderMarkdown(person.body_md, { keepImage: imageExists })} />

      <h2 id="brawl-stars-profil">Brawl Stars profil</h2>
      {profiles.map((p) => (
        <ProfileFigure
          key={p.year}
          src={p.src(base)}
          alt={person.name}
          caption={`${person.name}'s Brawl Stars profil - ${p.when}`}
        />
      ))}
    </EditablePage>
  );
}
