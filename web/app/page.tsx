import { redirect } from "next/navigation";

// In production Caddy serves docs/index.html (the landing page) at "/" and never reaches this.
// Locally, send "/" to the wiki front page.
export default function Home() {
  redirect("/wiki/");
}
