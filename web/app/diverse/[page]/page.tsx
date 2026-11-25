import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderJekyllPage } from "@/lib/jekyllPage";
import { Html } from "@/components/Html";

// docs/diverse/<page>/index.html, rendered as-is. /diverse/oversikt/ has its own generated route.

export const DIVERSE_PAGES = ["mz-turneringer", "rankedhistorie", "slindringene"] as const;

function known(page: string): page is (typeof DIVERSE_PAGES)[number] {
  return (DIVERSE_PAGES as readonly string[]).includes(page);
}

export function generateStaticParams() {
  return DIVERSE_PAGES.map((page) => ({ page }));
}

export async function generateMetadata(props: PageProps<"/diverse/[page]">): Promise<Metadata> {
  const { page } = await props.params;
  if (!known(page)) return {};
  return { title: (await renderJekyllPage(`diverse/${page}`)).title ?? undefined };
}

export default async function DiversePage(props: PageProps<"/diverse/[page]">) {
  const { page } = await props.params;
  if (!known(page)) notFound();
  const rendered = await renderJekyllPage(`diverse/${page}`);
  return <Html html={rendered.html} />;
}
