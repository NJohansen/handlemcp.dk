// Browser checks for handlemcp.dk. Run: node .github/checks/smoke.mjs [out-dir]
// Serves the repo root, blocks every outside request, and checks each page at three sizes.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const OUT = process.argv[2] || "screenshots";
const TYPES = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".css": "text/css", ".js": "text/javascript", ".txt": "text/plain", ".xml": "application/xml" };
const PAGES = [{ name: "forside", path: "/" }, { name: "privatliv", path: "/privatliv/" }, ...["nemlig-mcp", "bilkatogo-api", "rema-1000-mcp", "ai-madplan-budget", "madkonto-hele-maaneden", "billigere-end-maaltidskasse"].map((s) => ({ name: s, path: `/${s}/` }))];
const SIZES = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "nav-min", width: 901, height: 800 }, { name: "mobil", width: 390, height: 844 }];

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails.push(msg); };
const browser = await chromium.launch();

for (const page of PAGES) for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("hm-pre", "1"); } catch {} });
  await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  pg.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const tag = `${page.name} ${size.name}`;
  await pg.goto(BASE + page.path, { waitUntil: "load" });
  await pg.waitForTimeout(800);

  const wide = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(wide <= 0, `${tag}: no sideways scroll (${wide}px too wide)`);

  if (size.width > 900) {
    const nav = await pg.evaluate(() => {
      const box = document.querySelector(".navbox").getBoundingClientRect();
      const cta = document.querySelector(".navcta").getBoundingClientRect();
      const lis = [...document.querySelectorAll("nav ul li")].filter((li) => li.offsetParent);
      return { h: box.height, right: innerWidth - cta.right, rows: new Set(lis.map((li) => Math.round(li.getBoundingClientRect().top))).size };
    });
    check(nav.rows === 1 && nav.h < 80, `${tag}: menu on one line (${nav.rows} rows, ${Math.round(nav.h)}px high)`);
    check(nav.right >= 8, `${tag}: waitlist button inside the screen (${Math.round(nav.right)}px to the edge)`);
  }

  // Each rounded corner shows the colour of the section above it, never a white gap.
  const corners = await pg.evaluate(() => {
    const clear = (c) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";
    const bg = (e, pseudo) => getComputedStyle(e, pseudo).backgroundColor;
    const pageBg = [document.body, document.documentElement].map((e) => bg(e)).find((c) => !clear(c)) || "rgb(255, 255, 255)";
    const els = [...document.querySelectorAll("main section"), document.querySelector("footer")].filter(Boolean);
    const out = [];
    for (let i = 1; i < els.length; i++) {
      const prev = els[i - 1], next = els[i];
      const before = getComputedStyle(prev, "::before");
      const prevColour = clear(bg(prev, "::before")) ? bg(prev) : bg(prev, "::before");
      const reach = prev.getBoundingClientRect().bottom - (parseFloat(before.bottom) || 0);
      const radius = parseFloat(getComputedStyle(next, next.tagName === "FOOTER" ? null : "::before").borderTopLeftRadius) || 0;
      const corner = reach >= next.getBoundingClientRect().top + radius ? prevColour : pageBg;
      out.push({ prev: prev.id || prev.className || prev.tagName, next: next.id || next.className || next.tagName, ok: clear(prevColour) || corner === prevColour, corner, prevColour });
    }
    return out;
  });
  for (const c of corners) check(c.ok, `${tag}: corner between ${c.prev} and ${c.next} shows ${c.corner}, expected ${c.prevColour}`);

  // Phones: every field is 16px or more, or iOS zooms in on tap and the page pans sideways.
  if (size.width <= 900) {
    const small = await pg.evaluate(() => [...document.querySelectorAll("input, textarea, select")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.name || e.tagName));
    check(small.length === 0, `${tag}: fields 16px or more, no zoom on tap${small.length ? ": " + small.join(", ") : ""}`);
  }

  // Feature card titles stay on one line and inside their card.
  const titles = await pg.evaluate(() => [...document.querySelectorAll(".cans h3")].filter((h) => h.scrollWidth > h.clientWidth + 1).map((h) => h.textContent));
  if (page.path === "/") check(titles.length === 0, `${tag}: feature titles on one line${titles.length ? ": " + titles.join(", ") : ""}`);

  await pg.screenshot({ path: join(OUT, `${page.name}-${size.name}-top.png`) });

  // Front page, wide screens: the basket lands inside the story photo, smaller than the photo.
  if (page.path === "/" && size.width >= 900) {
    await pg.evaluate(() => { const s = document.querySelector("#losning .split"); scrollTo(0, s.getBoundingClientRect().top + scrollY - 100); });
    await pg.waitForTimeout(600);
    const b = await pg.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const k = r(document.getElementById("basket")), f = r(document.querySelector("#losning .blob"));
      return { cx: (k.left + k.right) / 2, cy: (k.top + k.bottom) / 2, bottom: k.bottom, w: k.width, f: { l: f.left, r: f.right, t: f.top, b: f.bottom, w: f.width } };
    });
    const inside = b.cx > b.f.l && b.cx < b.f.r && b.cy > b.f.t + b.f.w * 0.5 && b.bottom < b.f.b;
    check(inside, `${tag}: basket stands on the tiles in the photo`);
    check(b.w < b.f.w * 0.5, `${tag}: basket smaller than half the photo (${Math.round(b.w)} of ${Math.round(b.f.w)}px)`);
    await pg.screenshot({ path: join(OUT, `${page.name}-${size.name}-historie.png`) });
  }

  await pg.screenshot({ path: join(OUT, `${page.name}-${size.name}-hele.png`), fullPage: true });
  check(errors.length === 0, `${tag}: no errors in the browser${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${fails.length} problems. Screenshots in ${OUT}/`);
process.exit(fails.length ? 1 : 0);
