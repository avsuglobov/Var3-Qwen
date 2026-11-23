/* io_check.js — автотест экспорта/импорта JSON датаслоя db.js.
   Экспорт ловится через событие download, импорт подаётся через filechooser
   (как реальный файл), проверяется roundtrip, выживание после reload и отказ
   при неверной версии. */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const URL = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await require("./lib/offline_fonts").stubFonts(ctx);
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e));

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && window.AIWS.db, null, { timeout: 8000 });

  const pass = [], fail = [];
  function check(name, cond) { (cond ? pass : fail).push(name); }

  // 1. EXPORT — ловим скачивание и читаем файл
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => AIWS.db.exportJSON())
  ]);
  const dlPath = await download.path();
  const exported = fs.readFileSync(dlPath, "utf8");
  let exportedObj;
  try { exportedObj = JSON.parse(exported); } catch (e) { exportedObj = null; }
  check("export валидный JSON", !!exportedObj);
  check("export version=1", exportedObj && exportedObj.version === 1);
  check("export содержит 4 коллекции", exportedObj && ["LEADS","CONVERSATIONS","DOCUMENTS","ONBOARDING"].every((k) => Array.isArray(exportedObj[k])));
  check("export совпадает с D (длина LEADS)", exportedObj && exportedObj.LEADS.length === await page.evaluate(() => AIWS.data.LEADS.length));

  // 2. Строим модифицированный JSON: добавляем лид "ИМПОРТ-ЛИД"
  const cur = await page.evaluate(() => ({
    LEADS: AIWS.data.LEADS,
    CONVERSATIONS: AIWS.data.CONVERSATIONS,
    DOCUMENTS: AIWS.data.DOCUMENTS,
    ONBOARDING: AIWS.data.ONBOARDING
  }));
  const modified = {
    version: 1,
    LEADS: cur.LEADS.concat([{ id: "LD-IMP", name: "ИМПОРТ-ЛИД", channel: "telegram", stageId: "new", funnelId: "fn-sales", agentId: "ag-sales", value: null, lastActivity: "00:00", note: "через импорт", events: [] }]),
    CONVERSATIONS: cur.CONVERSATIONS,
    DOCUMENTS: cur.DOCUMENTS,
    ONBOARDING: cur.ONBOARDING
  };
  const modifiedJson = JSON.stringify(modified);
  const leadsBefore = cur.LEADS.length;

  // 3. IMPORT — открываем Настройки → Данные, клик #impData, filechooser
  await page.evaluate(() => { AIWS.navigate("settings"); AIWS.setState({ settingsTab: "data" }); });
  await page.waitForTimeout(200);
  const impBtnVisible = await page.evaluate(() => !!document.querySelector("#impData"));
  check("кнопка Импорт присутствует", impBtnVisible);
  const [fc] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("#impData")
  ]);
  await fc.setFiles({ name: "data.json", mimeType: "application/json", buffer: Buffer.from(modifiedJson, "utf8") });
  await page.waitForTimeout(300);

  const afterImport = await page.evaluate(() => ({
    count: AIWS.data.LEADS.length,
    hasImport: AIWS.data.LEADS.some((l) => l.name === "ИМПОРТ-ЛИД"),
    persisted: (localStorage.getItem("aiws-db-v2") || "").indexOf("ИМПОРТ-ЛИД") >= 0
  }));
  check("импорт добавил лид (count +1)", afterImport.count === leadsBefore + 1);
  check("импорт: ИМПОРТ-ЛИД в D.LEADS", afterImport.hasImport);
  check("импорт записан в localStorage", afterImport.persisted);

  // 4. Выживание после reload
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && window.AIWS.db, null, { timeout: 8000 });
  const survived = await page.evaluate(() => AIWS.data.LEADS.some((l) => l.name === "ИМПОРТ-ЛИД"));
  check("импорт переживает reload", survived);

  // 5. Отказ при неверной версии — count не должен измениться
  const countBefore = await page.evaluate(() => AIWS.data.LEADS.length);
  await page.evaluate(() => { AIWS.navigate("settings"); AIWS.setState({ settingsTab: "data" }); });
  await page.waitForTimeout(150);
  const bad = JSON.stringify({ version: 999, LEADS: [], DOCUMENTS: [], CONVERSATIONS: [], ONBOARDING: [] });
  const [fc2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("#impData")
  ]);
  await fc2.setFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(bad, "utf8") });
  await page.waitForTimeout(300);
  const countAfter = await page.evaluate(() => AIWS.data.LEADS.length);
  check("отказ при неверной версии (count не изменился)", countAfter === countBefore);

  // 6. Reset к демо — count возвращается к исходному
  await page.evaluate(() => AIWS.db.resetAll());
  const resetCount = await page.evaluate(() => AIWS.data.LEADS.length);
  check("reset возвращает исходный размер LEADS", resetCount === leadsBefore);

  const errs = logs.filter((l) => l.startsWith("error") || l.startsWith("pageerror"));
  check("нет ошибок консоли", errs.length === 0);

  await browser.close();
  console.log("=== IO CHECK ===");
  console.log("PASS (" + pass.length + "): " + pass.join("; "));
  console.log("FAIL (" + fail.length + "): " + (fail.length ? fail.join("; ") : "(none)"));
  if (errs.length) console.log("LOGS:", JSON.stringify(logs, null, 2));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("IO CHECK FAILED:", e); process.exit(1); });
