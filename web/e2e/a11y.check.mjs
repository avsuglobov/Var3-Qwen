/* a11y.check.mjs — финальный a11y-аудит (этап 5): axe-core (WCAG 2.0/2.1 A+AA) на всех разделах в обеих темах,
   оверлеи (⌘K-палитра, меню темы, мобильный drawer), поведенческие проверки prefers-reduced-motion
   (переходы и анимации реально погашены, зерно скрыто).
   Запуск: npm run e2e:a11y  (после npm run build; BASE_URL — чтобы использовать свой сервер). */
import { createRequire } from "node:module";
import { apiReset, BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");

const ROUTES = ["overview", "agents", "agents/ag-rop", "dialogs", "crm?lead=LD-1042", "crm", "leads", "docs", "calendar", "tasks", "storage", "team", "supply", "training", "analytics", "integrations", "settings", "help"];
const AXE_TAGS = { runOnly: { type: "tag", values: ["wcag2a", "wcag21a", "wcag2aa", "wcag21aa"] } };

const { check, done } = reporter();
let server = null;

async function main() {
  if (!process.env.BASE_URL) server = startServer();
  try {
    await waitReady();
    await apiReset();
    const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const go = async (route) => { await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" }); await page.waitForTimeout(250); };
  const setTheme = async (t) => { await page.emulateMedia({ colorScheme: t }); };
  // у приложения тема хранится в куке-предпочтении (next-themes) — задаём класс напрямую для скана
  const forceTheme = (t) => page.evaluate((tt) => { localStorage.setItem("aiws-theme", tt); document.documentElement.classList.toggle("dark", tt === "dark"); }, t);
  const axeScan = async () => {
    await page.addScriptTag({ path: AXE });
    return page.evaluate(async (tags) => {
      const r = await window.axe.run(document, tags);
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((x) => x.target.join(" ") + " — " + x.failureSummary.split("\n")[0]) }));
    }, AXE_TAGS);
  };

  // ---------- axe: все разделы × обе темы
  const bad = {};
  for (const theme of ["light", "dark"]) {
    await setTheme(theme); await go("overview"); await forceTheme(theme); await go("overview");
    for (const r of ROUTES) {
      await go(r);
      const v = await axeScan();
      for (const x of v) bad[`${theme} /${r} ${x.id}×${x.n}`] = `${x.impact || "-"}: ${x.sample.join(" | ")}`;
    }
  }
  check("axe WCAG 2.1 A/AA: нарушений нет — 18 маршрутов × 2 темы" + (Object.keys(bad).length ? "\n     " + Object.entries(bad).slice(0, 6).map(([k, v]) => `${k} → ${v}`).join("\n     ") : ""), Object.keys(bad).length === 0);

  // ---------- axe: оверлеи (палитра ⌘K в тёмной, меню темы и мобильный drawer в светлой)
  const ovBad = {};
  await setTheme("dark"); await go("overview");
  await page.keyboard.press("Control+k"); await page.waitForSelector("[role=dialog]");
  for (const x of await axeScan()) ovBad[`палитра ${x.id}×${x.n}`] = `${x.impact || "-"}: ${x.sample.join(" | ")}`;
  await page.keyboard.press("Escape");
  await setTheme("light"); await go("overview");
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await page.waitForSelector("[role=menu]");
  check("inert-фон: при открытом меню корень приложения inert (дублируем aria-hidden Radix)", await page.evaluate(() => document.querySelector(".min-h-dvh").inert === true));
  for (const x of await axeScan()) ovBad[`меню темы ${x.id}×${x.n}`] = `${x.impact || "-"}: ${x.sample.join(" | ")}`;
  await page.keyboard.press("Escape");
  check("inert-фон: после закрытия меню корень снова интерактивен", await page.evaluate(() => document.querySelector(".min-h-dvh").inert === false));
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.waitForSelector("[role=dialog] nav");
  for (const x of await axeScan()) ovBad[`drawer ${x.id}×${x.n}`] = `${x.impact || "-"}: ${x.sample.join(" | ")}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  check("axe WCAG 2.1 A/AA: оверлеи без нарушений (⌘K, меню темы, мобильный drawer)" + (Object.keys(ovBad).length ? "\n     " + Object.entries(ovBad).slice(0, 6).map(([k, v]) => `${k} → ${v}`).join("\n     ") : ""), Object.keys(ovBad).length === 0);

  // ---------- prefers-reduced-motion: поведение, а не только CSS
  await setTheme("dark"); await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" }); await go("overview");
  const motion = await page.evaluate(() => {
    const toMs = (v) => String(v).trim().endsWith("ms") ? parseFloat(v) || 0 : (parseFloat(v) || 0) * 1000; // 0.15s → 150
    const loud = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.animationName !== "none" && toMs(cs.animationDuration) > 1) loud.push("anim " + (el.className && String(el.className).split(" ")[0] || el.tagName));
      if (cs.transitionProperty !== "none" && cs.transitionDuration.split(",").some((d) => toMs(d) > 1)) loud.push("trans " + (el.className && String(el.className).split(" ")[0] || el.tagName));
    }
    return {
      grain: getComputedStyle(document.querySelector(".grain")).display,
      aside: getComputedStyle(document.querySelector("aside")).transitionDuration,
      loud: [...new Set(loud)].slice(0, 6),
    };
  });
  check("reduced-motion: зерно скрыто в тёмной теме", motion.grain === "none", motion.grain);
  check("reduced-motion: переходы сайдбара погашены", motion.aside.split(",").every((d) => (String(d).trim().endsWith("ms") ? parseFloat(d) || 0 : (parseFloat(d) || 0) * 1000) <= 1), motion.aside);
  check("reduced-motion: ни одного живого animation/transition > 1ms на /overview" + (motion.loud.length ? " [" + motion.loud.join("; ") + "]" : ""), motion.loud.length === 0);

  // контроль осмысленности: в обычном режиме у сайдбара переход жив (его и глушим)
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" }); await go("overview");
  const normalAside = await page.evaluate(() => getComputedStyle(document.querySelector("aside")).transitionDuration);
  const toMs = (v) => String(v).trim().endsWith("ms") ? parseFloat(v) || 0 : (parseFloat(v) || 0) * 1000;
  check("контроль: без reduce у сайдбара есть живой переход (есть что глушить)", normalAside.split(",").some((d) => toMs(d) > 1), normalAside);

    await browser.close();
    server?.kill(); // process.exit ниже не даст выполниться finally — гасим сервер явно
    process.exit(done("a11y.check"));
  } finally {
    // сервер гасим всегда: осиротевший next start с пережитой пересборкой отдаёт битые чанки
    server?.kill();
  }
}

main().catch((e) => { console.error("a11y.check: ошибка запуска —", e.message); try { server?.kill(); } catch { /* выход */ } process.exit(1); });
