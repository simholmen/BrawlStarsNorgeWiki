"""Import the Jekyll wiki content (docs/_personer, docs/_klubber) into Supabase.

Wiki migration, Phase 0 (see notes/claude-specs/plans/wiki-phase1-readonly.md, task 3).

SINCE PHASE 4 (2026-11-25) SUPABASE IS THE SOURCE OF TRUTH for people/clubs: editors change them
on the site, and docs/_personer + docs/_klubber are frozen. Running this import would overwrite
those edits with the old Markdown, so it refuses once any edit made on the site exists (see
`revisions`), unless --i-know-this-overwrites-site-edits is given.

Originally (Phases 0-3) the Markdown files were the source of truth and this script rebuilt the
`people` and `clubs` tables (migration 011) from them; it can still be re-run any time:

  - rows are matched on `slug`; only rows whose content actually changed are written, so a second
    run in a row reports zero changes
  - rows whose Markdown file no longer exists are deleted (refused above --max-delete unless
    --force), so renames and removals are picked up
  - internal <a href="/personer/x/">Label</a> links become [[person:x|Label]], club links
    become [[klubb:x|Label]], and any other <a> becomes a Markdown link [Label](url)

Usage (from the repo root):

    python tools/import_wiki.py --dry-run
    python tools/import_wiki.py
    python tools/import_wiki.py --jekyll-site <dir with a fresh `jekyll build` output>

Exit code is 1 if the report contains errors (unknown link targets, slug mismatches with the
Jekyll build); nothing is written in that case.
"""

import argparse
import datetime
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from rankedstats import supa  # noqa: E402

DOCS = REPO_ROOT / "docs"
PERSONER_DIR = DOCS / "_personer"
KLUBBER_DIR = DOCS / "_klubber"

# Tags that may legitimately remain in body_md / facts after link conversion. The renderer
# allow-lists these; anything else is reported as a warning.
ALLOWED_HTML_TAGS = {"br", "figure", "figcaption", "img"}

PERSON_FIELDS = [
    "name", "subtitle", "hjemsted", "born", "bsid", "favorittbrus", "favoritt_brawler",
    "quote", "fiende",
]
CLUB_FIELDS = ["name", "aktiv", "stiftet", "leder", "medlemmer"]
# Front-matter keys that are known and intentionally not stored.
IGNORED_KEYS = {"layout", "title", "image"}

LINK_RE = re.compile(r'<a\s+href="([^"]*)"\s*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"</?([a-zA-Z][a-zA-Z0-9]*)")
BASEURL_RE = re.compile(r"\{\{\s*site\.baseurl\s*\}\}")
PROFILE_FLAG_RE = re.compile(r"no_(\d{4})_profile")


# ---------------------------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------------------------

def jekyll_slugify(text: str) -> str:
    """Jekyll's default `slugify` mode, which its `:name` permalink placeholder uses.

    Runs of anything that isn't a Unicode letter, mark or decimal digit become one '-', leading
    and trailing '-' are stripped, and the result is lowercased. NFC-normalized first so a
    filename stored decomposed (macOS) slugs the same as one typed on Windows.
    """

    text = unicodedata.normalize("NFC", text)
    out = []
    prev_dash = False
    for ch in text:
        cat = unicodedata.category(ch)
        if cat[0] in ("L", "M") or cat == "Nd":
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-").lower()


def read_page(path: Path):
    """Split a Jekyll page into (front matter dict, body text)."""

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: no front matter")

    end = 1
    while end < len(lines) and lines[end].strip() != "---":
        end += 1
    if end >= len(lines):
        raise ValueError(f"{path}: unterminated front matter")

    data = yaml.safe_load("".join(lines[1:end])) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path}: front matter is not a mapping")

    body = "".join(lines[end + 1:]).lstrip("\n")
    return data, body


def image_key(name: str) -> str:
    """Image file base name: Jekyll's `name | downcase | replace: ' ', '_'` (migration 014)."""

    return name.lower().replace(" ", "_")


def as_text(value):
    """Front-matter scalar -> text column value (None stays None, '' becomes None)."""

    if value is None:
        return None
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    text = str(value).strip()
    return text or None


# ---------------------------------------------------------------------------------------------
# Link conversion + report
# ---------------------------------------------------------------------------------------------

class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.notes = []
        self.allowed_tags = Counter()

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def note(self, msg):
        self.notes.append(msg)


