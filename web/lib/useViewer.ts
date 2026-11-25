"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";

// Who is looking at the page, from the browser's session. For showing/hiding UI only: every write
// is checked again by the server action and enforced by the database.

export type Viewer =
  | { status: "loading" }
  | { status: "out" }
  | {
      status: "in";
      userId: string;
      name: string;
      avatar: string | null;
      role: "admin" | "editor" | null;
    };

type Listener = (v: Viewer) => void;
let current: Viewer = { status: "loading" };
let started = false;
const listeners = new Set<Listener>();

function publish(v: Viewer) {
  current = v;
  for (const l of listeners) l(v);
}

async function load() {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return publish({ status: "out" });
  const meta = session.user.user_metadata ?? {};
  const name = meta.custom_claims?.global_name ?? meta.full_name ?? meta.user_name ?? "Konto";
  const { data: editor } = await supabase
    .from("editors")
    .select("role")
    .eq("user_id", session.user.id)
    .maybeSingle();
  publish({
    status: "in",
    userId: session.user.id,
    name,
    avatar: meta.avatar_url ?? null,
    role: (editor?.role as "admin" | "editor" | undefined) ?? null,
  });
}

function start() {
  if (started) return;
  started = true;
  load();
  getBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") load();
  });
}

/** Shared across components on the page: one session + role lookup per page load. */
export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>(current);
  useEffect(() => {
    listeners.add(setViewer);
    start();
    return () => {
      listeners.delete(setViewer);
    };
  }, []);
  return viewer;
}

export function isEditor(v: Viewer): boolean {
  return v.status === "in" && (v.role === "editor" || v.role === "admin");
}
