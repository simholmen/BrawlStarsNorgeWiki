import { redirect } from "next/navigation";
import { serveFromDocs } from "@/lib/devStatic";

// "/" is the static landing page docs/index.html. In production Caddy serves it and never reaches
// this; locally (`npm run dev`) it's served from docs/ like the other static files, so it can be
// previewed. Anywhere else, send "/" to the wiki front page.
export async function GET() {
  if (process.env.NODE_ENV === "production") redirect("/wiki/");
  return serveFromDocs("index.html");
}
