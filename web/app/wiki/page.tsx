import type { Metadata } from "next";
import { renderJekyllPage } from "@/lib/jekyllPage";
import { Html } from "@/components/Html";

// docs/wiki/index.html, rendered as-is.

export async function generateMetadata(): Promise<Metadata> {
  const page = await renderJekyllPage("wiki");
  return { title: page.title ?? undefined };
}

export default async function WikiHome() {
  const page = await renderJekyllPage("wiki");
  return <Html html={page.html} />;
}
