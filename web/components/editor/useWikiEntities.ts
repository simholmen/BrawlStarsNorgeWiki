"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { WikiEntity } from "@/lib/linkPicker";

let cache: Promise<WikiEntity[]> | null = null;

function loadEntities(): Promise<WikiEntity[]> {
  if (!cache) {
    const supabase = getBrowserClient();
    cache = Promise.all([
      supabase.from("people").select("slug,name"),
      supabase.from("clubs").select("slug,name"),
    ]).then(([people, clubs]) => [
      ...(people.data ?? []).map((p) => ({ kind: "person" as const, slug: p.slug, name: p.name })),
      ...(clubs.data ?? []).map((c) => ({ kind: "klubb" as const, slug: c.slug, name: c.name })),
    ]);
  }
  return cache;
}

/** All people and clubs, for the [[ link picker (public data, loaded once per page). */
export function useWikiEntities(): WikiEntity[] {
  const [entities, setEntities] = useState<WikiEntity[]>([]);
  useEffect(() => {
    let alive = true;
    loadEntities().then((list) => alive && setEntities(list));
    return () => {
      alive = false;
    };
  }, []);
  return entities;
}
