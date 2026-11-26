"use client";

import { useSyncExternalStore } from "react";

// A page publishes its editor actions here, and the page bar under the site header
// (components/PageNav.tsx, in the root layout, so outside the page's own tree) shows them at its
// right end: "Rediger" / "Historikk" on person/club pages (EditablePage), "+ Legg til spiller"
// on Topplister (ToplistEditor). Null on every other page and while the editor is open.

export type EditActions = {
  startEdit: () => void;
  /** Button text; "✎ Rediger" when left out. */
  label?: string;
  /** Shown as a pressed button (e.g. while the box it opens is open). */
  active?: boolean;
  /** "Historikk" link, when the page has one. */
  historyHref?: string;
};

let current: EditActions | null = null;
const listeners = new Set<() => void>();

export function setEditActions(actions: EditActions | null) {
  current = actions;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useEditActions(): EditActions | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
