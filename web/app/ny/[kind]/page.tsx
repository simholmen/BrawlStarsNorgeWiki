import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { SITE_TITLE } from "@/lib/slug";
import { requireEditorPage } from "@/app/historikk/gate";
import NewPageForm from "./NewPageForm";

export const metadata: Metadata = { title: `Ny side - ${SITE_TITLE}`, robots: { index: false } };

const KINDS = { person: "person", klubb: "club" } as const;

export function generateStaticParams() {
  return [{ kind: "person" }, { kind: "klubb" }];
}

export default function NewPage(props: PageProps<"/ny/[kind]">) {
  return (
    <div className="auth-panel">
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <NewPageGate params={props.params} />
      </Suspense>
    </div>
  );
}

async function NewPageGate({ params }: { params: PageProps<"/ny/[kind]">["params"] }) {
  const { kind } = await params;
  if (!(kind in KINDS)) notFound();
  // People are added in the shared player box, with "Lag wiki-side" ticked.
  if (kind === "person") permanentRedirect("/spillere/?ny=wiki&vis=wiki");
  await requireEditorPage(`/ny/${kind}/`);
  return <NewPageForm kind={KINDS[kind as keyof typeof KINDS]} />;
}
