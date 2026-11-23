/* render_check.js — headless verification of the static prototype.
   Captures console errors/warnings, checks horizontal overflow at common
   widths, screenshots both themes and key routes. Artifacts -> /tmp/render.
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

// Resolve relative to this script so it runs anywhere the repo is unpacked
// (scripts/ and download/ sit side by side at the project root).
const URL = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;
const OUT = path.resolve(__dirname, "..", "render-out");
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = ["overview", "agents", "dialogs", "crm", "leads", "docs", "calendar", "tasks", "storage", "team", "supply", "training", "analytics", "integrations", "settings", "help"];

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await require("./lib/offline_fonts").stubFonts(ctx);
  const page = await ctx.newPage();

  const logs = [];
  page.on("console", (m) => { logs.push({ type: m.type(), text: m.text() }); });
  page.on("pageerror", (e) => { logs.push({ type: "pageerror", text: String(e) }); });

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && document.querySelector("#app .sidebar"), null, { timeout: 8000 }).catch(() => {});

  // helper: set theme + route, wait for render
  async function show(theme, route) {
    await page.evaluate((t) => window.AIWS.applyTheme(t), theme);
    await page.evaluate((r) => window.AIWS.navigate(r), route);
    await page.waitForTimeout(250);
  }

  // overflow check at multiple widths
  const overflows = [];
  for (const w of [1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    for (const route of ["overview", "crm", "dialogs", "integrations"]) {
      await show("light", route);
      const res = await page.evaluate(() => ({
        docSW: document.documentElement.scrollWidth,
        bodySW: document.body.scrollWidth,
        cw: window.innerWidth
      }));
      if (res.docSW > res.cw + 1 || res.bodySW > res.cw + 1) {
        overflows.push({ w, route, theme: "light", ...res });
      }
    }
  }

  // screenshots — light
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ROUTES) {
    await show("light", route);
    await page.screenshot({ path: path.join(OUT, `light-${route}.png`) });
  }
  // screenshots — dark (a representative subset)
  for (const route of ["overview", "agents", "dialogs", "crm", "integrations", "settings"]) {
    await show("dark", route);
    await page.screenshot({ path: path.join(OUT, `dark-${route}.png`) });
  }

  // theme attribute sanity
  const themeAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const darkHasGrain = await page.evaluate(() => {
    window.AIWS.applyTheme("dark");
    return getComputedStyle(document.querySelector(".grain")).display !== "none";
  });
  const lightHidesGrain = await page.evaluate(() => {
    window.AIWS.applyTheme("light");
    return getComputedStyle(document.querySelector(".grain")).display === "none";
  });
  const paletteWorks = await page.evaluate(() => {
    window.AIWS.setState({ paletteOpen: true });
    const ok = !!document.querySelector("#paletteRoot");
    window.AIWS.setState({ paletteOpen: false });
    return ok;
  });

  await browser.close();

  const errors = logs.filter((l) => l.type === "error" || l.type === "pageerror");
  const warnings = logs.filter((l) => l.type === "warning");
  console.log("=== CONSOLE ERRORS ===");
  console.log(errors.length ? JSON.stringify(errors, null, 2) : "(none)");
  console.log("=== CONSOLE WARNINGS ===");
  console.log(warnings.length ? JSON.stringify(warnings, null, 2) : "(none)");
  console.log("=== OVERFLOW CHECK ===");
  console.log(overflows.length ? JSON.stringify(overflows, null, 2) : "(no horizontal overflow at 1280/1440/1920)");
  console.log("=== THEME ===");
  console.log("data-theme:", themeAttr, "| grain visible in dark:", darkHasGrain, "| grain hidden in light:", lightHidesGrain, "| palette opens:", paletteWorks);
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".png"));
  console.log("=== SCREENSHOTS ===", files.length, "files in", OUT);
})().catch((e) => { console.error("RENDER CHECK FAILED:", e); process.exit(1); });
