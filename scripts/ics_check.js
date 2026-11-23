/* ics_check.js — браузерный (Playwright) автотест экспорта календаря в .ics.
   Кликаем «.ics», ловим download и проверяем файл общим строгим валидатором (lib/ics_validate.js):
   CRLF, folding ≤75 октетов, DTSTAMP в UTC с «Z», корректные DTSTART/DTEND, уникальные UID, отсутствие NaN,
   русские метки, совпадение названий с данными. Затем добавляем битые события и проверяем, что они пропущены.
   Быстрый вариант без браузера: node scripts/regress_ics.js */
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { validateICS } = require("./lib/ics_validate");
const APP_URL = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;   // не затеняем глобальный URL

const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log((ok ? "  ok   " : "  FAIL ") + name + (!ok && extra ? " — " + extra : "")); };
const isFontNoise = (msg) => /fonts\.(googleapis|gstatic)\.com/.test(msg.location().url || "") || /fonts\.(googleapis|gstatic)/.test(msg.text());

async function exportFile(page) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click("#calExport")]);
  const tmp = path.join(os.tmpdir(), "aiws-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".ics");
  await dl.saveAs(tmp);
  const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp);
  return { name: dl.suggestedFilename(), text: buf.toString("utf8"), bytes: buf };
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  let exitCode = 1;
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    await require("./lib/offline_fonts").stubFonts(ctx);
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error" && !isFontNoise(m)) consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.goto(APP_URL);
    await page.waitForSelector("#view .page-head");
    await page.evaluate(() => window.AIWS.navigate("calendar"));
    await page.waitForSelector("#calExport");

    const fixtures = await page.evaluate(() => window.AIWS.data.CALENDAR_EVENTS.map((e) => ({ id: e.id, title: e.title })));
    const f1 = await exportFile(page);
    check("имя файла ai-workspace-calendar.ics", f1.name === "ai-workspace-calendar.ics", f1.name);
    check("кодировка UTF-8 без BOM", !(f1.bytes[0] === 0xEF && f1.bytes[1] === 0xBB));
    const e1 = validateICS(f1.text, { expectedCount: fixtures.length, expectedTitles: fixtures.map((e) => e.title) });
    check("файл проходит строгую проверку RFC 5545", e1.length === 0, e1.join("; "));

    // битые события не должны попасть в файл и не должны ломать экспорт
    await page.evaluate(() => {
      const L = window.AIWS.data.CALENDAR_EVENTS;
      L.push({ id: "BAD-1", title: "Пустая дата", date: "", time: "10:00", duration: "30 мин", type: "call", assignee: "М" });
      L.push({ id: "BAD-2", title: "30 февраля", date: "2026-02-30", time: "10:00", type: "call" });
      L.push({ id: "OK-3", title: "Ч:ММ без нуля", date: "2026-11-22", time: "9:05", duration: "2 ч", type: "meeting", assignee: "Группа" });
    });
    const f2 = await exportFile(page);
    const e2 = validateICS(f2.text, { expectedCount: fixtures.length + 1 });
    check("битые события пропущены, файл валиден", e2.length === 0, e2.join("; "));
    check("'9:05' + '2 ч' → 09:05–11:05", /DTSTART:20261122T090500\r\nDTEND:20261122T110500/.test(f2.text.replace(/\r\n /g, "")));
    check("тост сообщает о пропущенных", /пропущено/.test(await page.locator("body").innerText()));
    check("нет ошибок в консоли страницы", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
    exitCode = results.every((r) => r.ok) ? 0 : 1;
  } catch (e) {
    console.error("ics_check: сбой", e);
  } finally {
    await browser.close();
  }
  console.log(exitCode === 0 ? "\nICS: все проверки пройдены (" + results.length + ")" : "\nICS: есть провалы");
  process.exit(exitCode);
})();
