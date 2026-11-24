/* system.check.mjs — браузерные проверки финальной группы «Интеграции, Настройки, Помощь»
   (этап 3). Интеграции: 8 карточек со статусами «Подключено/Не подключено», кнопки «скоро»
   не переносятся, «Запросить интеграцию» с обратной связью. Настройки: 7 вкладок, демо-значения
   полей, роли, каналы (первые 3 акцентные), переключатели уведомлений (мышь и пробел), тариф
   без кнопки, вкладка «Данные»: экспорт файла (валидный JSON версии 1), импорт с обратной
   связью, битый файл → ошибка, сброс к демо. Помощь: карточка поддержки, чат обучения с
   ответом по сценарию («Помощь печатает…»), Enter отправляет, пустое — нет.
   Overflow 375…1920 × 2 темы, контраст AA, внешние запросы, консоль.
   Запуск: npm run build && node e2e/system.check.mjs */
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
    await waitReady("/integrations");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/integrations", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = () => prepare(() => localStorage.clear());
    const open = async (url = "/integrations") => {
      const waitSel = { "/integrations": "[data-testid=integrations-card]", "/settings": "[data-testid=settings-tab-profile]", "/help": "[data-testid=help-chat]" }[url];
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.goto(BASE + url, { waitUntil: "networkidle" });
        try {
          await page.waitForSelector(waitSel + ", main [role=alert]", { timeout: 8000 });
          return;
        } catch {
          if (attempt === 2) throw new Error("open(" + url + "): маркер раздела не появился");
        }
      }
    };
    const profileOf = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").COMPANY_PROFILE || null; } catch { return null; } });

    // ================= Интеграции
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1500"));
    await page.goto(BASE + "/integrations", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: скелетоны показаны, карточек ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=integrations-card]").count()) === 0);
    await page.waitForSelector("[data-testid=integrations-card]", { timeout: 8000 });
    await prepare(() => localStorage.removeItem("aiws-mock-latency"));
    check("success: 8 карточек, бейдж «Демо» у каждой", (await page.locator("[data-testid=integrations-card]").count()) === 8 && (await page.locator("[data-testid=integrations-card]:has-text('Демо')").count()) === 8);
    check("шапка: «Интеграции», «Подключение внешних сервисов и каналов»", (await page.locator("h1").innerText()) === "Интеграции" && /Подключение внешних сервисов и каналов/.test(await page.locator("main").innerText()));
    const amocrm = await page.locator("[data-testid=integrations-card][data-int=int-amocrm]").innerText();
    check("amoCRM: «Синхронизация сделок и контактов», «Подключено»", amocrm.includes("Синхронизация сделок и контактов") && amocrm.includes("Подключено") && !amocrm.includes("Не подключено"));
    check("WhatsApp: «Не подключено»", (await page.locator("[data-testid=integrations-card][data-int=int-wa]").innerText()).includes("Не подключено"));
    check("статусов «Подключено» — 4 (amoCRM, Bitrix24, Telegram, REST API)", (await page.locator("[data-testid=integrations-card]:has-text('Подключено')").filter({ hasNot: page.locator("text=Не подключено") }).count()) >= 4 && (await page.locator("[data-testid=integrations-card]").filter({ hasText: "Не подключено" }).count()) === 4);
    check("кнопки «скоро» («Настроить», «Подключить») не переносятся", (await page.getByRole("button", { name: "Настроить" }).count()) === 0 && (await page.getByRole("button", { name: "Подключить" }).count()) === 0);
    await page.locator("[data-testid=integrations-request]").click();
    check("«Запросить интеграцию»: «Запрос интеграции отправлен (демо)»", (await page.locator("[data-testid=integrations-feedback]").innerText()).includes("Запрос интеграции отправлен"));

    // ================= Настройки
    await open("/settings");
    check("шапка: «Настройки», «Профиль, компания, роли, каналы, уведомления, тариф»", (await page.locator("h1").innerText()) === "Настройки" && /Профиль, компания, роли, каналы, уведомления, тариф/.test(await page.locator("main").innerText()));
    check("7 вкладок, активна «Профиль»", (await page.locator("[data-testid=settings-tabs] button").count()) === 7 && (await page.locator("[data-testid=settings-tab-profile]").getAttribute("aria-pressed")) === "true");
    check("профиль: «ВВ», «demo@ai-workspace», «UTC+3 Москва»", (await page.locator("[data-testid=settings-field-name]").inputValue()) === "ВВ" && (await page.locator("[data-testid=settings-field-email]").inputValue()) === "demo@ai-workspace" && (await page.locator("[data-testid=settings-field-tz]").inputValue()) === "UTC+3 Москва");
    await page.locator("[data-testid=settings-tab-company]").click();
    check("компания: «Демо-компания», «demo.site», «Демо-описание.»", (await page.locator("[data-testid=settings-company-name]").inputValue()) === "Демо-компания" && (await page.locator("[data-testid=settings-company-site]").inputValue()) === "demo.site" && (await page.locator("[data-testid=settings-company-about]").inputValue()) === "Демо-описание.");
    await page.locator("[data-testid=settings-tab-roles]").click();
    const rolesText = await page.locator("[data-testid=settings-roles]").innerText();
    check("роли: 3 строки — «Владелец/Полный», «Менеджер/Диалоги, CRM», «Бухгалтерия/Документы»", (await page.locator("[data-testid=settings-role-row]").count()) === 3 && rolesText.includes("Владелец") && rolesText.includes("Диалоги, CRM") && rolesText.includes("Документы"));
    await page.locator("[data-testid=settings-tab-channels]").click();
    const chipAccents = await page.locator("[data-testid=settings-channel-chip]").evaluateAll((els) => els.map((e) => e.className.includes("accent")));
    check("каналы: 8 чипов, первые 3 акцентные (Telegram, WhatsApp, MAX)", (await page.locator("[data-testid=settings-channel-chip]").count()) === 8 && chipAccents[0] && chipAccents[1] && chipAccents[2] && !chipAccents[3] && (await page.locator("[data-testid=settings-channel-chip][data-channel=telegram]").innerText()).includes("Telegram"));
    await page.locator("[data-testid=settings-tab-notifications]").click();
    const sws = [0, 1, 2, 3].map((i) => page.locator(`[data-testid=settings-sw-${i}]`));
    check("уведомления: 4 переключателя, первые 3 включены, «Ошибка агента (КРИТИЧНО)» выключен", (await sws[0].getAttribute("aria-checked")) === "true" && (await sws[1].getAttribute("aria-checked")) === "true" && (await sws[2].getAttribute("aria-checked")) === "true" && (await sws[3].getAttribute("aria-checked")) === "false");
    await sws[3].click();
    check("клик переключает «Ошибка агента» (aria-checked=true)", (await sws[3].getAttribute("aria-checked")) === "true");
    await sws[0].focus(); await page.keyboard.press("Space");
    check("пробел переключает «Новый лид» с клавиатуры (aria-checked=false)", (await sws[0].getAttribute("aria-checked")) === "false");
    await page.locator("[data-testid=settings-tab-tariff]").click();
    const tariffText = await page.locator("main").innerText();
    check("тариф: «Тариф: Демо», «Пробный период», цены скрыты, кнопки «скоро» нет", tariffText.includes("Тариф: Демо") && tariffText.includes("Пробный период") && tariffText.includes("Цены не показываются (демо)") && (await page.getByRole("button", { name: "Выбрать тариф" }).count()) === 0);

    // вкладка «Данные»: экспорт → импорт → битый файл → сброс
    await page.locator("[data-testid=settings-tab-data]").click();
    const dataText = await page.locator("main").innerText();
    check("данные: «Экспорт в JSON», «Импорт из JSON», «Сбросить к демо», подсказка про localStorage", dataText.includes("Экспорт в JSON") && dataText.includes("Импорт из JSON") && dataText.includes("Сбросить к демо") && /Данные хранятся локально в браузере \(localStorage\)/.test(dataText));
    const downloadPromise = page.waitForEvent("download", { timeout: 8000 });
    await page.locator("[data-testid=settings-export]").click();
    const download = await downloadPromise;
    const tmpJson = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aiws-e2e-")), "data.json");
    await download.saveAs(tmpJson);
    const saved = JSON.parse(fs.readFileSync(tmpJson, "utf8"));
    check("экспорт: файл «ai-workspace-data.json», JSON версии 1 с лидами", download.suggestedFilename() === "ai-workspace-data.json" && saved.version === 1 && Array.isArray(saved.LEADS) && saved.LEADS.length > 0);
    await page.waitForFunction(() => document.querySelector("[data-testid=settings-data-feedback]")?.textContent?.includes("Файл данных скачан"), { timeout: 8000 });
    check("экспорт: «Файл данных скачан»", true);
    saved.COMPANY_PROFILE = { name: "ООО «Импорт»", about: "Описание после импорта.", audience: "Аудитория." };
    const modified = tmpJson.replace("data.json", "modified.json");
    fs.writeFileSync(modified, JSON.stringify(saved));
    await page.locator("[data-testid=settings-import-input]").setInputFiles(modified);
    await page.waitForFunction(() => document.querySelector("[data-testid=settings-data-feedback]")?.textContent?.includes("Данные импортированы"), { timeout: 8000 });
    check("импорт: «Данные импортированы», профиль записан в localStorage", !(await page.locator("[data-testid=settings-data-feedback]").innerText()).includes("пропущено") && (await profileOf())?.name === "ООО «Импорт»");
    const bad = path.join(path.dirname(modified), "bad.json");
    fs.writeFileSync(bad, "{ не json");
    await page.locator("[data-testid=settings-import-input]").setInputFiles(bad);
    await page.waitForFunction(() => document.querySelector("[data-testid=settings-data-feedback]")?.textContent?.includes("корректным JSON"), { timeout: 8000 });
    check("битый файл: ошибка «Файл не является корректным JSON» (role=alert)", (await page.locator("[data-testid=settings-data-feedback]").getAttribute("role")) === "alert");
    await page.locator("[data-testid=settings-reset]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=settings-data-feedback]")?.textContent?.includes("Данные сброшены к демо"), { timeout: 8000 });
    check("сброс: «Данные сброшены к демо», профиль вернулся к сиду", (await profileOf())?.name === "Демо-компания");

    // ================= Помощь
    await open("/help");
    check("шапка: «Помощь», «Поддержка и чат обучения»", (await page.locator("h1").innerText()) === "Помощь" && /Поддержка и чат обучения/.test(await page.locator("main").innerText()));
    const supportText = await page.locator("main").innerText();
    check("поддержка: «Чат с поддержкой» + «Демо», «Email» + «Подключается на бэкенде», «База статей»", supportText.includes("Чат с поддержкой") && supportText.includes("Email") && supportText.includes("Подключается на бэкенде") && supportText.includes("База статей"));
    const initial = await page.locator("[data-testid=help-msg-ai]").first().innerText();
    check("чат обучения: приветствие с «AI-сотрудника» (переименование «ИИ-»)", initial.includes("настроить AI-сотрудника") && !initial.includes("ИИ-"));
    await page.locator("[data-testid=help-input]").fill("какая цена тарифа?");
    await page.locator("[data-testid=help-send]").click();
    check("сообщение появилось в чате («Вы»)", (await page.locator("[data-testid=help-msg-human]").count()) === 1);
    await page.waitForSelector("[data-testid=help-typing]", { timeout: 2000 });
    check("«Помощь печатает…» показано", true);
    await page.waitForSelector("[data-testid=help-msg-ai]:not(:has-text('настроить AI-сотрудника'))", { timeout: 3000 });
    const aiText = await page.locator("[data-testid=help-msg-ai]").last().innerText();
    check("ответ по сценарию о тарифах (scriptedReply)", /тариф/.test(aiText) && /демо/.test(aiText));
    const before = await page.locator("[data-testid=help-msg-human]").count();
    await page.locator("[data-testid=help-send]").click();
    await page.waitForTimeout(300);
    check("пустое сообщение не отправляется", (await page.locator("[data-testid=help-msg-human]").count()) === before);
    await page.locator("[data-testid=help-input]").fill("спасибо");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[data-testid=help-msg-ai]:has-text('Принял, благодарю')", { timeout: 3000 });
    check("Enter отправляет, второй ответ по сценарию", (await page.locator("[data-testid=help-msg-human]").count()) === 2);

    // ================= overflow и контраст (все три раздела)
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const url of ["/integrations", "/settings", "/help"]) {
          await open(url);
          const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          if (o[0] > o[1]) over.push(`${url} ${theme} ${w}: ${o[0]}>${o[1]}`);
        }
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах (3 раздела)" + (over.length ? " [" + over.slice(0, 4).join("; ") + "]" : ""), over.length === 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    const bad2 = {};
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      for (const url of ["/integrations", "/settings", "/help"]) {
        await open(url);
        for (const [k, v] of Object.entries(await page.evaluate(contrastProbe))) bad2[theme + " " + url + " " + k] = v;
      }
    }
    check("контраст WCAG AA на всех разделах в обеих темах" + (Object.keys(bad2).length ? "\n     " + Object.entries(bad2).slice(0, 5).map(([k, v]) => `${v.ratio} ${k}`).join("\n     ") : ""), Object.keys(bad2).length === 0);

    check("нет внешних запросов", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("Интеграции, Настройки, Помощь");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
