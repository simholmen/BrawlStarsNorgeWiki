"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isEditor, useViewer } from "@/lib/useViewer";
import { setEditActions } from "@/components/editor/EditContext";
import PlayerManager from "@/components/players/PlayerManager";

// Editors only: "+ Legg til spiller" in the page bar opens the shared box (the same one as on
// /spillere/) at the top of the page. Everyone else sees nothing.

const noop = () => () => {};

/** False while hydrating, true after: the server never knows who's logged in. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export default function AddPlayersBox() {
  const viewer = useViewer();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const canEdit = hydrated && isEditor(viewer);

  useEffect(() => {
    if (!canEdit) return;
    setEditActions({
      label: open ? "Lukk" : "+ Legg til spiller",
      active: open,
      startEdit: () => setOpen((o) => !o),
    });
    return () => setEditActions(null);
  }, [canEdit, open]);

  // Render nothing until hydrated: the viewer may already be known in the browser (another
  // component looked it up first), and drawing the box then would not match the server HTML.
  if (!canEdit || !open) return null;
  return <PlayerManager via="topplister" onClose={() => setOpen(false)} />;
}
