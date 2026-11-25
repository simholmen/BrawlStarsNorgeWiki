import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug, SITE_TITLE } from "@/lib/slug";
import RevisionList, { type Revision } from "../../RevisionList";
import { requireEditorPage } from "../../gate";

export const metadata: Metadata = { title: `Historikk - ${SITE_TITLE}`, robots: { index: false } };

const KINDS = { person: { entity: "person", path: "/personer/" }, klubb: { entity: "club", path: "/klubber/" } } as const;

export default function PageHistory(props: PageProps<"/historikk/[kind]/[slug]">) {
  return (
    <div className="auth-panel wide">
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <History params={props.params} />
      </Suspense>
    </div>
  );
}

async function History({ params }: { params: PageProps<"/historikk/[kind]/[slug]">["params"] }) {
  const { kind, slug: rawSlug } = await params;
  if (!(kind in KINDS)) notFound();
  const { entity, path } = KINDS[kind as keyof typeof KINDS];
  const slug = normalizeSlug(rawSlug);
  const { role } = await requireEditorPage(`/historikk/${kind}/${slug}/`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("revisions")
    .select("*")
    .eq("entity", entity)
    .eq("entity_slug", slug)
    .order("id", { ascending: false })
    .limit(300);

  return (
    <>
      <h2>
        Historikk: <a href={`${path}${slug}/`}>{slug}</a>
      </h2>
      <RevisionList revisions={(data ?? []) as Revision[]} showPage={false} isAdmin={role === "admin"} />
    </>
  );
}
