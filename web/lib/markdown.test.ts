import { describe, expect, it } from "vitest";
import { expandWikiLinks, renderInline, renderMarkdown } from "./markdown";

describe("expandWikiLinks", () => {
  it("expands person and club links", () => {
    expect(expandWikiLinks("Bror til [[person:cursed|Cursed]]")).toBe(
      "Bror til [Cursed](/personer/cursed/)",
    );
    expect(expandWikiLinks("Flest bans fra [[klubb:the-audacity|TA]]")).toBe(
      "Flest bans fra [TA](/klubber/the-audacity/)",
    );
  });

  it("defaults the label to the slug and encodes non-ASCII slugs", () => {
    expect(expandWikiLinks("[[klubb:norske-brød]]")).toBe(
      "[norske-brød](/klubber/norske-br%C3%B8d/)",
    );
  });

  it("leaves ordinary links and text alone", () => {
    const md = "[Slindringene](/diverse/slindringene/) and [x] [[unknown:y]]";
    expect(expandWikiLinks(md)).toBe(md);
  });
});

describe("renderMarkdown heading ids (must match kramdown's, or the TOC breaks)", () => {
  const cases: Array<[string, string]> = [
    ["## Bakgrunn", "bakgrunn"],
    ["## Karriere", "karriere"],
    ["## Prestasjoner", "prestasjoner"],
    ["## Brawl Stars profil", "brawl-stars-profil"],
    ["## Klubben", "klubben"],
    ["## Discord Server", "discord-server"],
    ["### Første Monthly Qualifier", "første-monthly-qualifier"],
    ["### 2021", "2021"],
  ];
  it.each(cases)("%s -> #%s", (md, id) => {
    expect(renderMarkdown(md)).toContain(`id="${id}"`);
  });

  it("honours kramdown {#id} and strips it from the text", () => {
    const html = renderMarkdown("## Klubben {#karriere}");
    expect(html).toBe('<h2 id="karriere">Klubben</h2>');
  });
});

describe("renderMarkdown sanitizing", () => {
  it("keeps the figure blocks the content uses", () => {
    const html = renderMarkdown(
      '<figure class="bsprofil-container">\n    <img src="/images/x.jpg" alt="X" class="bsprofil">\n' +
        '    <figcaption class="bsprofil-caption">X - Juni 2025</figcaption>\n</figure>',
    );
    expect(html).toContain('<figure class="bsprofil-container">');
    expect(html).toContain('<img src="/images/x.jpg" alt="X" class="bsprofil">');
    expect(html).toContain('<figcaption class="bsprofil-caption">');
  });

  it("keeps <br> and drops scripts and event handlers", () => {
    const html = renderMarkdown('a<br><br>b <script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).toContain("<br><br>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
  });
});

describe("renderInline", () => {
  it("renders a fact value without a wrapping <p>", () => {
    expect(renderInline("[[person:zimma|Zimma]]")).toBe('<a href="/personer/zimma/">Zimma</a>');
    expect(renderInline("Nei")).toBe("Nei");
    expect(renderInline(null)).toBe("");
  });
});
