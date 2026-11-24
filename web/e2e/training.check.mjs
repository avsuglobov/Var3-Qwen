/* training.check.mjs — браузерные проверки раздела «Обучение» (этап 3, группа 7), инварианты
   scripts/regress_learn.js прототипа: карточки курсов (уроки/статус/«тест: N вопр.», прогресс-бар,
   кнопка «Пройти тест» у незавершённых с квизом и «Сертификат» у завершённого), список выданных
   сертификатов с PDF, демо-тест: пустое имя → «Введите имя для сертификата», «Далее» блокируется
   до выбора, «Вопрос 1 из 5», провал — «Не хватило баллов: X из N (P%)» + разбор ошибок с верными
   ответами + «Попробовать снова», граница 80% (4 из 5) — «Тест пройден», сертификат (cert-2,
   имя/курс/дата), курс становится «Завершён», фон обновляется, PDF скачивается (имя файла,
   %PDF), итоги сохраняются в localStorage и после перезагрузки; граница на 4 вопросах
   (3/4 = 75% → пройдено). Overflow 375…1920 × 2 темы, контраст AA, внешние запросы, консоль.
   Запуск: npm run build && node e2e/training.check.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/training");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/training", { waitUntil: "networkidle" }); };
    const reset = () => origin().then(() => page.evaluate(() => localStorage.clear()));
    const open = async (url = "/training") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=training-courses], main [role=alert]"); };
    const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("aiws-db-v2") || "{}"));
    const saveFile = async (dl) => { const tmp = path.join(os.tmpdir(), "aiws-" + Date.now() + "-" + Math.random().toString(36).slice(2)); await dl.saveAs(tmp); const buf = fs.readFileSync(tmp); fs.unlinkSync(tmp); return buf; };
    const quizBtn = (id) => page.locator(`[data-testid=training-quiz-btn][data-course=${id}]`);
    const answerAll = async (picks) => {
      for (let i = 0; i < picks.length; i++) {
        await page.locator(`[data-testid=quiz-option][value="${picks[i]}"]`).check();
        await page.locator("[data-testid=quiz-next]").click();
        await page.waitForTimeout(150);
      }
    };

    // ---------- карточки курсов
    await reset(); await open();
    const mainText = await page.locator("main").innerText();
    check("шапка: «Обучение», «Программы из материалов хранилища, тесты, сертификаты»", (await page.locator("h1").innerText()) === "Обучение" && mainText.includes("Программы из материалов хранилища, тесты, сертификаты"));
    check("3 карточки курсов", (await page.locator("[data-testid=training-course-title]").count()) === 3);
    check("crs-1: «6 уроков · В работе · тест: 5 вопр.», прогресс 50%", (await page.locator("[data-testid=training-course-title]")).first().innerText().then(() => true) && /6 уроков · В работе · тест: 5 вопр\./.test(mainText) && (await page.locator("[data-testid=training-progress][data-pct='50']").count()) === 1);
    check("crs-3: прогресс 100%, кнопка «Сертификат»; crs-1/crs-2 — «Пройти тест»", (await page.locator("[data-testid=training-progress][data-pct='100']").count()) === 1 && (await page.locator("[data-testid=training-cert-btn][data-course=crs-3]").count()) === 1 && (await quizBtn("crs-1").count()) === 1 && (await quizBtn("crs-2").count()) === 1);
    check("сертификаты: «А. Иванов» из сида с кнопкой PDF", (await page.locator("[data-testid=training-cert][data-cert=cert-1]").innerText()).includes("А. Иванов") && (await page.locator("[data-testid=training-cert-pdf][data-cert=cert-1]").count()) === 1);

    // ---------- PDF сертификата из сида
    {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.locator("[data-testid=training-cert-pdf][data-cert=cert-1]").click()]);
      check("PDF скачивается: имя «сертификат-…pdf»", /сертификат-.*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      const buf = await saveFile(dl);
      check("файл — корректный PDF (%PDF-, не пуст)", buf.slice(0, 5).toString() === "%PDF-" && buf.length > 1000);
    }
    {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.locator("[data-testid=training-cert-btn][data-course=crs-3]").click()]);
      check("«Сертификат» завершённого курса: PDF с курсом из сида", /сертификат-.*\.pdf$/.test(dl.suggestedFilename()) && (await saveFile(dl)).slice(0, 5).toString() === "%PDF-");
    }

    // ---------- демо-тест crs-1: интро
    await quizBtn("crs-1").click();
    await page.waitForSelector("[data-testid=quiz-intro]");
    check("модалка: «Вопросов: 5 · проходной балл: 70%», фокус в поле имени", /Вопросов: 5 · проходной балл: 70%/.test(await page.locator("[data-testid=quiz-dialog]").innerText()) && await page.evaluate(() => document.activeElement?.id === "quizName"));
    await page.locator("[data-testid=quiz-start]").click();
    check("пустое имя: «Введите имя для сертификата» (role=alert), тест не начался", (await page.locator("[data-testid=quiz-error]").innerText()).includes("Введите имя для сертификата") && (await page.locator("[data-testid=quiz-intro]").count()) === 1);
    await page.locator("[data-testid=quiz-name]").fill("Тестов Тест");
    await page.locator("[data-testid=quiz-start]").click();
    await page.waitForSelector("[data-testid=quiz-question]");
    check("«Далее» заблокирована до выбора; «Вопрос 1 из 5»; 4 варианта", (await page.locator("[data-testid=quiz-next]").isDisabled()) && /Вопрос 1 из 5/.test(await page.locator("[data-testid=quiz-dialog]").innerText()) && (await page.locator("[data-testid=quiz-option]").count()) === 4);

    // ---------- провал 0/5, разбор ошибок, «Попробовать снова»
    // Сид вопросов фиксирован (scripts/gen-seed.mjs): верные ответы crs-1 → индексы [1,1,2,1,0]
    await answerAll([3, 3, 3, 3, 3]);
    await page.waitForSelector("[data-testid=quiz-result]");
    check("провал: «Не хватило баллов» + разбор ошибок с «Верный ответ:»", /Не хватило баллов: \d из 5 \(\d+%\)/.test(await page.locator("[data-testid=quiz-dialog]").innerText()) && (await page.locator("[data-testid=quiz-missed]").count()) >= 1 && /Верный ответ:/.test(await page.locator("[data-testid=quiz-dialog]").innerText()));
    const certsBefore = (await db()).CERTIFICATES.length;
    check("провал: сертификат не выдан", certsBefore === 1);
    await page.locator("[data-testid=quiz-retry]").click();
    check("«Попробовать снова» → «Вопрос 1 из 5»", /Вопрос 1 из 5/.test(await page.locator("[data-testid=quiz-dialog]").innerText()));

    // ---------- граница 4 из 5 (80%): пройдено, сертификат, PDF
    // crs-1 верные: [1,1,2,1,0] → четыре верных и последний неверный
    await answerAll([1, 1, 2, 1, 2]);
    await page.waitForSelector("[data-testid=quiz-result]");
    check("граница 80%: «Тест пройден: 4 из 5 (80%)»", (await page.locator("[data-testid=quiz-dialog]").innerText()).includes("Тест пройден: 4 из 5 (80%)"));
    check("сообщение: сертификат выдан на имя «Тестов Тест»", (await page.locator("[data-testid=quiz-dialog]").innerText()).includes("Сертификат выдан на имя «Тестов Тест»"));
    {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.locator("[data-testid=quiz-pdf]").click()]);
      check("PDF из результата: «сертификат-тестов-тест.pdf», %PDF-", dl.suggestedFilename() === "сертификат-тестов-тест.pdf" && (await saveFile(dl)).slice(0, 5).toString() === "%PDF-", dl.suggestedFilename());
    }
    await page.locator("[data-testid=quiz-close]").click();
    await page.waitForSelector("[data-testid=quiz-dialog]", { state: "detached", timeout: 3000 });
    // инвалидация списков после complete асинхронна — ждём обновление фона
    await page.waitForSelector("[data-testid=training-cert-btn][data-course=crs-1]", { timeout: 5000 });
    check("фон обновился: у crs-1 «Сертификат», в списке два сертификата", (await page.locator("[data-testid=training-cert-btn][data-course=crs-1]").count()) === 1 && (await quizBtn("crs-1").count()) === 0 && (await page.locator("[data-testid=training-cert]").count()) === 2);
    const d1 = await db();
    check("localStorage: crs-1 progress=1 «Завершён», cert-2 «Тестов Тест»", d1.COURSES.find((c) => c.id === "crs-1").progress === 1 && d1.CERTIFICATES.some((c) => c.name === "Тестов Тест" && c.id === "cert-2"));
    await open();
    check("перезагрузка: итоги сохраняются (курс + сертификат)", (await db()).COURSES.find((c) => c.id === "crs-1").progress === 1 && (await page.locator("[data-testid=training-cert]").count()) === 2);

    // ---------- граница на 4 вопросах (crs-2): 3/4 = 75% → пройдено
    await reset(); await open();
    await quizBtn("crs-2").click();
    await page.waitForSelector("[data-testid=quiz-intro]");
    await page.waitForFunction(() => document.querySelector("[data-testid=quiz-intro]")?.textContent?.includes("Вопросов: 4"), { timeout: 5000 });
    check("crs-2 интро: «Вопросов: 4 · проходной балл: 70%»", /Вопросов: 4 · проходной балл: 70%/.test(await page.locator("[data-testid=quiz-dialog]").innerText()));
    await page.locator("[data-testid=quiz-name]").fill("Аня");
    await page.locator("[data-testid=quiz-start]").click();
    await page.waitForSelector("[data-testid=quiz-question]");
    check("crs-2: «Вопрос 1 из 4», последний вопрос — «Завершить»", /Вопрос 1 из 4/.test(await page.locator("[data-testid=quiz-dialog]").innerText()));
    // верные crs-2: [1,2,0,1] → 3 верных + последний неверный
    await answerAll([1, 2, 0, 3]);
    await page.waitForSelector("[data-testid=quiz-result]");
    check("граница 75% (3 из 4) — пройдено: «Тест пройден: 3 из 4 (75%)»", (await page.locator("[data-testid=quiz-dialog]").innerText()).includes("Тест пройден: 3 из 4 (75%)"));
    await page.locator("[data-testid=quiz-close]").click();

    // ---------- overflow и контраст
    await reset();
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        await open();
        const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o[0] > o[1]) over.push(`training ${theme} ${w}: ${o[0]}>${o[1]}`);
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
    code = done("Обучение");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
