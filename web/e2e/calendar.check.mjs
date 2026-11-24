/* calendar.check.mjs — браузерные проверки раздела «Календарь» (этап 3, группа 6): сетка месяца
   (Пн–Вс, dim-добивка, точки событий по типам, выделение «сегодня»), навигация
   prev/next/«Сегодня» с заголовком месяца, «Ближайшие события» с сортировкой и метками,
   экспорт .ics — скачивание перехватывается, файл проверяется СТРОГИМ валидатором RFC 5545
   (порт scripts/lib/ics_validate.js в lib/ics/validate.ts через unit, в e2e — CJS-модуль прототипа):
   CRLF, folding ≤75 октетов, DTSTAMP в UTC с «Z», корректные DTSTART/DTEND, уникальные UID,
   русские метки, названия совпадают с данными; битые события пропускаются; без корректных
   событий файл не скачивается; overflow 375…1920 × 2 темы, контраст AA, внешние запросы, консоль.
   Запуск: npm run build && node e2e/calendar.check.mjs */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { apiItems, apiReset, BASE, importSnapshot, launch, reporter, setFaults, startServer, waitReady, waitFor } from "./lib/harness.mjs";

const require = createRequire(import.meta.url);
const { validateICS } = require("../../scripts/lib/ics_validate.js");

