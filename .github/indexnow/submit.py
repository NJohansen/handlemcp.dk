"""Tell IndexNow (Bing, Yandex, Naver ...) which pages changed. Standard library only.

  python3 .github/indexnow/submit.py <before-sha> <after-sha>   pages changed between two commits
  python3 .github/indexnow/submit.py --all                      every page in sitemap.xml
  add --dry-run to print the URLs and send nothing

The key is public by design: IndexNow checks that https://handlemcp.dk/<key>.txt holds it.
"""

import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://handlemcp.dk"
KEY = "419c1175c88ecd7a2e7d85219227ab75"
ENDPOINT = "https://api.indexnow.org/indexnow"


def sitemap_urls():
    return re.findall(r"<loc>([^<]+)</loc>", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))


def changed_urls(before, after):
    """The page URL for every index.html that changed and still exists, if it is in the sitemap."""
    out = subprocess.run(["git", "diff", "--name-only", before, after], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    known = set(sitemap_urls())
    urls = []
    for path in out.split():
        if path.endswith("index.html") and (ROOT / path).exists():
            url = f"{SITE}/{path[: -len('index.html')]}"
            if url in known:
                urls.append(url)
    if "sitemap.xml" in out.split():
        urls.append(f"{SITE}/sitemap.xml")
    return urls


def main(args):
    dry = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    urls = sitemap_urls() if args == ["--all"] else changed_urls(*args)
    for u in urls:
        print(u)
    if not urls:
        print("no changed pages")
        return 0
    if dry:
        return 0
    body = json.dumps({"host": "handlemcp.dk", "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt", "urlList": urls}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print("IndexNow", r.status)  # 200 or 202 = accepted
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
