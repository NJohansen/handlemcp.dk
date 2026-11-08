# handlemcp.dk

The website for [HandleMCP](https://handlemcp.dk/). Served by GitHub Pages from the root of `main`.

The MCP server itself, its docs and its MIT licence live in [NJohansen/handle-mcp](https://github.com/NJohansen/handle-mcp).

## Licence

© Niclas Johansen. All rights reserved. Text, design, photos and illustrations on this site may not be copied or reused without permission. The fonts in `fonts/` keep their own licences.

## Topic pages

`nemlig-mcp/`, `bilkatogo-api/`, `ai-madplan-budget/`, `madkonto-hele-maaneden/` and `billigere-end-maaltidskasse/` share `sider.css`. Install commands say `handle-mcp@latest`, so a release needs no change here.

## IndexNow

After each push to `main` that changes a page, `.github/workflows/indexnow.yml` waits for Pages to publish and sends the changed URLs to IndexNow (Bing, Yandex, Naver). Run the workflow by hand to send every page in `sitemap.xml`. The key file `419c1175c88ecd7a2e7d85219227ab75.txt` must stay in the root. Google does not use IndexNow.

## Checks

Every pull request runs `.github/workflows/site.yml`:

- `.github/checks/static.py`: in-page links, local files, JSON-LD (FAQ matches the page), sitemap.
- `.github/checks/smoke.mjs`: each page in Chromium at 1440, 1024, 901 and 390 px. No browser errors, no sideways scroll, the menu on one line, every rounded corner shows the section above it, and the basket lands in the story photo. Screenshots are uploaded as the `screenshots` artifact.

Outside links run once a week in `.github/workflows/links.yml`.

Run locally:

```
python3 .github/checks/static.py
cd .github/checks && npm install --no-save playwright && npx playwright install chromium && cd -
node .github/checks/smoke.mjs screenshots
```
