/* dom_check.js — verify design-system application via computed styles + DOM structure. */
const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");
// Resolve relative to this script so it runs anywhere the repo is unpacked.
const URL = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await require("./lib/offline_fonts").stubFonts(page);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && document.querySelector("#app .sidebar"), null, { timeout: 8000 });

  const results = {};

  // Theme: accent + fonts per theme
  results.lightAccent = await page.evaluate(() => {
    window.AIWS.applyTheme("light");
    return getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  });
  results.lightHeadingFont = await page.evaluate(() => {
    const h = document.createElement("h1"); document.body.appendChild(h);
    const f = getComputedStyle(h).fontFamily; h.remove(); return f;
  });
  results.lightLabelTransform = await page.evaluate(() => {
    window.AIWS.navigate("overview");
    const el = document.querySelector(".section-label");
    return getComputedStyle(el).textTransform + " | " + getComputedStyle(el).fontFamily;
  });

  results.darkAccent = await page.evaluate(() => {
    window.AIWS.applyTheme("dark");
    return getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  });
  results.darkHeadingFont = await page.evaluate(() => {
    const h = document.createElement("h1"); document.body.appendChild(h);
    const f = getComputedStyle(h).fontFamily; h.remove(); return f;
  });
  results.darkLabelTransform = await page.evaluate(() => {
    window.AIWS.navigate("overview");
    const el = document.querySelector(".section-label");
    return getComputedStyle(el).textTransform + " | " + getComputedStyle(el).fontFamily;
  });
  results.darkRadiusCard = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--radius-card").trim());
  results.lightRadiusCard = await page.evaluate(() => { window.AIWS.applyTheme("light"); return getComputedStyle(document.documentElement).getPropertyValue("--radius-card").trim(); });

  // Each route renders a page title + content
  results.routes = [];
  const ROUTES = ["overview","agents","dialogs","crm","leads","docs","calendar","tasks","storage","team","supply","training","analytics","integrations","settings","help"];
  for (const r of ROUTES) {
    await page.evaluate((rr) => window.AIWS.navigate(rr), r);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const title = document.querySelector(".page-head .title");
      const view = document.querySelector("#view");
      return { title: title ? title.textContent.trim() : null, viewChars: view ? view.textContent.length : 0 };
    });
    results.routes.push({ route: r, title: info.title, chars: info.viewChars });
  }

  // Structural spot checks
  await page.evaluate(() => window.AIWS.navigate("overview"));
  await page.waitForTimeout(150);
  results.onboardingSteps = await page.evaluate(() => document.querySelectorAll(".step").length);
  results.utcClock = await page.evaluate(() => !!document.querySelector("#utcTime"));

  await page.evaluate(() => window.AIWS.navigate("crm"));
  await page.waitForTimeout(150);
  results.crmDefaultView = await page.evaluate(() => {
    const seg = document.querySelector("#crmViewSeg .seg.active");
    return seg ? seg.textContent.trim() : null;
  });
  await page.evaluate(() => window.AIWS.setState({ crmView: "kanban" }));
  await page.waitForTimeout(150);
  results.kanbanCols = await page.evaluate(() => document.querySelectorAll(".kanban-col").length);
  results.kanbanCards = await page.evaluate(() => document.querySelectorAll(".kanban-card[draggable='true']").length);

  await page.evaluate(() => window.AIWS.navigate("integrations"));
  await page.waitForTimeout(150);
  results.integrationCards = await page.evaluate(() => document.querySelectorAll(".integration-card").length);
  results.statusBadges = await page.evaluate(() => document.querySelectorAll(".status-badge").length);

  await page.evaluate(() => window.AIWS.navigate("dialogs"));
  await page.waitForTimeout(150);
  results.dialogPanes = await page.evaluate(() => ({
    list: !!document.querySelector(".chat-list"),
    thread: !!document.querySelector(".chat-thread"),
    context: !!document.querySelector(".chat-context")
  }));

  // Focus ring uses accent
  results.focusRing = await page.evaluate(() => {
    window.AIWS.applyTheme("light");
    return null;
  });
  // программный focus() не включает :focus-visible, поэтому идём Tab-ом, как пользователь с клавиатурой
  await page.evaluate(() => { window.AIWS.navigate("integrations"); });
  await page.waitForSelector("#requestInt");
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement && document.activeElement.id === "requestInt")) break;
  }
  results.focusRing = await page.evaluate(() => {
    const a = document.activeElement, cs = getComputedStyle(a);
    return { outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, accent: getComputedStyle(document.documentElement).getPropertyValue("--ring").trim(), focusVisible: a.matches(":focus-visible") };
  });
  results.focusRingOk = results.focusRing.focusVisible && /solid 2px/.test(results.focusRing.outline) && !/255, 255, 255/.test(results.focusRing.outline);

  // reduced-motion handling
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error("DOM CHECK FAILED:", e); process.exit(1); });
