/* mobile_check.js — адаптив на 375/768: горизонтальный overflow по всем маршрутам,
   видимость ключевых элементов, открытие drawer, ошибки консоли. */
const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");
const URL = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;

const ROUTES = ["overview","agents","dialogs","crm","leads","docs","calendar","tasks","storage","team","supply","training","analytics","integrations","settings","help"];

async function probe(width) {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, deviceScaleFactor: 2 });
  await require("./lib/offline_fonts").stubFonts(ctx);
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && document.querySelector("#app .sidebar, #app .main"), null, { timeout: 8000 });

  const overflows = [];
  for (const r of ROUTES) {
    await page.evaluate((rr) => window.AIWS.navigate(rr), r);
    await page.waitForTimeout(120);
    const res = await page.evaluate(() => ({
      docSW: document.documentElement.scrollWidth,
      bodySW: document.body.scrollWidth,
      cw: window.innerWidth,
      title: (document.querySelector(".page-head .title") || {}).textContent ? document.querySelector(".page-head .title").textContent.trim() : null,
      viewChars: (document.querySelector("#view") || {}).textContent ? document.querySelector("#view").textContent.length : 0
    }));
    if (res.docSW > res.cw + 1 || res.bodySW > res.cw + 1) overflows.push({ route: r, docSW: res.docSW, bodySW: res.bodySW, cw: res.cw });
  }

  // tasks board view (kanban) — отдельная проверка overflow на 375/768
  await page.evaluate(() => { window.AIWS.navigate("tasks"); window.AIWS.setState({ taskView: "board" }); });
  await page.waitForTimeout(150);
  const boardRes = await page.evaluate(() => ({
    docSW: document.documentElement.scrollWidth,
    bodySW: document.body.scrollWidth,
    cw: window.innerWidth,
    cols: document.querySelectorAll(".kanban-col[data-priority]").length
  }));
  if (boardRes.docSW > boardRes.cw + 1 || boardRes.bodySW > boardRes.cw + 1) overflows.push({ route: "tasks:board", docSW: boardRes.docSW, bodySW: boardRes.bodySW, cw: boardRes.cw });

  // element visibility on overview
  await page.evaluate(() => window.AIWS.navigate("overview"));
  await page.waitForTimeout(120);
  const vis = await page.evaluate(() => {
    function disp(sel) { var el = document.querySelector(sel); if (!el) return "absent"; return getComputedStyle(el).display; }
    function visible(sel) { var el = document.querySelector(sel); if (!el) return false; return getComputedStyle(el).display !== "none" && el.offsetParent !== null; }
    return {
      sidebarDisplay: disp(".sidebar"),
      menuBtnVisible: visible("#menuBtn"),
      collapseBtnTopVisible: visible("#collapseBtnTop"),
      topbarOverflows: document.querySelector("#topbar") ? (document.querySelector("#topbar").scrollWidth > document.querySelector("#topbar").clientWidth) : null,
      titlePresent: !!document.querySelector(".page-head .title"),
      contentPresent: !!document.querySelector("#view")
    };
  });

  // drawer opens on menuBtn click
  let drawerOpens = false;
  if (vis.menuBtnVisible) {
    await page.click("#menuBtn");
    await page.waitForTimeout(120);
    drawerOpens = await page.evaluate(() => !!document.querySelector(".drawer-overlay .sidebar-drawer"));
    await page.keyboard.press("Escape");
    await page.evaluate(() => { var o = document.querySelector(".drawer-overlay"); if (o) o.remove(); });
  }

  // tables & kanban: do their scroll containers exist (so wide content scrolls, not page)
  await page.evaluate(() => window.AIWS.navigate("docs"));
  await page.waitForTimeout(120);
  const scrollContainers = await page.evaluate(() => {
    function canScrollX(sel) { var el = document.querySelector(sel); if (!el) return "absent"; return el.scrollWidth > el.clientWidth ? "scrolls" : "fits"; }
    return { tblScroll: canScrollX(".tbl-scroll"), tableWrap: canScrollX(".table-wrap") };
  });
  await page.evaluate(() => window.AIWS.setState({ crmView: "kanban" }));
  await page.evaluate(() => window.AIWS.navigate("crm"));
  await page.waitForTimeout(120);
  const kanban = await page.evaluate(() => {
    var kb = document.querySelector(".kanban"); if (!kb) return "absent";
    return kb.scrollWidth > kb.clientWidth ? "scrolls" : "fits";
  });

  await browser.close();
  const errs = logs.filter((l) => l.startsWith("error") || l.startsWith("pageerror"));
  return { width, overflows, vis, drawerOpens, scrollContainers, kanban, consoleErrors: errs };
}

(async () => {
  const out = {};
  for (const w of [375, 768]) out["w" + w] = await probe(w);
  console.log(JSON.stringify(out, null, 2));
  const fail = [];
  [["375", out.w375], ["768", out.w768]].forEach(([lbl, r]) => {
    if (r.overflows.length) fail.push("w" + lbl + " overflow: " + r.overflows.map((o) => o.route + "(" + o.docSW + ">" + o.cw + ")").join(","));
    if (r.vis.sidebarDisplay !== "none") fail.push("w" + lbl + " sidebar not hidden");
    if (!r.vis.menuBtnVisible) fail.push("w" + lbl + " menuBtn hidden");
    if (!r.vis.titlePresent || !r.vis.contentPresent) fail.push("w" + lbl + " title/content missing");
    if (!r.drawerOpens) fail.push("w" + lbl + " drawer does not open");
    if (r.consoleErrors.length) fail.push("w" + lbl + " console errors: " + r.consoleErrors.length);
  });
  console.log("=== MOBILE CHECK ===");
  console.log("PASS: " + (fail.length === 0 ? "ALL" : "(partial)"));
  console.log("FAIL (" + fail.length + "): " + (fail.length ? fail.join(" | ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("MOBILE CHECK FAILED:", e); process.exit(1); });
