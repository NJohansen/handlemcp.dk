"""Static checks for handlemcp.dk. Standard library only.

- every in-page link (#x, /#x) points to an id that exists
- every local file the pages use exists (src, href, CSS url())
- every JSON-LD block parses, and the FAQ data matches the questions on the page
- every page in sitemap.xml exists
"""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
PAGES = ["index.html", "privatliv/index.html", "nemlig-mcp/index.html", "bilkatogo-api/index.html"]
SITE = "https://handlemcp.dk"


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.refs, self.jsonld, self.summaries = set(), [], [], []
        self._ld = self._sum = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        for k in ("href", "src"):
            if a.get(k):
                self.refs.append(a[k])
        if tag == "script" and a.get("type") == "application/ld+json":
            self._ld = []
        if tag == "summary":
            self._sum = []

    def handle_endtag(self, tag):
        if tag == "script" and self._ld is not None:
            self.jsonld.append("".join(self._ld))
            self._ld = None
        if tag == "summary" and self._sum is not None:
            self.summaries.append(" ".join("".join(self._sum).split()))
            self._sum = None

    def handle_data(self, data):
        if self._ld is not None:
            self._ld.append(data)
        if self._sum is not None:
            self._sum.append(data)


def parse(rel):
    p = Page()
    text = (ROOT / rel).read_text(encoding="utf-8")
    p.feed(text)
    p.refs += re.findall(r"url\(['\"]?([^'\")]+)", text)
    return p


def local_file(page, ref):
    """The file a local reference points to, or None for links we do not check."""
    u = urlparse(ref)
    if u.scheme in ("mailto", "data", "tel") or (u.scheme and u.netloc != "handlemcp.dk"):
        return None
    path = u.path
    if not path:
        return None
    base = ROOT if path.startswith("/") else (ROOT / page).parent
    f = (base / path.lstrip("/")).resolve()
    return f / "index.html" if path.endswith("/") or f.is_dir() else f


def main():
    errors = []
    pages = {rel: parse(rel) for rel in PAGES}
    for rel, p in pages.items():
        for ref in p.refs:
            u = urlparse(ref)
            if ref.startswith("#") and len(ref) > 1 and ref[1:] not in p.ids:
                errors.append(f"{rel}: {ref} has no matching id")
            if u.fragment and u.path in ("/", "") and not ref.startswith("#"):
                if u.fragment not in pages["index.html"].ids:
                    errors.append(f"{rel}: {ref} has no matching id on the front page")
            f = local_file(rel, ref)
            if f is not None and not ref.startswith("#") and not f.exists():
                errors.append(f"{rel}: {ref} is missing ({f.relative_to(ROOT)})")
        for block in p.jsonld:
            try:
                data = json.loads(block)
            except json.JSONDecodeError as e:
                errors.append(f"{rel}: JSON-LD does not parse: {e}")
                continue
            for node in data.get("@graph", [data]):
                if node.get("@type") == "FAQPage":
                    ld = [q["name"] for q in node["mainEntity"]]
                    if ld != p.summaries:
                        errors.append(f"{rel}: FAQ JSON-LD {ld} differs from the page {p.summaries}")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    for loc in re.findall(r"<loc>([^<]+)</loc>", sitemap):
        f = local_file("index.html", loc.replace(SITE, ""))
        if f is None or not f.exists():
            errors.append(f"sitemap.xml: {loc} has no page")
    for e in errors:
        print("FAIL", e)
    print(f"{len(errors)} problems in {len(PAGES)} pages")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
