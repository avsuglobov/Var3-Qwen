/* shell.check.mjs — браузерные проверки каркаса (Playwright): отсутствие overflow на 1280/1440/1920 в обеих темах,
   отсутствие hydration-ошибок и ошибок консоли, отсутствие мигания темы, токены и радиусы, шрифты с кириллицей,
   ⌘K, сворачиваемый сайдбар (кука), мобильный drawer, зерно/лампа только в тёмной, reduced-motion, фокус-кольцо, контраст AA.
   Запуск: npm run build && npm run e2e   (сервер `next start` поднимается скриптом; BASE_URL — чтобы использовать свой).
   Переменные: PORT, BASE_URL, CHROMIUM_PATH, CHROMIUM_ARGS, PLAYWRIGHT_MODULE. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { contrastProbe } from "./lib/contrast-probe.mjs";

const PORT = process.env.PORT || "3101";
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const mod = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const chromium = mod.chromium ?? mod.default?.chromium;

const ROUTES = ["overview", "agents", "dialogs", "crm", "leads", "docs", "calendar", "tasks", "storage", "team", "supply", "training", "analytics", "integrations", "settings", "help"];
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok }); console.log((ok ? "  ok   " : "  FAIL ") + name + (!ok && extra ? " — " + extra : "")); };

let server = null;
async function waitReady() {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE + "/overview"); if (r.ok) return; } catch { /* ждём */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("сервер не поднялся: " + BASE);
}

