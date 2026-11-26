"use client";

import { useSyncExternalStore } from "react";

// EditablePage (a person/club page, for editors) publishes its "Rediger" / "Historikk" actions
// here, and the page bar under the site header (components/PageNav.tsx, in the root layout, so
// outside the page's own tree) shows them. Null on every other page and while the editor is open.

export type EditActions = { startEdit: () => void; historyHref: string };

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
