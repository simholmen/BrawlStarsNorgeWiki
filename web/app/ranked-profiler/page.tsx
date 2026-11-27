import { permanentRedirect } from "next/navigation";

// Ranked-profiler moved into Spillere (/spillere/), which lists wiki, ranked and toplist players
// together. Old links and bookmarks land there with the Ranked filter on.

export default function RankedProfilesPage() {
  permanentRedirect("/spillere/?vis=ranked");
}