class LinkConverter:
    def __init__(self, person_slugs, club_slugs, report):
        self.person_slugs = person_slugs
        self.club_slugs = club_slugs
        self.report = report

    def convert(self, text, where):
        """Convert <a> tags in `text`, then report whatever HTML is left."""

        if not text:
            return text

        text = BASEURL_RE.sub("", text)

        def replace(match):
            href, label = match.group(1).strip(), match.group(2).strip()
            if "|" in label or "]" in label:
                self.report.warn(f"{where}: link label {label!r} contains '|' or ']'")

            wiki = re.fullmatch(r"/(personer|klubber)/([^/?#]+)/?", href)
            if wiki:
                kind, raw_slug = wiki.groups()
                slug = jekyll_slugify(raw_slug)
                known = self.person_slugs if kind == "personer" else self.club_slugs
                prefix = "person" if kind == "personer" else "klubb"
                if slug not in known:
                    self.report.error(f"{where}: link to unknown page {href!r}")
                    return f"[{label}]({href})"
                if slug != raw_slug:
                    self.report.note(
                        f"{where}: fixed link {href!r} -> /{kind}/{slug}/ (broken on live site)"
                    )
                return f"[[{prefix}:{slug}|{label}]]"

            return f"[{label}]({href})"

        text = LINK_RE.sub(replace, text)

        for tag in TAG_RE.findall(text):
            tag = tag.lower()
            if tag in ALLOWED_HTML_TAGS:
                self.report.allowed_tags[tag] += 1
            else:
                self.report.warn(f"{where}: unconverted HTML tag <{tag}>")

        return text

    def convert_facts(self, facts, where):
        """[[label, value], ...] -> [{"label", "value"}, ...] with links converted."""

        if not facts:
            return []
        out = []
        for i, row in enumerate(facts):
            if not isinstance(row, (list, tuple)) or len(row) != 2:
                self.report.error(f"{where}: facts[{i}] is not a [label, value] pair: {row!r}")
                continue
            label = as_text(row[0]) or ""
            value = self.convert(as_text(row[1]) or "", f"{where} facts[{label}]")
            out.append({"label": label, "value": value})
        return out


# ---------------------------------------------------------------------------------------------
# Building rows
# ---------------------------------------------------------------------------------------------

def load_dir(directory: Path, report: Report):
    pages = {}
    for path in sorted(directory.glob("*.md")):
        slug = jekyll_slugify(path.stem)
        if slug in pages:
            report.error(f"{path.name}: slug {slug!r} collides with {pages[slug][0].name}")
            continue
        data, body = read_page(path)
        pages[slug] = (path, data, body)
    return pages


def build_person(slug, path, data, body, conv, report):
    where = f"_personer/{path.name}"
    row = {"slug": slug}
    for field in PERSON_FIELDS:
        value = as_text(data.get(field))
        # name/bsid are identifiers, never rendered as Markdown; the rest may hold links
        # (e.g. `fiende: <a href="/personer/x/">X</a>`).
        row[field] = value if field in ("name", "bsid") else conv.convert(value, f"{where} {field}")
    row["image_ext"] = as_text(data.get("image_ext")) or "jpg"
    row["image_key"] = image_key(row["name"] or slug)
    hidden_keys = {k for k in data if PROFILE_FLAG_RE.fullmatch(k)}
    row["hidden_profile_years"] = sorted(
        int(PROFILE_FLAG_RE.fullmatch(k).group(1)) for k in hidden_keys if data[k] is True
    )
    row["facts"] = conv.convert_facts(data.get("facts"), where)
    row["body_md"] = conv.convert(body, where)

    if not row["name"]:
        report.error(f"{where}: missing name")
    known = set(PERSON_FIELDS) | {"image_ext", "facts"} | hidden_keys | IGNORED_KEYS
    for key in sorted(set(data) - known):
        report.warn(f"{where}: front-matter key {key!r} is not imported")
    return row


def build_club(slug, path, data, body, conv, report):
    where = f"_klubber/{path.name}"
    row = {"slug": slug}
    for field in CLUB_FIELDS:
        row[field] = conv.convert(as_text(data.get(field)), f"{where} {field}")
    row["underklubber"] = [as_text(u) for u in (data.get("underklubber") or []) if as_text(u)]
    row["image_ext"] = as_text(data.get("image_ext")) or "jpg"
    row["image_key"] = image_key(row["name"] or slug)
    row["facts"] = conv.convert_facts(data.get("facts"), where)
    row["body_md"] = conv.convert(body, where)

    if not row["name"]:
        report.error(f"{where}: missing name")
    known = set(CLUB_FIELDS) | {"underklubber", "image_ext", "facts"} | IGNORED_KEYS
    for key in sorted(set(data) - known):
        report.warn(f"{where}: front-matter key {key!r} is not imported")
    return row


def check_against_jekyll(site_dir: Path, collection: str, slugs, report):
    """Every slug must have a built page in the Jekyll output, and vice versa."""

    built_dir = site_dir / collection
    if not built_dir.is_dir():
        report.error(f"--jekyll-site: {built_dir} does not exist")
        return
    built = {
        unicodedata.normalize("NFC", p.name)
        for p in built_dir.iterdir()
        if (p / "index.html").is_file()
    }
    for slug in sorted(set(slugs) - built):
        report.error(f"slug {collection}/{slug} has no page in the Jekyll build")
    for slug in sorted(built - set(slugs)):
        report.error(f"Jekyll built {collection}/{slug} but the import has no such slug")


# ---------------------------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------------------------

