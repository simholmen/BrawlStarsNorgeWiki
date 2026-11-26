"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { EntityKind } from "@/lib/fields";
import { isEditor, useViewer } from "@/lib/useViewer";
import { setEditActions } from "./EditContext";

// Wraps a person/club page. Everyone gets the normal (prerendered) page; editors also get
// "Rediger" / "Historikk" in the page bar under the site header (components/PageNav.tsx,
// through EditContext), and clicking "Rediger" swaps the page for the editor in place. The editor
// code is only downloaded on that click.

const PageEditor = dynamic(() => import("./PageEditor"), {
  ssr: false,
  loading: () => <p className="auth-small">Laster redigering …</p>,
});

export default function EditablePage({ kind, slug, children }: { kind: EntityKind; slug: string; children: ReactNode }) {
  const viewer = useViewer();
  // "?rediger=1" (used right after creating a page) opens the editor directly.
  const [editing, setEditing] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rediger"),
  );
  const canEdit = isEditor(viewer);

  function close() {
    setEditing(false);
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }

  // Show "Rediger" / "Historikk" in the page bar while this page is open and not being edited.
  const showActions = canEdit && !editing;
  useEffect(() => {
    if (!showActions) return;
    setEditActions({
      startEdit: () => setEditing(true),
      historyHref: `/historikk/${kind === "person" ? "person" : "klubb"}/${slug}/`,
    });
    return () => setEditActions(null);
  }, [showActions, kind, slug]);

  if (canEdit && editing) return <PageEditor kind={kind} slug={slug} onClose={close} />;
  return <>{children}</>;
}
