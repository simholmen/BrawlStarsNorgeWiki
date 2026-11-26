"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEditActions } from "@/components/editor/EditContext";
import type { PageEntry } from "@/lib/pageIndex";

// The bar under the site header (root layout, every page): back, Sideoversikt, home, a page
// search, and on person/club pages for editors "Rediger" / "Historikk" on the right. The page list is fetched from /api/sider/ the first
// time the search field gets focus, then kept for the rest of the visit.

let index: Promise<PageEntry[]> | null = null;

function loadIndex(): Promise<PageEntry[]> {
  if (!index) {
    index = fetch("/api/sider/")
      .then((r) => (r.ok ? (r.json() as Promise<PageEntry[]>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        index = null; // try again on the next focus
        return [];
      });
  }
  return index;
}

const KIND_LABEL: Record<PageEntry["kind"], string> = { person: "Person", klubb: "Klubb", side: "Side" };
const MAX_RESULTS = 8;

function norm(s: string): string {
  return s.toLocaleLowerCase("nb").trim();
}

function search(pages: PageEntry[], query: string): PageEntry[] {
  const q = norm(query);
  if (!q) return [];
  const starts: PageEntry[] = [];
  const contains: PageEntry[] = [];
  for (const p of pages) {
    const name = norm(p.name);
    if (name.startsWith(q)) starts.push(p);
    else if (name.includes(q)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, MAX_RESULTS);
}

function PageSearch() {
  const router = useRouter();
  const listId = useId();
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const results = search(pages, query);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(p: PageEntry) {
    setOpen(false);
    setQuery("");
    // Ranked Stats is a static file outside the Next.js app.
    if (p.href.startsWith("/rankedstats/")) window.location.href = p.href;
    else router.push(p.href);
  }

  return (
    <div className="page-nav-search" ref={box}>
      <input
        type="search"
        placeholder="Søk etter side …"
        aria-label="Søk etter side"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onFocus={() => {
          setOpen(true);
          loadIndex().then((list) => {
            setPages(list);
            setLoaded(true);
          });
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const hit = results[active] ?? results[0];
            if (hit) go(hit);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() && (
        <ul className="page-nav-results" id={listId} role="listbox">
          {results.map((p, i) => (
            <li key={p.href} role="option" aria-selected={i === active}>
              <a
                href={p.href}
                className={i === active ? "active" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={(e) => {
                  e.preventDefault();
                  go(p);
                }}
              >
                <span>{p.name}</span>
                <span className="page-nav-kind">{KIND_LABEL[p.kind]}</span>
              </a>
            </li>
          ))}
          {results.length === 0 && <li className="page-nav-empty">{loaded ? "Ingen treff" : "Laster …"}</li>}
        </ul>
      )}
    </div>
  );
}

export default function PageNav() {
  // No usePathname() here: the bar is in the root layout, and reading the URL there would stop
  // dynamic routes from prerendering (same reason as in UserMenu).
  const router = useRouter();
  const edit = useEditActions();

  function back() {
    // A page opened directly (new tab, shared link) has nowhere to go back to: go to the wiki.
    if (window.history.length > 1) window.history.back();
    else router.push("/wiki/");
  }

  return (
    <nav className="page-nav" aria-label="Sidenavigasjon">
      <button type="button" className="page-nav-button" onClick={back} title="Gå tilbake én side">
        ← Tilbake
      </button>
      <Link className="page-nav-button" href="/diverse/oversikt/">
        Sideoversikt
      </Link>
      {/* A plain link: in production "/" is the static landing page (docs/index.html via Caddy). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="page-nav-button" href="/" title="Forsiden">
        Hjem
      </a>
      <PageSearch />
      {edit && (
        <div className="page-nav-edit">
          <button type="button" className="auth-button small" onClick={edit.startEdit}>
            ✎ Rediger
          </button>
          <a className="page-nav-button" href={edit.historyHref}>
            Historikk
          </a>
        </div>
      )}
    </nav>
  );
}
