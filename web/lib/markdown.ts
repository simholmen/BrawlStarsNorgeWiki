import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Element, Root, Text } from "hast";

// Renders wiki Markdown (people.body_md, clubs.body_md, facts values) to HTML.
// Content will become user-editable in Phase 4, so the output is sanitized: only the HTML the
// content actually uses survives (figure/figcaption/img/br plus normal Markdown output).

const WIKI_LINK_RE = /\[\[(person|klubb):([^\]|]+)(?:\|([^\]]*))?\]\]/g;

const LINK_PREFIX = { person: "/personer/", klubb: "/klubber/" } as const;

/** [[person:slug|Label]] -> [Label](/personer/slug/). Label defaults to the slug. */
export function expandWikiLinks(md: string): string {
  return md.replace(WIKI_LINK_RE, (_m, kind: "person" | "klubb", slug: string, label?: string) => {
    const href = `${LINK_PREFIX[kind]}${encodeURI(slug.trim())}/`;
    return `[${label ?? slug}](${href})`;
  });
}

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    img: [...(defaultSchema.attributes?.img ?? []), "className"],
  },
};

const HEADING = /^h[1-6]$/;
const EXPLICIT_ID = /\s*\{#([\w\-æøåÆØÅ]+)\}\s*$/;

/**
 * kramdown's `## Heading {#custom-id}` syntax (used by the club pages so their TOC anchors work).
 * Runs after sanitize, so the id is not prefixed with `user-content-`; rehype-slug then skips
 * headings that already have an id.
 */
function rehypeExplicitHeadingIds() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!HEADING.test(node.tagName)) return;
      const last = node.children[node.children.length - 1];
      if (!last || last.type !== "text") return;
      const match = (last as Text).value.match(EXPLICIT_ID);
      if (!match) return;
      (last as Text).value = (last as Text).value.slice(0, match.index);
      node.properties = { ...node.properties, id: match[1] };
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, schema)
  .use(rehypeExplicitHeadingIds)
  .use(rehypeSlug)
  .use(rehypeStringify);

/** Block Markdown (a page body) -> sanitized HTML. */
export function renderMarkdown(md: string): string {
  return String(processor.processSync(expandWikiLinks(md)));
}

/** Inline Markdown (an infobox value) -> sanitized HTML without the wrapping <p>. */
export function renderInline(md: string | null | undefined): string {
  if (!md) return "";
  const html = renderMarkdown(md).trim();
  const single = html.match(/^<p>([\s\S]*)<\/p>$/);
  return single && !single[1].includes("<p>") ? single[1] : html;
}
