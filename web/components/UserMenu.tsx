"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isEditor, useViewer } from "@/lib/useViewer";

// Login state in the header. A client component on purpose: wiki pages stay fully prerendered
// (no cookies read on the server), and this fills in after load. It renders nothing until it
// knows, so logged-out visitors see exactly the old header.

export default function UserMenu() {
  const viewer = useViewer();
  const [pending, setPending] = useState(0);
  const isAdmin = viewer.status === "in" && viewer.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    getBrowserClient()
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setPending(count ?? 0));
  }, [isAdmin]);

  if (viewer.status === "loading") return null;

  if (viewer.status === "out") {
    const next = encodeURIComponent(window.location.pathname);
    return (
      <nav className="user-menu">
        <a href={`/logg-inn/?next=${next}`}>Logg inn</a>
      </nav>
    );
  }

  return (
    <nav className="user-menu">
      {isEditor(viewer) && (
        <>
          <Link href="/ny/person/">Ny side</Link>
          <Link href="/historikk/">Historikk</Link>
        </>
      )}
      {isAdmin && (
        <a href="/admin/tilgang/" className="user-menu-admin">
          Admin{pending > 0 && <span className="user-menu-badge">{pending}</span>}
        </a>
      )}
      <a href="/konto/" className="user-menu-account">
        {viewer.avatar && (
          // eslint-disable-next-line @next/next/no-img-element -- external avatar
          <img src={viewer.avatar} alt="" width={24} height={24} referrerPolicy="no-referrer" />
        )}
        {viewer.name}
      </a>
    </nav>
  );
}
