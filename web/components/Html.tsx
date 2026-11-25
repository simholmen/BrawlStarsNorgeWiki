/**
 * Renders HTML that has already been sanitized (lib/markdown.ts) or comes from the repo's own
 * Jekyll pages (lib/jekyllPage.ts). Never pass raw user input here.
 */
export function Html({ html, as: Tag = "div" }: { html: string; as?: "div" | "span" | "td" }) {
  if (Tag === "div") return <div className="wiki-html" dangerouslySetInnerHTML={{ __html: html }} />;
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />;
}
