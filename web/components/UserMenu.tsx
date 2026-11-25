"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";

// Login state in the header. A client component on purpose: wiki pages stay fully prerendered
// (no cookies read on the server), and this fills in after load. It renders nothing until it
// knows, so logged-out visitors see exactly the old header.

type Menu =
  | { kind: "loading" }
  | { kind: "out" }
  | { kind: "in"; name: string; avatar: string | null; isAdmin: boolean; pending: number };

export default function UserMenu() {
  const [menu, setMenu] = useState<Menu>({ kind: "loading" });

  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        if (!cancelled) setMenu({ kind: "out" });
        return;
      }
      const meta = session.user.user_metadata ?? {};
      const name =
        meta.custom_claims?.global_name ?? meta.full_name ?? meta.user_name ?? meta.name ?? "Konto";
      const { data: editor } = await supabase
        .from("editors")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const isAdmin = editor?.role === "admin";
      let pending = 0;
      if (isAdmin) {
        const { count } = await supabase
          .from("access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        pending = count ?? 0;
      }
      if (!cancelled) setMenu({ kind: "in", name, avatar: meta.avatar_url ?? null, isAdmin, pending });
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") load();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (menu.kind === "loading") return null;

  if (menu.kind === "out") {
    const next = encodeURIComponent(window.location.pathname);
    return (
      <nav className="user-menu">
        <a href={`/logg-inn/?next=${next}`}>Logg inn</a>
      </nav>
    );
  }

  return (
    <nav className="user-menu">
      {menu.isAdmin && (
        <a href="/admin/tilgang/" className="user-menu-admin">
          Admin{menu.pending > 0 && <span className="user-menu-badge">{menu.pending}</span>}
        </a>
      )}
      <a href="/konto/" className="user-menu-account">
        {menu.avatar && (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar
          <img src={menu.avatar} alt="" width={24} height={24} referrerPolicy="no-referrer" />
        )}
        {menu.name}
      </a>
    </nav>
  );
}
