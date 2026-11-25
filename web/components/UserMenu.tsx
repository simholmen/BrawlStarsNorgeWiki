"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isEditor, useViewer } from "@/lib/useViewer";

// The site menu: one hamburger button in the header for everyone, on phone and desktop. The panel
// holds login state (log in, or who you are + log out), the wiki/ranked switch, and the editor and
// admin links for those who have them. A client component on purpose: wiki pages stay fully
// prerendered (no cookies read on the server), and the login part fills in after load.

export default function UserMenu() {
  const viewer = useViewer();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const isAdmin = viewer.status === "in" && viewer.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    getBrowserClient()
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setPending(count ?? 0));
  }, [isAdmin]);

  // Close on outside click and Escape (menu links close it themselves via onClick).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const loginHref = `/logg-inn/?next=${encodeURIComponent(pathname ?? "/wiki/")}`;

  return (
    <div className="site-menu" ref={root}>
      <button
        type="button"
        className="site-menu-button"
        aria-label={open ? "Lukk meny" : "Åpne meny"}
        aria-expanded={open}
        aria-controls="site-menu-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="site-menu-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        {isAdmin && pending > 0 && <span className="site-menu-dot" aria-hidden />}
      </button>

      {open && (
        <nav id="site-menu-panel" className="site-menu-panel" aria-label="Meny">
          <div className="site-menu-section site-menu-account">
            {viewer.status === "loading" && <span className="site-menu-muted">Laster …</span>}
            {viewer.status === "out" && (
              <a href={loginHref} className="site-menu-login">
                Logg inn med Discord
              </a>
            )}
            {viewer.status === "in" && (
              <Link href="/konto/" className="site-menu-user" onClick={close}>
                {viewer.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external avatar
                  <img src={viewer.avatar} alt="" width={32} height={32} referrerPolicy="no-referrer" />
                ) : (
                  <span className="site-menu-avatar-fallback" aria-hidden>
                    {viewer.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>
                  <strong>{viewer.name}</strong>
                  <span className="site-menu-muted">
                    {viewer.role === "admin" ? "Admin" : viewer.role === "editor" ? "Redaktør" : "Innlogget"}
                    {" · Min konto"}
                  </span>
                </span>
              </Link>
            )}
          </div>

          <div className="site-menu-section">
            <Link href="/wiki/" onClick={close} aria-current={pathname === "/wiki/" ? "page" : undefined}>
              Wiki
            </Link>
            {/* Static page (served from docs/ by Caddy), so a plain link, not next/link. */}
            <a href="/rankedstats/stats.html">Ranked stats</a>
          </div>

          {isEditor(viewer) && (
            <div className="site-menu-section">
              <Link href="/ny/person/" onClick={close}>
                Ny side
              </Link>
              <Link href="/historikk/" onClick={close}>
                Historikk
              </Link>
              <Link href="/ranked-profiler/" onClick={close}>
                Ranked-profiler
              </Link>
              {isAdmin && (
                <a href="/admin/tilgang/">
                  Admin{pending > 0 && <span className="user-menu-badge">{pending}</span>}
                </a>
              )}
            </div>
          )}

          {viewer.status === "in" && (
            <div className="site-menu-section">
              <form method="post" action="/auth/logg-ut/">
                <button type="submit" className="site-menu-logout">
                  Logg ut
                </button>
              </form>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}
