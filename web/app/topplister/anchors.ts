import type { Toplist } from "@/lib/toplistsBuild";

// Each list's heading id on /topplister/: used by the table of contents (page.tsx, a server
// component) and the headings (ToplistsView.tsx, a client component). Kept in a plain module:
// a server component can't read values out of a "use client" file.

export const ANCHOR: Record<Toplist["key"], string> = {
  wins3v3: "3v3-seire",
  showdown: "showdown-seire",
  fame: "fame",
  ranked: "ranked-elo",
  experience: "xp-niva",
  maxed: "maxet-konto",
};
