import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { renderJekyllPage } from "@/lib/jekyllPage";
import { Html } from "@/components/Html";
import { getDiversePages } from "@/lib/diverse";

// docs/diverse/<page>/index.html, rendered as-is; every folder there is a page (lib/diverse.ts).
// /diverse/oversikt/ has its own generated route.

async function known(page: string): Promise<boolean> {
  return page !== "oversikt" && (await getDiversePages()).some((p) => p.slug === page);
}

export async function generateStaticParams() {
  return (await getDiversePages()).filter((p) => p.slug !== "oversikt").map((p) => ({ page: p.slug }));
}

export async function generateMetadata(props: PageProps<"/diverse/[page]">): Promise<Metadata> {
  const { page } = await props.params;
  if (!(await known(page))) return {};
  return { title: (await renderJekyllPage(`diverse/${page}`)).title ?? undefined };
}

export default async function DiversePage(props: PageProps<"/diverse/[page]">) {
  const { page } = await props.params;
  if (!(await known(page))) notFound();
  const rendered = await renderJekyllPage(`diverse/${page}`);
  return <Html html={rendered.html} />;
}