const { check, done } = reporter();
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/calendar");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/calendar", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = async () => { await apiReset(); await prepare(() => localStorage.clear()); };
    const open = async (url = "/calendar") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=calendar-grid], main [role=alert]"); };
    const setEvents = (list) => importSnapshot({ version: 1, CALENDAR_EVENTS: list });
    const feedback = () => page.locator("[data-testid=calendar-feedback]").innerText().catch(() => "");
    const exportFile = async () => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.locator("[data-testid=calendar-export]").click()]);
      const tmp = path.join(os.tmpdir(), "aiws-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".ics");
      await dl.saveAs(tmp);
      const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
      return { name: dl.suggestedFilename(), text: buf.toString("utf8"), bytes: buf };
    };

    // ---------- loading: скелетоны, затем данные
    await reset(); await setFaults({ latencyMs: 1500 });
    await page.goto(BASE + "/calendar", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, сетки ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=calendar-grid]").count()) === 0);
    await page.waitForSelector("[data-testid=calendar-grid]", { timeout: 8000 });
    await waitFor(async () => (await page.locator("[aria-busy=true]").count()) === 0, { timeout: 10000 });
    check("loading → success: скелетоны исчезли, сетка и ближайшие события заполнены", (await page.locator("[aria-busy=true]").count()) === 0 && (await page.locator("[data-testid=calendar-event]").count()) === 5);
    await setFaults({ latencyMs: 0 });

    // ---------- шапка и сетка текущего месяца
    await reset(); await open();
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const today = now.getFullYear() + "-" + String(m + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    check("шапка: «Календарь», заголовок «" + MONTHS[m] + " " + y + "», навигация и «.ics»", (await page.locator("h1").innerText()) === "Календарь" && (await page.locator("[data-testid=calendar-title]").innerText()).includes(MONTHS[m]) && (await page.locator("[data-testid=calendar-export]").count()) === 1);
    check("сетка: дни недели Пн…Вс", (await page.locator("[data-testid=calendar-grid]").innerText()).includes("Пн") && (await page.locator("[data-testid=calendar-grid]").innerText()).includes("Вс"));
    check("сегодня выделен как ячейка с текущей датой", (await page.locator(`[data-testid=calendar-cell][data-date="${today}"]`).count()) === 1);
    check("16 ноября — две точки (звонок + срок), 17/18/19 — по одной", (await page.locator("[data-testid=calendar-cell][data-date='2026-11-16'] [data-testid=calendar-dots] > span").count()) === 2 && (await page.locator("[data-testid=calendar-cell][data-date='2026-11-17'] [data-testid=calendar-dots] > span").count()) === 1 && (await page.locator("[data-testid=calendar-cell][data-date='2026-11-18'] [data-testid=calendar-dots] > span").count()) === 1 && (await page.locator("[data-testid=calendar-cell][data-date='2026-11-19'] [data-testid=calendar-dots] > span").count()) === 1);

    // ---------- ближайшие события: сортировка и метки
    const upText = await page.locator("[data-testid=calendar-upcoming]").innerText();
    const ids = ["EV-1", "EV-2", "EV-3", "EV-4", "EV-5"];
    const order = [];
    for (const id of ids) order.push(await page.locator(`[data-testid=calendar-event][data-event=${id}]`).getAttribute("data-event"));
    check("ближайшие: все 5 сид-событий", order.every((x) => x !== null) && (await page.locator("[data-testid=calendar-event]").count()) === 5);
    check("EV-1: дата, время, «45 мин», AI-Продажи; EV-3: «30 мин», Бухгалтерия", (await page.locator("[data-testid=calendar-event][data-event=EV-1]").innerText()).includes("2026-11-16 · 10:00 · 45 мин · AI-Продажи") && (await page.locator("[data-testid=calendar-event][data-event=EV-3]").innerText()).includes("2026-11-17 · 11:30 · 30 мин · Бухгалтерия"));
    check("срок EV-2 без длительности: «2026-11-16 · 18:00 · Менеджер»", (await page.locator("[data-testid=calendar-event][data-event=EV-2]").innerText()).includes("2026-11-16 · 18:00 · Менеджер"));
    check("блок «Ближайшие события» с бейджем «Демо»", upText.length > 0 && /Демо/.test(await page.locator("main").innerText()));

    // ---------- навигация месяцев
    await page.locator("[data-testid=calendar-prev]").click();
    await page.waitForTimeout(120);
    check("prev: предыдущий месяц «Октябрь " + y + "»", (await page.locator("[data-testid=calendar-title]").innerText()).includes("Октябрь"));
    await page.locator("[data-testid=calendar-prev]").click();
    await page.waitForTimeout(120);
    check("prev ×2: «Сентябрь», событий в сетке нет", (await page.locator("[data-testid=calendar-title]").innerText()).includes("Сентябрь") && (await page.locator("[data-testid=calendar-cell] [data-testid=calendar-dots]").count()) === 0);
    await page.locator("[data-testid=calendar-today]").click();
    await page.waitForTimeout(120);
    check("«Сегодня»: возврат к " + MONTHS[m] + " " + y, (await page.locator("[data-testid=calendar-title]").innerText()).includes(MONTHS[m]));

    // ---------- экспорт .ics: строгий валидатор
    await reset(); await open();
    const fixtures = (await apiItems("calendar-events")).map((e) => ({ id: e.id, title: e.title }));
    const f1 = await exportFile();
    check("имя файла ai-workspace-calendar.ics", f1.name === "ai-workspace-calendar.ics", f1.name);
    check("кодировка UTF-8 без BOM", !(f1.bytes[0] === 0xEF && f1.bytes[1] === 0xBB));
    const errs1 = validateICS(f1.text, { expectedCount: fixtures.length, expectedTitles: fixtures.map((e) => e.title) });
    check("файл проходит строгую проверку RFC 5545 (CRLF, folding, DTSTAMP UTC, UID, русские метки)" + (errs1.length ? " [" + errs1.slice(0, 3).join("; ") + "]" : ""), errs1.length === 0);
    check("feedback: «Экспортировано событий: 5»", (await feedback()).includes("Экспортировано событий: 5") && !(await feedback()).includes("пропущено"));
    check("DTSTAMP совпадает у всех VEVENT и в UTC с «Z»", /DTSTAMP:\d{8}T\d{6}Z/.test(f1.text) && new Set(f1.text.match(/DTSTAMP:\S+/g)).size === 1);
    check("срок EV-2 без DTEND (точка во времени), EV-1 с DTEND 10:45", f1.text.includes("UID:EV-2@aiworkspace") && /UID:EV-1@aiworkspace[\s\S]*?DTEND:20261116T104500/.test(f1.text));

    // ---------- битые события пропускаются, файл остаётся валидным
    await setEvents((await apiItems("calendar-events")).concat([
      { id: "BAD-1", title: "Пустая дата", date: "", time: "10:00", duration: "30 мин", type: "call", assignee: "М" },
      { id: "BAD-2", title: "30 февраля", date: "2026-02-30", time: "10:00", type: "call" },
      { id: "OK-3", title: "Ч:ММ без нуля", date: "2026-11-22", time: "9:05", duration: "2 ч", type: "meeting", assignee: "Группа" }
    ]));
    await open(); // перезагружаем страницу, чтобы запросить обновлённые данные с сервера
    const f2 = await exportFile();
    const errs2 = validateICS(f2.text, { expectedCount: fixtures.length + 1 });
    check("битые события пропущены, файл валиден" + (errs2.length ? " [" + errs2.slice(0, 3).join("; ") + "]" : ""), errs2.length === 0);
    check("«9:05» + «2 ч» → DTSTART 09:05–DTEND 11:05 (folding развёрнут)", /DTSTART:20261122T090500\r\nDTEND:20261122T110500/.test(f2.text.replace(/\r\n /g, "")));
    check("feedback сообщает о пропущенных: «пропущено (некорректная дата или данные): 2»", (await feedback()).includes("пропущено (некорректная дата или данные): 2"));

    // ---------- без корректных событий файл не скачивается
    await setEvents([{ id: "EV-9", title: "Битая", date: "", time: "10:00" }]);
    await open();
    let noDownload = false;
    try {
      await Promise.all([page.waitForEvent("download", { timeout: 3000 }), page.locator("[data-testid=calendar-export]").click()]);
    } catch { noDownload = true; }
    check("нет корректных событий: файл не скачивается, есть сообщение", noDownload && (await feedback()).includes("Нет событий с корректной датой для экспорта"));

    // ---------- overflow и контраст
    await reset();
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        await open();
        const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o[0] > o[1]) over.push(`calendar ${theme} ${w}: ${o[0]}>${o[1]}`);
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах" + (over.length ? " [" + over.slice(0, 4).join("; ") + "]" : ""), over.length === 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    const bad = {};
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await open();
      for (const [k, v] of Object.entries(await page.evaluate(contrastProbe))) bad[theme + " " + k] = v;
    }
    check("контраст WCAG AA на разделе в обеих темах" + (Object.keys(bad).length ? "\n     " + Object.entries(bad).slice(0, 5).map(([k, v]) => `${v.ratio} ${k}`).join("\n     ") : ""), Object.keys(bad).length === 0);

    check("нет внешних запросов", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("Календарь");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