def diff_rows(table, rows, existing):
    """Return (to_upsert, to_delete_slugs) comparing desired rows with current DB rows."""

    by_slug = {r["slug"]: r for r in existing}
    to_upsert = []
    for row in rows:
        current = by_slug.get(row["slug"])
        if current is None or any(current.get(k) != v for k, v in row.items()):
            to_upsert.append(row)
    wanted = {r["slug"] for r in rows}
    to_delete = sorted(set(by_slug) - wanted)
    return to_upsert, to_delete


def count_site_edits() -> int:
    """Revisions made by logged-in users (user_id set), i.e. edits made on the site."""

    try:
        rows = supa.select("revisions", {"select": "id", "user_id": "not.is.null", "limit": "1000"})
    except Exception:  # noqa: BLE001 - table missing before migration 014: no site edits possible
        return 0
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    parser.add_argument("--jekyll-site", type=Path,
                        help="output dir of a fresh `jekyll build`, to cross-check slugs")
    parser.add_argument("--max-delete", type=int, default=3,
                        help="refuse to delete more rows than this without --force (default 3)")
    parser.add_argument("--force", action="store_true", help="allow deletes above --max-delete")
    parser.add_argument("--verbose", action="store_true", help="list allowed-HTML occurrences")
    parser.add_argument("--i-know-this-overwrites-site-edits", dest="overwrite_site_edits",
                        action="store_true",
                        help="run even though people/clubs have been edited on the site")
    args = parser.parse_args()

    site_edits = count_site_edits()
    if site_edits and not args.overwrite_site_edits:
        print(f"Refusing to import: {site_edits} change(s) have been made on the site since editing")
        print("went live (Phase 4). Supabase is now the source of truth for people/clubs, and this")
        print("import would overwrite those edits with the frozen Markdown files.")
        print("Edit pages on the site instead. To overwrite anyway (e.g. restoring from Markdown on")
        print("purpose), re-run with --i-know-this-overwrites-site-edits.")
        if not args.dry_run:
            return 1
        print("(--dry-run: showing what would happen anyway.)")
        print()

    report = Report()
    people_src = load_dir(PERSONER_DIR, report)
    clubs_src = load_dir(KLUBBER_DIR, report)
    conv = LinkConverter(set(people_src), set(clubs_src), report)

    people = [build_person(s, *people_src[s], conv, report) for s in people_src]
    clubs = [build_club(s, *clubs_src[s], conv, report) for s in clubs_src]

    if args.jekyll_site:
        check_against_jekyll(args.jekyll_site, "personer", people_src, report)
        check_against_jekyll(args.jekyll_site, "klubber", clubs_src, report)

    print(f"Parsed {len(people)} people from {PERSONER_DIR.relative_to(REPO_ROOT)}")
    print(f"Parsed {len(clubs)} clubs from {KLUBBER_DIR.relative_to(REPO_ROOT)}")
    if report.allowed_tags:
        tags = ", ".join(f"<{t}> x{n}" for t, n in sorted(report.allowed_tags.items()))
        print(f"HTML kept (allow-listed for the renderer): {tags}")
    for title, items in (("NOTES", report.notes), ("WARNINGS", report.warnings),
                         ("ERRORS", report.errors)):
        if items:
            print(f"\n{title} ({len(items)}):")
            for item in items:
                print(f"  - {item}")

    if report.errors:
        print("\nErrors found; nothing written.")
        return 1

    plan = []
    for table, rows in (("people", people), ("clubs", clubs)):
        try:
            existing = supa.select(table, {"select": ",".join(rows[0].keys()) if rows else "slug"})
        except Exception as exc:  # noqa: BLE001 - surface any connection/schema problem plainly
            print(f"\nCould not read table {table!r} ({exc}).")
            print("Is migration supabase/migrations/011_wiki_content.sql applied, and are "
                  "SUPABASE_URL / SUPABASE_SECRET_KEY set in .env?")
            if not args.dry_run:
                return 1
            existing = []
        to_upsert, to_delete = diff_rows(table, rows, existing)
        plan.append((table, rows, existing, to_upsert, to_delete))

    print()
    for table, rows, existing, to_upsert, to_delete in plan:
        new = {r["slug"] for r in to_upsert} - {r["slug"] for r in existing}
        print(f"{table}: {len(existing)} in DB, {len(new)} new, "
              f"{len(to_upsert) - len(new)} changed, {len(to_delete)} to delete")
        for slug in sorted(r["slug"] for r in to_upsert):
            print(f"  {'+' if slug in new else '~'} {slug}")
        for slug in to_delete:
            print(f"  - {slug}")

    total_delete = sum(len(p[4]) for p in plan)
    if total_delete > args.max_delete and not args.force:
        print(f"\nRefusing to delete {total_delete} rows (> --max-delete {args.max_delete}). "
              "Check the list above and re-run with --force if it's intended.")
        return 1

    if args.dry_run:
        print("\nDry run; nothing written.")
        return 0

    for table, rows, existing, to_upsert, to_delete in plan:
        if to_upsert:
            supa.upsert(table, to_upsert, on_conflict="slug")
        for slug in to_delete:
            supa.delete(table, {"slug": f"eq.{slug}"})

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
