import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClub, getClubs } from "@/lib/data";
import { imageBaseName, imageExists } from "@/lib/images";
import { renderInline, renderMarkdown } from "@/lib/markdown";
import { normalizeSlug, pageTitle } from "@/lib/slug";
import { Html } from "@/components/Html";
import { Infobox, ProfileFigure, Toc, type InfoRow } from "@/components/Infobox";

// Port of docs/_layouts/klubb.html. As on the person page, missing images are left out.

export async function generateStaticParams() {
  const clubs = await getClubs();
  return clubs.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/klubber/[slug]">): Promise<Metadata> {
  const club = await getClub(normalizeSlug((await props.params).slug));
  return { title: club ? pageTitle(club.name) : "Fant ikke siden" };
}

function inline(md: string | null) {
  return <span dangerouslySetInnerHTML={{ __html: renderInline(md) }} />;
}

export default async function ClubPage(props: PageProps<"/klubber/[slug]">) {
  const club = await getClub(normalizeSlug((await props.params).slug));
  if (!club) notFound();

  const base = imageBaseName(club.name);
  const portrait = `/images/klubber/klubb_profilbilde/${base}.${club.image_ext}`;
  const profile = `/images/klubber/klubbprofil/${base}.png`;

  const rows: InfoRow[] = [
    { label: "Aktiv", value: inline(club.aktiv) },
    { label: "Stiftet", value: inline(club.stiftet) },
    { label: "Leder", value: inline(club.leder) },
    { label: "Medlemmer", value: inline(club.medlemmer) },
  ];
  if (club.underklubber.length > 0) {
    rows.push({
      label: "Underklubber",
      value: club.underklubber.map((u) => (
        <span key={u}>
          {u}
          <br />
        </span>
      )),
    });
  }

  return (
    <>
      <Infobox
        title={club.name}
        image={imageExists(portrait) ? { src: portrait, alt: `${club.name} profilbilde` } : null}
        rows={rows}
        facts={club.facts}
      />

      <h2 className="strekstopp">{club.name}</h2>

      <Toc
        items={[
          ["#bakgrunn", "1. Bakgrunn"],
          ["#karriere", "2. Klubben"],
          ["#prestasjoner", "3. Prestasjoner"],
          ["#brawl-stars-klubbprofil", "4. Klubb profil"],
        ]}
      />

      <Html html={renderMarkdown(club.body_md, { keepImage: imageExists })} />

      <h2 id="brawl-stars-klubbprofil">Klubbprofil</h2>
      {imageExists(profile) && (
        <ProfileFigure src={profile} alt={club.name} caption={`${club.name}'s Brawl Stars profil - Juni 2025`} />
      )}

      {club.underklubber.length > 0 && (
        <>
          <h3 id="underklubber">Underklubber</h3>
          {club.underklubber.map((u) => {
            const src = `/images/klubber/klubbprofil/${imageBaseName(u)}.png`;
            return imageExists(src) ? (
              <ProfileFigure key={u} src={src} alt={`${u} profilbilde`} caption={`${u} - Juni 2025`} />
            ) : null;
          })}
        </>
      )}
    </>
  );
}
