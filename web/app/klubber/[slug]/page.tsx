import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClub, getClubs } from "@/lib/data";
import { imageBaseName, imageExists, imageAvailable } from "@/lib/images";
import { legacyPortrait, profileImages } from "@/lib/profileImages";
import { renderInline, renderMarkdown } from "@/lib/markdown";
import { normalizeSlug, pageTitle } from "@/lib/slug";
import { Html } from "@/components/Html";
import EditablePage from "@/components/editor/EditablePage";
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

  // Uploaded images (from the editor) win over the old files in docs/images.
  const portrait = club.portrait_url ?? legacyPortrait("club", club.image_key, club.image_ext);
  const profiles = profileImages("club", club.image_key, club.profile_urls, [], imageAvailable);

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
    <EditablePage kind="club" slug={club.slug}>
      <Infobox
        title={club.name}
        image={imageAvailable(portrait) ? { src: portrait, alt: `${club.name} profilbilde` } : null}
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

      <Html html={renderMarkdown(club.body_md, { keepImage: imageAvailable })} />

      <h2 id="brawl-stars-klubbprofil">Klubbprofil</h2>
      {profiles.map((p) => (
        <ProfileFigure
          key={p.year}
          src={p.src}
          alt={club.name}
          caption={`${club.name}'s Brawl Stars profil - ${p.when}`}
        />
      ))}

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
    </EditablePage>
  );
}
