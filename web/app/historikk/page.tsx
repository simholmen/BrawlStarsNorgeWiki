import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SITE_TITLE } from "@/lib/slug";
import RevisionList, { type Revision } from "./RevisionList";
import { requireEditorPage } from "./gate";

export const metadata: Metadata = { title: `Siste endringer - ${SITE_TITLE}`, robots: { index: false } };

export default function RecentChangesPage() {
  return (
    <div className="auth-panel wide">
      <h2>Siste endringer</h2>
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <RecentChanges />
      </Suspense>
    </div>
  );
}

async function RecentChanges() {
  const { role } = await requireEditorPage("/historikk/");
  const supabase = await createClient();
  const { data } = await supabase
    .from("revisions")
    .select("*")
    .order("id", { ascending: false })
    .limit(100);
  return <RevisionList revisions={(data ?? []) as Revision[]} showPage isAdmin={role === "admin"} />;
}
