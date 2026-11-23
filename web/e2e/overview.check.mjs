/* overview.check.mjs — браузерные проверки раздела «Обзор» (этап 2): состояния loading/empty/error/success, KPI, график,
   онбординг (мышь, клавиатура, сохранение), журнал, повреждённое хранилище, overflow, контраст, консоль.
   Запуск: npm run build && node e2e/overview.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";

const { check, done } = reporter();
const KEY = "aiws-db-v2";

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady();
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/help", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = () => prepare(() => localStorage.clear());
    const open = async () => { await page.goto(BASE + "/overview", { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=journal]"); };
    const kpi = (label) => page.locator(`[data-kpi="${label}"]`);
    const text = (sel) => page.locator(sel).innerText();

    // ---------- loading: скелетоны и заглушки в шапке, затем данные
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1500"));
    await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны (aria-busy), KPI ещё нет", (await page.locator("[aria-busy=true]").count()) >= 2 && (await page.locator("[data-kpi]").count()) === 0);
    check("loading: в шапке «— / — агентов», а не выдуманные числа", /—\s*\/\s*—\s*агентов/.test(await text("header.sticky")));
    await page.waitForSelector("[data-kpi]", { timeout: 8000 }); await page.waitForSelector("[data-testid=journal] li");
    check("loading → success: скелетоны исчезли, KPI показаны", (await page.locator("[aria-busy=true]").count()) === 0 && (await page.locator("[data-kpi]").count()) === 4);

    // ---------- success: демо-данные
    await reset(); await open();
    const kpis = { "Лиды за период": "6", "Созданные счета": "4", "Сообщения от ИИ": "4", "Передано менеджеру": "2" };
    let ok = true; for (const [label, v] of Object.entries(kpis)) { const t = await kpi(label).innerText(); if (!new RegExp(`(^|\\s)${v}(\\s|$)`).test(t)) ok = false; }
    check("KPI на демо-данных: 6 / 4 / 4 / 2 (как в прототипе)", ok);
    check("KPI: у каждой карточки пометка «Демо»", (await page.locator("[data-kpi] >> text=Демо").count()) === 4);
    const handed = await kpi("Передано менеджеру").innerText();
    check("KPI «Передано менеджеру»: число + текст «Есть эскалация (КРИТИЧНО)» (не только цвет)", /2/.test(handed) && /Есть эскалация \(КРИТИЧНО\)/.test(handed) && (await kpi("Передано менеджеру").locator("svg.lucide-triangle-alert").count()) === 1);
    check("KPI «Лиды»: подсказка «В базе сейчас: 6»", /В базе сейчас: 6/.test(await kpi("Лиды за период").innerText()));
    check("шапка: «3 / 5 агентов» из данных и «Уведомления: 3» в aria-label", /3\s*\/\s*5\s*агентов/.test(await text("header.sticky")) && (await page.locator("header.sticky [aria-label^='Уведомления']").getAttribute("aria-label")) === "Уведомления: 3");

    // ---------- график
    await page.waitForSelector("[data-testid=activity-chart] .recharts-bar-rectangle");
    check("график: 7 дней × 2 серии = 14 столбцов, без анимации-ошибок", (await page.locator("[data-testid=activity-chart] .recharts-bar-rectangle").count()) === 14);
    check("график: таблица-дублёр для скринридеров (7 строк), легенда текстом «ИИ / Человек»", (await page.locator("[data-testid=activity] table tbody tr").count()) === 7 && /ИИ/.test(await text("[data-testid=activity]")) && /Человек/.test(await text("[data-testid=activity]")));
    const fills = await page.evaluate(() => [...document.querySelectorAll("[data-testid=activity-chart] .recharts-bar-rectangle path")].slice(0, 1).map((p) => getComputedStyle(p).fill));
    check("график: цвет столбцов ИИ — токен accent (rgb(184, 67, 26))", fills[0] === "rgb(184, 67, 26)", String(fills));

    // ---------- онбординг: мышь, клавиатура, сохранение
    const steps = page.locator("[data-testid=onboarding] [role=checkbox]");
    check("онбординг: 7 шагов, 57% (4 из 7)", (await steps.count()) === 7 && (await page.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "57" && /57%/.test(await text("[data-testid=onboarding]")));
    const decor = await steps.nth(0).locator("span.truncate").evaluate((e) => getComputedStyle(e).textDecorationLine);
    check("онбординг: выполненный шаг без зачёркивания, с галочкой", decor === "none" && (await steps.nth(0).locator("svg.lucide-check").count()) === 1);
    await steps.nth(4).click(); await page.waitForTimeout(500);
    check("онбординг: клик по шагу 5 отмечает его, прогресс 71%", (await steps.nth(4).getAttribute("aria-checked")) === "true" && (await page.locator("[role=progressbar]").getAttribute("aria-valuenow")) === "71");
    await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=onboarding] [role=checkbox]");
    check("онбординг: отметка сохраняется после перезагрузки", (await steps.nth(4).getAttribute("aria-checked")) === "true" && /71%/.test(await text("[data-testid=onboarding]")));
    await steps.nth(4).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(500);
    check("онбординг: Space на шаге с клавиатуры снимает отметку (57%)", (await steps.nth(4).getAttribute("aria-checked")) === "false" && /57%/.test(await text("[data-testid=onboarding]")));

    // ---------- журнал
    const rows = page.locator("[data-testid=journal] li");
    check("журнал: 8 событий, первое — 13:02, ИИ", (await rows.count()) === 8 && /13:02/.test(await rows.first().innerText()) && (await rows.first().getAttribute("data-actor")) === "ai");
    const colors = await page.evaluate(() => ({ ai: getComputedStyle(document.querySelector("[data-actor=ai] .font-medium")).color, human: getComputedStyle(document.querySelector("[data-actor=human] .font-medium")).color, fg: getComputedStyle(document.body).color }));
    check("журнал: ИИ подписан акцентом, менеджер — цветом текста", colors.ai === "rgb(184, 67, 26)" && colors.human === colors.fg, JSON.stringify(colors));
    check("журнал: время моно-шрифтом (tabular-nums)", await page.evaluate(() => /mono|geist|jetbrains/i.test(getComputedStyle(document.querySelector("[data-testid=journal] time")).fontFamily)));

    // ---------- empty
    await reset(); await prepare((k) => localStorage.setItem(k, JSON.stringify({ version: 1, LEADS: [], DOCUMENTS: [], CONVERSATIONS: [], ONBOARDING: [] })), KEY); await open();
    const empties = await Promise.all(["Лиды за период", "Созданные счета", "Сообщения от ИИ", "Передано менеджеру"].map((l) => kpi(l).innerText()));
    check("empty: все KPI показывают «—» и подсказку, что делать", empties.every((t) => t.includes("—")) && /Лиды появятся после подключения каналов/.test(empties[0]) && /Подключите канал/.test(empties[2]));
    check("empty: онбординг и журнал — понятные пустые состояния", /Шагов пока нет/.test(await text("[data-testid=onboarding]")) && /Событий пока нет/.test(await text("[data-testid=journal]")));
    check("empty: шапка не ломается (агенты и уведомления из своих коллекций)", /3\s*\/\s*5\s*агентов/.test(await text("header.sticky")));

    // ---------- error → повтор
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-fail", "1")); await open();
    await page.waitForSelector("main [role=alert]");
    const alerts = await page.locator("main [role=alert]").count();
    check("error: ошибка в каждой карточке (сводка, график, онбординг, журнал) с понятным текстом", alerts >= 4 && /Не удалось загрузить данные/.test(await text("main")) && /имитация сбоя/.test(await text("main")), String(alerts));
    check("error: в шапке «— / —», страница не пуста", /—\s*\/\s*—/.test(await text("header.sticky")) && (await page.locator("aside nav a").count()) === 16);
    await page.evaluate(() => localStorage.removeItem("aiws-mock-fail"));
    for (let i = 0; i < 6 && (await page.locator("main [role=alert] button").count()) > 0; i++) { await page.locator("main [role=alert] button").first().click(); await page.waitForTimeout(700); }
    check("error → «Повторить» восстанавливает все карточки", (await page.locator("main [role=alert]").count()) === 0 && (await page.locator("[data-kpi]").count()) === 4 && (await rows.count()) === 8);

    // ---------- повреждённое хранилище
    await reset(); await prepare((k) => { const s = { version: 1, LEADS: "oops", ONBOARDING: [{ id: "x\"><b id=\"pwn\">", name: "x", done: true }] }; localStorage.setItem(k, JSON.stringify(s)); }, KEY); await open();
    check("повреждённое хранилище: приложение стартует, лиды — демо, XSS-запись отброшена", (await kpi("Лиды за период").innerText()).includes("6") && (await page.locator("#pwn").count()) === 0 && (await steps.count()) === 7);

    // ---------- кнопка «Обновить»
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1200")); await open();
    await page.getByRole("button", { name: "Обновить" }).click();
    check("«Обновить»: во время обновления aria-busy=true, затем false", (await page.getByRole("button", { name: "Обновить" }).getAttribute("aria-busy")) === "true");
    await page.waitForTimeout(2200);
    check("«Обновить»: завершается", (await page.getByRole("button", { name: "Обновить" }).getAttribute("aria-busy")) === "false");

    // ---------- overflow и контраст (обе темы)
    await reset(); await open();
    let over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) { await page.setViewportSize({ width: w, height: 900 }); await open(); const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (o[0] > o[1]) over.push(`${theme} ${w}: ${o[0]}>${o[1]}`); }
    }
    await page.setViewportSize({ width: 375, height: 900 }); await page.emulateMedia({ colorScheme: "light" }); await open();
    const cut = await page.evaluate(() => [...document.querySelectorAll("[data-testid=journal-text]")].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    check("мобильный 375: текст событий журнала не обрезается (переносится на свою строку)", cut === 0, String(cut));
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах" + (over.length ? " [" + over.join("; ") + "]" : ""), over.length === 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    const bad = {};
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await open();
      for (const [k, v] of Object.entries(await page.evaluate(contrastProbe))) bad[theme + " " + k] = v;
    }
    check("контраст WCAG AA на «Обзоре» в обеих темах" + (Object.keys(bad).length ? "\n     " + Object.entries(bad).slice(0, 5).map(([k, v]) => `${v.ratio} ${k}`).join("\n     ") : ""), Object.keys(bad).length === 0);

    check("нет внешних запросов", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, Recharts, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("OVERVIEW");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
