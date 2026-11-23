/* pdf_check.js — автотест генерации PDF в браузере.
   Кликаем «PDF» в документах, ловим download (jsPDF+шрифт грузятся лениво),
   проверяем: %PDF-заголовок, встроенный шрифт Liberation, размер, .pdf, 0 ошибок.
   Копия сохраняется в /tmp/pdf-sample.pdf для визуальной проверки кириллицы. */
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
  await page.waitForFunction(() => window.AIWS && window.AIWS.pdf, null, { timeout: 8000 });

  const pass = [], fail = [];
  function check(name, cond) { (cond ? pass : fail).push(name); }

  check("AIWS.pdf.generate exposed", await page.evaluate(() => typeof window.AIWS.pdf.generate === "function"));

  await page.evaluate(() => window.AIWS.navigate("docs"));
  await page.waitForTimeout(200);
  const nPdf = await page.evaluate(() => document.querySelectorAll("[data-sendpdf]").length);
  check("docs has PDF buttons", nPdf > 0);

  // клик + ожидание download (ленивый подгруз jsPDF+шрифта ~几百ms)
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click("[data-sendpdf]")
  ]);
  const suggested = download.suggestedFilename();
  const dpath = await download.path();
  const buf = fs.readFileSync(dpath);
  const raw = buf.toString("latin1");

  check("download triggered", !!download);
  check("file starts with %PDF-", raw.slice(0, 5) === "%PDF-");
  check("filename ends with .pdf", /\.pdf$/i.test(suggested));
  check("PDF size > 5KB (шрифт встроен)", buf.length > 5000);
  check("embedded font referenced (LSans/Liberation)", /LSans|Liberation/i.test(raw));
  check("has /Pages", /\/Type\s*\/Pages/.test(raw));
  // шрифт встроен как поток (jsPDF: CIDFontType2 + FontFile2 — встроенный TrueType)
  check("font stream embedded (FontFile2)", /\/FontFile2/.test(raw));

  fs.copyFileSync(dpath, "/tmp/pdf-sample.pdf");

  // printDoc — печать через window.print (альтернатива без встроенного шрифта).
  // В headless print() — no-op, но iframe строится синхронно с кириллицей.
  const printDocId = await page.evaluate(() => {
    var b = document.querySelector("[data-printdoc]");
    return b ? b.getAttribute("data-printdoc") : null;
  });
  check("docs has Печать buttons", !!printDocId);
  if (printDocId) {
    await page.evaluate((id) => window.AIWS.pdf.printDoc(id), printDocId);
    await page.waitForTimeout(350);
    const pr = await page.evaluate(() => {
      var f = document.querySelector('iframe[aria-hidden="true"]');
      if (!f || !f.contentDocument || !f.contentDocument.body) return { iframe: false };
      var body = f.contentDocument.body.innerHTML;
      return { iframe: true, brand: body.indexOf("AI Workspace") >= 0, cyrillic: body.indexOf("Позиции") >= 0, table: body.indexOf("<table") >= 0, total: body.indexOf("Итого") >= 0 };
    });
    check("printDoc creates iframe", pr.iframe);
    check("print iframe has brand", pr.brand);
    check("print iframe has Cyrillic (Позиции/Итого)", pr.cyrillic && pr.total);
    check("print iframe has table", pr.table);
  }

  const errs = logs.filter((l) => l.startsWith("error") || l.startsWith("pageerror"));
  check("no console errors/pageerrors", errs.length === 0);

  await browser.close();
  console.log("=== PDF CHECK ===");
  console.log("file: " + suggested + " (" + buf.length + " bytes)");
  console.log("PASS (" + pass.length + "): " + pass.join("; "));
  console.log("FAIL (" + fail.length + "): " + (fail.length ? fail.join("; ") : "(none)"));
  if (errs.length) console.log("LOGS:", JSON.stringify(logs, null, 2));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("PDF CHECK FAILED:", e); process.exit(1); });
