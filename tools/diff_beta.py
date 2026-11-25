"""Compare the Next.js wiki against a Jekyll build of docs/, page by page.

Wiki migration, Phase 1 (notes/claude-specs/plans/wiki-phase1-readonly.md, task 11).

For every page in the Jekyll output (personer/, klubber/, wiki/, diverse/) this fetches the same
URL from the new site and compares, inside <div id="content">:

  - the visible text (whitespace-normalized; kramdown's typographic quotes/dashes folded to ASCII)
  - the set of link targets (<a href>)
  - the set of images, after dropping images whose file doesn't exist under docs/ (the new site
    leaves those out on purpose; the live site renders them broken)

Then it crawls every internal link found on the new site and reports any that resolve to the
"not found" page.

Usage (from the repo root):

    bundle exec jekyll build -s docs -d <jekyll-out>
    python tools/diff_beta.py <jekyll-out> --base http://localhost:3000
    python tools/diff_beta.py <jekyll-out> --base https://beta.brawlstarsnorge.com

Exit code 1 if any page differs (pages listed in KNOWN_DIFFERENCES are reported but not failed).
"""

import argparse
import difflib
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS = REPO_ROOT / "docs"
SECTIONS = ("personer", "klubber", "wiki", "diverse")

# Pages that intentionally differ from the Jekyll version. Shown, never failed.
KNOWN_DIFFERENCES = {
    "/diverse/oversikt/": "generated from the database (counts + list) instead of hand-maintained",
    "/personer/trym-ivar/": "link /klubber/the_audacity/ (broken on live) fixed to /klubber/the-audacity/",
}

TYPOGRAPHY = str.maketrans({
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", " ": " ", "…": "...",
})
# Next.js streams not-found pages with status 200 but always adds this tag to them.
NOT_FOUND_MARKER = '<meta name="robots" content="noindex"'


class ContentParser(HTMLParser):
    """Collects text, links and images inside <div id="content">."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0  # >0 while inside #content (counts nested divs)
        self.skip = 0  # inside <script>/<style>/<template>
        self.text = []
        self.links = set()
        self.images = set()
        self.figure = None  # {"text": [...], "keep": bool} while inside <figure>

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.depth == 0:
            if tag == "div" and a.get("id") == "content":
                self.depth = 1
            return
        if tag == "div":
            self.depth += 1
        if tag in ("script", "style", "template"):
            self.skip += 1
        if tag == "a" and a.get("href"):
            self.links.add(normalize_url(a["href"]))
        if tag == "figure":
            self.figure = {"text": [], "keep": True}
        if tag == "img" and a.get("src"):
            src = normalize_url(a["src"])
            self.images.add(src)
            if self.figure is not None and not image_exists(src):
                self.figure["keep"] = False
        if tag in ("br", "p", "li", "tr", "h1", "h2", "h3", "h4", "figcaption", "td", "th"):
            self.text.append(" ")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if self.depth == 0:
            return
        if tag in ("script", "style", "template") and self.skip:
            self.skip -= 1
        if tag == "div":
            self.depth -= 1
        if tag in ("p", "li", "td", "th", "h1", "h2", "h3", "h4"):
            self.text.append(" ")
        if tag == "figure" and self.figure is not None:
            # The new site leaves out figures whose image is missing, caption included.
            if self.figure["keep"]:
                self.text.extend(self.figure["text"])
            self.figure = None

    def handle_data(self, data):
        if self.depth and not self.skip:
            (self.figure["text"] if self.figure is not None else self.text).append(data)


def normalize_url(url):
    url = urllib.parse.unquote(url.strip())
    return url.replace("{{ site.baseurl }}", "")


def words(parser):
    text = "".join(parser.text).translate(TYPOGRAPHY)
    return text.split()


def parse(html):
    p = ContentParser()
    p.feed(html)
    return p


def fetch(url):
    quoted = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%")
    try:
        with urllib.request.urlopen(quoted, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def image_exists(src):
    if not src.startswith("/images/"):
        return True  # external or non-image path: keep it in the comparison
    return (DOCS / src.lstrip("/")).is_file()


def compare(route, jekyll_html, new_html):
    old, new = parse(jekyll_html), parse(new_html)
    problems = []

    ow, nw = words(old), words(new)
    if ow != nw:
        diff = [
            line for line in difflib.unified_diff(ow, nw, lineterm="", n=3)
            if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))
        ]
        problems.append("text differs: " + " ".join(diff[:40]) + (" ..." if len(diff) > 40 else ""))

    if old.links != new.links:
        problems.append(f"links only in Jekyll: {sorted(old.links - new.links)}; "
                        f"only in new: {sorted(new.links - old.links)}")

    expected_images = {src for src in old.images if image_exists(src)}
    if expected_images != new.images:
        problems.append(f"images only in Jekyll: {sorted(expected_images - new.images)}; "
                        f"only in new: {sorted(new.images - expected_images)}")

    return problems, new.links


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("jekyll_site", type=Path, help="output dir of `jekyll build -s docs`")
    ap.add_argument("--base", default="http://localhost:3000", help="new site base URL")
    ap.add_argument("--only", help="only check routes containing this text")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    routes = []
    for section in SECTIONS:
        for index in sorted((args.jekyll_site / section).rglob("index.html")):
            rel = index.parent.relative_to(args.jekyll_site).as_posix()
            routes.append(f"/{rel}/")
    if args.only:
        routes = [r for r in routes if args.only in r]

    failed, known, ok = [], [], 0
    internal_links = set()
    for route in routes:
        jekyll_html = (args.jekyll_site / route.strip("/") / "index.html").read_text("utf-8")
        status, html = fetch(base + route)
        if status != 200 or NOT_FOUND_MARKER in html:
            failed.append((route, [f"HTTP {status}" + (" (not-found page)" if status == 200 else "")]))
            continue
        problems, links = compare(route, jekyll_html, html)
        internal_links |= {l for l in links if l.startswith("/")}
        if not problems:
            ok += 1
        elif route in KNOWN_DIFFERENCES:
            known.append((route, [KNOWN_DIFFERENCES[route]] + problems))
        else:
            failed.append((route, problems))

    print(f"{ok}/{len(routes)} pages identical")
    for title, items in (("Known differences", known), ("DIFFERENCES", failed)):
        if items:
            print(f"\n{title} ({len(items)}):")
            for route, problems in items:
                print(f"  {route}")
                for p in problems:
                    print(f"    - {p}")

    broken = []
    for link in sorted(internal_links):
        path = link.split("#")[0]
        if not path or path.startswith(("/images/", "/rankedstats/")) or path in routes:
            continue
        status, html = fetch(base + path)
        if status >= 400 or NOT_FOUND_MARKER in html:
            broken.append(f"{link} (HTTP {status})")
    if broken:
        print(f"\nBROKEN INTERNAL LINKS ({len(broken)}):")
        for b in broken:
            print(f"  - {b}")

    return 1 if failed or broken else 0


if __name__ == "__main__":
    sys.exit(main())