async function main() {
  // запуск напрямую через node (не npx), чтобы server.kill() действительно останавливал сервер, а не его обёртку
  if (!process.env.BASE_URL) server = spawn(process.execPath, [createRequire(import.meta.url).resolve("next/dist/bin/next"), "start", "-p", PORT], { stdio: "ignore", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  await waitReady();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS ? process.env.CHROMIUM_ARGS.split(" ") : ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const problems = [], hosts = new Set();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 160)); });
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 160)));
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });
  await page.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { window.__cls = document.documentElement.className; const a = document.querySelector("aside"); window.__asideW = a ? Math.round(a.getBoundingClientRect().width) : null; }); });

  const go = async (route) => { await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" }); };
  const setTheme = async (t) => { await page.emulateMedia({ colorScheme: t, reducedMotion: "no-preference" }); if (page.url().startsWith("http")) await page.evaluate(() => localStorage.removeItem("aiws-theme")); };

  await go("overview");   // localStorage доступен только после первой навигации
  // ---------- overflow на всех разделах, в обеих темах и трёх ширинах
  const overflow = [];
  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    for (const w of [1280, 1440, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const r of ROUTES) { await go(r); const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); if (o.sw > o.cw) overflow.push(`${theme} ${w} /${r}: ${o.sw}>${o.cw}`); }
    }
  }
  check("нет горизонтального overflow: 16 разделов × 2 темы × 1280/1440/1920" + (overflow.length ? " [" + overflow.slice(0, 4).join("; ") + "]" : ""), overflow.length === 0);

  // ---------- тема: без мигания, токены, радиусы
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme("dark"); await go("overview");
  check("тема: системная тёмная — класс dark выставлен ДО гидратации (нет мигания)", (await page.evaluate(() => window.__cls)).includes("dark"));
  await setTheme("light"); await go("overview");
  check("тема: системная светлая — без класса dark на DOMContentLoaded", !(await page.evaluate(() => window.__cls)).includes("dark"));
  const tok = async () => page.evaluate(() => { const s = getComputedStyle(document.documentElement); const b = document.querySelector("header button[aria-label^='Поиск']"); return { bg: s.getPropertyValue("--background").trim().toUpperCase(), primary: s.getPropertyValue("--primary").trim().toUpperCase(), bodyBg: getComputedStyle(document.body).backgroundColor, radius: getComputedStyle(b).borderRadius, h1: getComputedStyle(document.querySelector("h1")).fontFamily, body: getComputedStyle(document.body).fontFamily }; });
  const L = await tok();
  check("светлая: canvas #FAF7F2, accent #B8431A, радиус 8px, фон body rgb(250,247,242)", L.bg === "#FAF7F2" && L.primary === "#B8431A" && L.radius === "8px" && L.bodyBg === "rgb(250, 247, 242)");
  check("светлая: заголовки — Fraunces/Source Serif, интерфейс — Geist", /fraunces/i.test(L.h1) && /sourceSerifCyr/i.test(L.h1) && /geistLatin/i.test(L.body) && /geistCyr/i.test(L.body));
  await setTheme("dark"); await go("overview");
  const D = await tok();
  check("тёмная: canvas #0B0D0E, accent #C88A36, радиус 2px, фон body rgb(11,13,14)", D.bg === "#0B0D0E" && D.primary === "#C88A36" && D.radius === "2px" && D.bodyBg === "rgb(11, 13, 14)");
  check("тёмная: заголовки и интерфейс — Inter", /interLatin/i.test(D.h1) && /interCyr/i.test(D.h1) && /interCyr/i.test(D.body));

  // ---------- шрифты: реально загружены кириллические подмножества, внешних запросов нет
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.unicodeRange));   // браузер нормализует unicode-range: U+0-FF, U+400-45F
  check("шрифты: загружено кириллическое подмножество (U+400-45F)", faces.some((r) => /Cyr .*U\+400-45F/i.test(r)), faces.join(" | ").slice(0, 160));
  check("шрифты: загружено латинское подмножество", faces.some((r) => /Latin .*U\+0-FF/i.test(r)));
  check("нет внешних запросов (шрифты и ресурсы только с localhost)", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));

  // ---------- зерно, лампа, reduced motion
  const grain = async () => page.evaluate(() => getComputedStyle(document.querySelector(".grain")).display);
  await setTheme("dark"); await go("overview");
  check("зерно: в тёмной теме показано, aria-hidden", (await grain()) === "block" && (await page.evaluate(() => document.querySelector(".grain").getAttribute("aria-hidden"))) === "true");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  check("зерно: отключается при prefers-reduced-motion", (await grain()) === "none");
  await setTheme("light"); await go("overview");
  check("зерно: в светлой теме скрыто", (await grain()) === "none");

  // ---------- клавиатура: skip-link, фокус-кольцо
  await setTheme("light"); await go("overview");
  await page.keyboard.press("Tab");
  check("клавиатура: первый Tab — ссылка «Перейти к содержимому»", await page.evaluate(() => document.activeElement.classList.contains("skip-link")));
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, w: cs.outlineWidth, c: cs.outlineColor, fv: document.activeElement.matches(":focus-visible") }; });
  check("фокус-кольцо: solid 2px акцентом (светлая)", ring.fv && ring.style === "solid" && ring.w === "2px" && ring.c === "rgb(184, 67, 26)", JSON.stringify(ring));

  // ---------- раскладка верхней панели и логотипа
  await setTheme("dark"); await go("overview");
  const lay = await page.evaluate(() => { const s = document.querySelector("header button[aria-label^='Поиск']").getBoundingClientRect(); const t = [...document.querySelectorAll("aside .section-label")][0]; return { searchW: Math.round(s.width), tagFits: t.scrollWidth <= t.clientWidth + 1, tagH: Math.round(t.getBoundingClientRect().height), brandH: Math.round(document.querySelector("aside > div").getBoundingClientRect().height) }; });
  check("верхняя панель: поле поиска не сжато (≥ 400px на 1440)", lay.searchW >= 400, String(lay.searchW));
  check("логотип: подпись не обрезана и помещается в шапку сайдбара (тёмная)", lay.tagFits && lay.tagH <= 30 && lay.brandH === 56, JSON.stringify(lay));
  await setTheme("light"); await go("overview");

  // ---------- навигация и aria-current
  const cur = await page.evaluate(() => [...document.querySelectorAll("nav a[aria-current='page']")].map((a) => a.getAttribute("href")));
  check("навигация: единственный aria-current=page на текущем разделе", JSON.stringify(cur) === '["/overview"]', JSON.stringify(cur));

  // ---------- ⌘K
  await go("overview");
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[role=dialog]");
  check("⌘K: Ctrl+K открывает палитру, фокус в поле поиска", await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("cmdk-input") !== null));
  await page.keyboard.type("кал"); await page.waitForTimeout(150);
  const found = await page.evaluate(() => [...document.querySelectorAll("[cmdk-item]")].map((e) => e.textContent.trim()));
  check("⌘K: поиск по подстроке — «кал» находит только «Календарь» (без нечётких совпадений)", found.length === 1 && found[0] === "Календарь", JSON.stringify(found));
  check("⌘K: заголовки групп оформлены как метки секций", await page.evaluate(() => { const h = document.querySelector("[cmdk-group-heading]"); return !h || getComputedStyle(h).fontSize === "12px" || getComputedStyle(h).textTransform === "uppercase"; }));
  // fill() заменяет текст независимо от ОС: на macOS Control+A в поле ввода — «в начало строки», а не «выделить всё»
  await page.locator("[cmdk-input]").fill("Интеграц");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/integrations");
  check("⌘K: поиск + Enter переходит в раздел, палитра закрыта", page.url().endsWith("/integrations") && (await page.locator("[role=dialog]").count()) === 0);
  await page.keyboard.press("Meta+k"); await page.waitForSelector("[role=dialog]");
  check("⌘K: Cmd/Meta+K (macOS) тоже открывает палитру", true);
  await page.keyboard.press("Escape"); await page.waitForSelector("[role=dialog]", { state: "detached" });
  await page.keyboard.press("Control+k"); await page.waitForSelector("[role=dialog]"); await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  check("⌘K: Esc закрывает палитру", true);
  await page.keyboard.press("Control+k"); await page.waitForSelector("[role=dialog]"); await page.keyboard.type("Переключить тему"); await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("⌘K: «Переключить тему» меняет тему один раз", await page.evaluate(() => document.documentElement.classList.contains("dark")));

  // ---------- переключатель темы
  await setTheme("light"); await go("overview");
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await page.getByRole("menuitemradio", { name: "Тёмная" }).click();
  check("переключатель: «Тёмная» ставит класс dark", await page.evaluate(() => document.documentElement.classList.contains("dark")));
  await page.reload({ waitUntil: "networkidle" });
  check("переключатель: выбор сохраняется, после перезагрузки тёмная без мигания", (await page.evaluate(() => window.__cls)).includes("dark"));
  await page.getByRole("button", { name: "Переключить тему" }).click();
  await page.getByRole("menuitemradio", { name: "Системная" }).click();

  // ---------- сворачиваемый сайдбар (кука, без «прыжка»)
  await setTheme("light"); await ctx.clearCookies(); await go("overview");
  // ширину читаем, когда анимация закончилась (две одинаковые подряд), а не по фиксированной паузе
  const settledWidth = async () => { let prev = -1; for (let i = 0; i < 40; i++) { const w = await page.evaluate(() => Math.round(document.querySelector("aside").getBoundingClientRect().width)); if (w === prev) return w; prev = w; await page.waitForTimeout(120); } return prev; };
  const wOpen = await settledWidth();
  await page.getByRole("button", { name: "Свернуть меню" }).click();
  const wClosed = await settledWidth();
  check("сайдбар: 248px → 64px при сворачивании", wOpen === 248 && wClosed === 64, `${wOpen}→${wClosed}`);
  await page.reload({ waitUntil: "networkidle" });
  check("сайдбар: свёрнутость из куки, на DOMContentLoaded уже 64px (нет прыжка)", (await page.evaluate(() => window.__asideW)) === 64);
  await page.getByRole("button", { name: "Развернуть меню" }).click(); await settledWidth();

  // ---------- мобильный drawer
  await page.setViewportSize({ width: 375, height: 800 }); await go("overview");
  check("мобильный: сайдбар скрыт, есть кнопка меню", (await page.evaluate(() => getComputedStyle(document.querySelector("aside")).display)) === "none" && (await page.getByRole("button", { name: "Открыть меню" }).isVisible()));
  await page.getByRole("button", { name: "Открыть меню" }).click(); await page.waitForSelector("[role=dialog] nav");
  await page.getByRole("link", { name: "Интеграции" }).click(); await page.waitForURL("**/integrations");
  check("мобильный: пункт меню ведёт в раздел и закрывает drawer", (await page.locator("[role=dialog]").count()) === 0);
  await page.getByRole("button", { name: "Открыть меню" }).click(); await page.waitForSelector("[role=dialog]"); await page.keyboard.press("Escape");
  check("мобильный: Esc закрывает drawer; overflow нет", (await page.locator("[role=dialog]").count()) === 0 && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
  await page.setViewportSize({ width: 768, height: 900 }); await go("crm");
  check("планшет 768: нет overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  // ---------- контраст AA на всех разделах, в обеих темах, плюс палитра и drawer
  await page.setViewportSize({ width: 1440, height: 900 });
  const bad = {};
  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    for (const r of ROUTES) { await go(r); Object.assign(bad, Object.fromEntries(Object.entries(await page.evaluate(contrastProbe)).map(([k, v]) => [theme + " /" + r + " " + k, v]))); }
    await go("overview"); await page.keyboard.press("Control+k"); await page.waitForSelector("[role=dialog]");
    Object.assign(bad, Object.fromEntries(Object.entries(await page.evaluate(contrastProbe)).map(([k, v]) => [theme + " palette " + k, v]))); await page.keyboard.press("Escape");
  }
  check("контраст WCAG AA: нарушений нет во всех разделах и оверлеях" + (Object.keys(bad).length ? "\n     " + Object.entries(bad).slice(0, 5).map(([k, v]) => `${v.ratio} ${k}`).join("\n     ") : ""), Object.keys(bad).length === 0);

  check("консоль: нет ошибок и предупреждений (в т.ч. hydration)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
  await browser.close();
}

let code = 1;
try { await main(); code = results.every((r) => r.ok) ? 0 : 1; } catch (e) { console.error("e2e: сбой", e); }
if (server) server.kill();
console.log(code === 0 ? `\nE2E: все проверки пройдены (${results.length})` : "\nE2E: есть провалы");
process.exit(code);
