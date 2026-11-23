/* contrast_check.js — автоматическая проверка контраста WCAG AA на реальной отрисовке (Playwright):
   проходит по всем разделам в светлой и тёмной теме, для каждого видимого текста считает контраст с эффективным фоном
   (4.5:1, для крупного текста 3:1) и печатает пары цветов ниже порога. Код выхода 1, если нарушения есть. */
const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");
const APP = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;
const probe = () => {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { const chain = []; for (let n = el; n; n = n.parentElement) chain.push(n); let bg = { r: 255, g: 255, b: 255, a: 1 }; const base = parse(getComputedStyle(document.body).backgroundColor); if (base && base.a > 0) bg = over(base, { r: 255, g: 255, b: 255, a: 1 }); for (let i = chain.length - 1; i >= 0; i--) { const c = parse(getComputedStyle(chain[i]).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; };
  const res = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) {
    const t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement; if (!el || el.closest("script,style,svg,[aria-hidden='true']")) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const bg = bgOf(el); let fg = parse(cs.color); if (!fg) continue; fg = over({ ...fg, a: fg.a * (+cs.opacity || 1) }, bg);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5, cr = ratio(fg, bg);
    if (cr < need) { const key = (el.className && String(el.className).split(" ")[0] || el.tagName) + " | " + cs.color + " on " + `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`; (res[key] = res[key] || { n: 0, ratio: +cr.toFixed(2), need, sample: t.slice(0, 30) }).n++; }
  }
  return res;
};
(async () => {
  let total = 0;
  const b = await chromium.launch({ args: ["--no-sandbox"] }); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await require("./lib/offline_fonts").stubFonts(ctx); const p = await ctx.newPage();
  await p.goto(APP); await p.waitForSelector("#view .page-head");
  const routes = await p.evaluate(() => window.AIWS.NAV.map((n) => n.id));
  for (const theme of ["light", "dark"]) {
    await p.evaluate((t) => window.AIWS.applyTheme(t), theme); const agg = {};
    for (const r of routes) {
      await p.evaluate((x) => { window.AIWS.setState({ agentDetail: null }); window.AIWS.navigate(x); }, r); await p.waitForTimeout(220);
      const res = await p.evaluate(probe);
      for (const [k, v] of Object.entries(res)) { (agg[k] = agg[k] || { ...v, n: 0, routes: [] }); agg[k].n += v.n; if (!agg[k].routes.includes(r)) agg[k].routes.push(r); }
    }
    // модальные окна: тест в «Обучении» (вопрос), мастер агента, создание лида
    const overlays = [
      () => { window.AIWS.navigate("training"); return new Promise((r) => setTimeout(() => { window.AIWS.openQuiz("crs-1"); const n = document.getElementById("quizName"); n.value = "Тест"; document.getElementById("quizStart").click(); r(); }, 250)); },
      () => { window.AIWS.navigate("agents"); return new Promise((r) => setTimeout(() => { window.AIWS.openAgentWizard(); r(); }, 250)); },
      () => { window.AIWS.navigate("crm"); return new Promise((r) => setTimeout(() => { document.getElementById("newLeadBtn").click(); r(); }, 250)); }
    ];
    for (const open of overlays) {
      await p.evaluate(open); await p.waitForTimeout(250);
      const res = await p.evaluate(probe);
      for (const [k, v] of Object.entries(res)) { (agg[k] = agg[k] || { ...v, n: 0, routes: [] }); agg[k].n += v.n; if (!agg[k].routes.includes("modal")) agg[k].routes.push("modal"); }
      await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    }
    const list = Object.entries(agg).sort((a, b) => b[1].n - a[1].n); total += list.length;
    console.log("=== " + theme + ": пар цветов ниже AA: " + list.length);
    list.slice(0, 14).forEach(([k, v]) => console.log("  " + v.ratio + " (<" + v.need + ") x" + v.n + "  " + k + "  «" + v.sample + "»  [" + v.routes.slice(0, 4).join(",") + (v.routes.length > 4 ? "…" : "") + "]"));
  }
  await b.close();
  console.log(total === 0 ? "\nCONTRAST: нарушений AA нет" : "\nCONTRAST: нарушений: " + total);
  process.exit(total === 0 ? 0 : 1);
})().catch((e) => { console.error("ERR", String(e).slice(0, 400)); process.exit(1); });
