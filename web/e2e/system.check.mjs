/* system.check.mjs — браузерные проверки финальной группы «Интеграции, Настройки, Помощь»
   (этап 3). Интеграции: 8 карточек со статусами «Подключено/Не подключено», «Подключить»/
   «Отключить» с сохранением в профиле и после перезагрузки + бейдж CRM «нет связи» (этап 7),
   «Запросить интеграцию» с обратной связью. Этап 8: адаптеры внешних сервисов — кнопки
   «Ключи» (диалог с маскированием секретов), «Проверить связь» и «Синхронизировать» с
   реальными HTTP-вызовами через сервер (webhook-адаптер указывает на собственные маршруты
   /api/debug и /api/nowhere — сеть не трогается), журнал прогонов в .data, 400 без ключей.
   Этап 9: синхронизация переносит данные — демо-источник int-demo (без сети, без карточки):
   3 лида с детерминированным id ext-demo-… попадают в снимок и канбан CRM, повторный
   синк идемпотентен (новых 0, обновлено 3), в интерфейсе адаптера нет.
   Настройки: 7 вкладок, демо-значения
   полей, роли, каналы (первые 3 акцентные), переключатели уведомлений (мышь и пробел), тариф:
   выбор и сохранение в профиле с перезагрузкой (этап 7), вкладка «Данные»: экспорт файла
   (валидный JSON версии 1), импорт с обратной связью, битый файл → ошибка, сброс к демо.
   Помощь: карточка поддержки, чат обучения с ответом по сценарию («Помощь печатает…»),
   Enter отправляет, пустое — нет. Overflow 375…1920 × 2 темы, контраст AA, внешние запросы, консоль.
   Запуск: npm run build && node e2e/system.check.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { apiProfile, apiReset, BASE, launch, reporter, setFaults, startServer, waitReady } from "./lib/harness.mjs";

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
    // намеренные ошибки сети из сценариев (сбой 503, битый импорт 422) браузер пишет в консоль как «Failed to load resource»; это не ошибки приложения
    page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/Failed to load resource.*status of (503|422)/.test(m.text())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/integrations", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = async () => { await apiReset(); await prepare(() => localStorage.clear()); };
    const open = async (url = "/integrations") => {
      const waitSel = { "/integrations": "[data-testid=integrations-card]", "/settings": "[data-testid=settings-tab-profile]", "/help": "[data-testid=help-chat]", "/crm": "[data-testid=crm-sync]" }[url];
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
    const profileOf = () => apiProfile();

    // ================= Интеграции
    await reset(); await setFaults({ latencyMs: 1500 });
    await page.goto(BASE + "/integrations", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: скелетоны показаны, карточек ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=integrations-card]").count()) === 0);
    await page.waitForSelector("[data-testid=integrations-card]", { timeout: 8000 });
    await setFaults({ latencyMs: 0 });
    check("success: 8 карточек, бейдж «Демо» у каждой", (await page.locator("[data-testid=integrations-card]").count()) === 8 && (await page.locator("[data-testid=integrations-card]:has-text('Демо')").count()) === 8);
    check("шапка: «Интеграции», «Подключение внешних сервисов и каналов»", (await page.locator("h1").innerText()) === "Интеграции" && /Подключение внешних сервисов и каналов/.test(await page.locator("main").innerText()));
    const amocrm = await page.locator("[data-testid=integrations-card][data-int=int-amocrm]").innerText();
    check("amoCRM: «Синхронизация сделок и контактов», «Подключено»", amocrm.includes("Синхронизация сделок и контактов") && amocrm.includes("Подключено") && !amocrm.includes("Не подключено"));
    check("WhatsApp: «Не подключено»", (await page.locator("[data-testid=integrations-card][data-int=int-wa]").innerText()).includes("Не подключено"));
    check("статусов «Подключено» — 4 (amoCRM, Bitrix24, Telegram, REST API)", (await page.locator("[data-testid=integrations-card]:has-text('Подключено')").filter({ hasNot: page.locator("text=Не подключено") }).count()) >= 4 && (await page.locator("[data-testid=integrations-card]").filter({ hasText: "Не подключено" }).count()) === 4);
    check("у карточек «Подключить»/«Отключить» (этап 7), кнопка «Настроить» («скоро») не переносится", (await page.getByRole("button", { name: "Настроить" }).count()) === 0 && (await page.locator("[data-testid=integrations-toggle]").count()) === 8);
    await page.locator("[data-testid=integrations-request]").click();
    check("«Запросить интеграцию»: «Запрос интеграции отправлен (демо)»", (await page.locator("[data-testid=integrations-feedback]").innerText()).includes("Запрос интеграции отправлен"));
    // ---------- подключение/отключение с сохранением (этап 7)
    await page.locator("[data-testid=integrations-toggle][data-int=int-amocrm]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=integrations-card][data-int=int-amocrm]")?.textContent?.includes("Не подключено"), { timeout: 8000 });
    check("отключение amoCRM: бейдж «Не подключено», состояние на сервере (connections)", (await profileOf())?.connections?.some((c) => c.id === "int-amocrm" && !c.connected) === true);
    await page.locator("[data-testid=integrations-toggle][data-int=int-wa]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=integrations-card][data-int=int-wa]")?.textContent?.includes("Подключено"), { timeout: 8000 });
    check("подключение WhatsApp: бейдж «Подключено», на сервере оба состояния", (await profileOf())?.connections?.some((c) => c.id === "int-wa" && c.connected) === true);
    await open("/integrations");
    check("перезагрузка: amoCRM отключена, WhatsApp подключена", (await page.locator("[data-testid=integrations-card][data-int=int-amocrm]").innerText()).includes("Не подключено") && (await page.locator("[data-testid=integrations-card][data-int=int-wa]").innerText()).includes("Подключено"));
    await open("/crm");
    check("CRM: бейдж синхронизации показывает «amoCRM: нет связи» (связка с этапом 6)", /Синхр\..*amoCRM: нет связи/.test(await page.locator("[data-testid=crm-sync]").innerText()));

    // ---------- этап 8: адаптеры внешних сервисов, ключи на сервере, реальные вызовы
    // сеть не трогается: webhook-адаптер указывает на собственные маршруты приложения
    fs.rmSync(".data/secrets.json", { force: true });
    fs.rmSync(".data/integration-runs.json", { force: true });
    await open("/integrations");
    check("этап 8: у трёх карточек кнопки адаптера (Ключи/Проверить/Синхронизировать), у пяти — «Адаптер появится позже»", (await page.locator("[data-testid=integrations-check]").count()) === 3 && (await page.locator("[data-testid=integrations-sync]").count()) === 3 && (await page.locator("[data-testid=integrations-keys]").count()) === 3 && (await page.locator("[data-testid=integrations-card]:has-text('Адаптер появится позже')").count()) === 5);
    check("toggle-кнопки «Подключить/Отключить» не потерялись (8)", (await page.locator("[data-testid=integrations-toggle]").count()) === 8);
    await page.locator("[data-testid=integrations-keys][data-int=int-api]").click();
    await page.waitForSelector("[data-testid=integrations-keys-dialog]");
    check("диалог ключей: «Ключи — REST API», предупреждение о secrets.json", (await page.locator("[data-testid=integrations-keys-dialog]").innerText()).includes("Ключи — REST API") && (await page.locator("[data-testid=integrations-keys-dialog]").innerText()).includes("secrets.json"));
    await page.locator("[data-testid=integrations-key-input][data-field=url]").fill(BASE + "/api/debug");
    await page.locator("[data-testid=integrations-keys-save]").click();
    await page.waitForSelector("[data-testid=integrations-keys-saved]", { timeout: 8000 });
    check("ключи сохранены: подтверждение в диалоге", true);
    const cred = await fetch(BASE + "/api/integrations/credentials?integrationId=int-api").then((r) => r.json());
    check("GET ключей: несекретное поле отдаётся целиком", cred.fields.find((f) => f.key === "url").plain === BASE + "/api/debug");
    await page.locator("[data-testid=integrations-keys-cancel]").click();
    await page.waitForFunction(() => !document.querySelector("[data-testid=integrations-keys-dialog]"), { timeout: 4000 });
    await page.locator("[data-testid=integrations-check][data-int=int-api]").click();
    await page.waitForSelector("[data-testid=integrations-run][data-int=int-api]:has-text('успех')", { timeout: 15000 });
    const runOkText = await page.locator("[data-testid=integrations-run][data-int=int-api]").innerText();
    check("проверка связи (webhook GET /api/debug): «Проверка · успех» и HTTP 200", runOkText.includes("Проверка") && runOkText.includes("успех") && runOkText.includes("HTTP 200"));
    const runs = await fetch(BASE + "/api/integrations/runs").then((r) => r.json());
    check("журнал на сервере: первая запись check/int-api/ok:true", runs.runs[0]?.integrationId === "int-api" && runs.runs[0]?.action === "check" && runs.runs[0]?.ok === true);
    await page.locator("[data-testid=integrations-sync][data-int=int-api]").click();
    await page.waitForFunction(() => { const el = document.querySelector("[data-testid=integrations-run][data-int=int-api]"); return el && el.textContent?.includes("Синхронизация"); }, { timeout: 15000 });
    check("синхронизация (webhook POST): «Синхронизация · успех»", /Синхронизация · успех/.test(await page.locator("[data-testid=integrations-run][data-int=int-api]").innerText()));
    await page.locator("[data-testid=integrations-keys][data-int=int-amocrm]").click();
    await page.waitForSelector("[data-testid=integrations-keys-dialog]");
    check("этап 10: в диалоге amoCRM OAuth-поля — clientId открытым, clientSecret/refreshToken секретными, токен необязателен", (await page.locator("[data-testid=integrations-key-input][data-field=clientId]").count()) === 1 && (await page.locator("[data-testid=integrations-key-input][data-field=clientSecret]").getAttribute("type")) === "password" && (await page.locator("[data-testid=integrations-key-input][data-field=refreshToken]").getAttribute("type")) === "password" && (await page.locator("[data-testid=integrations-key-input][data-field=accessToken]").getAttribute("type")) === "password");
    await page.locator("[data-testid=integrations-key-input][data-field=subdomain]").fill("demo-company");
    await page.locator("[data-testid=integrations-key-input][data-field=accessToken]").fill("amo-token-1234567890");
    await page.locator("[data-testid=integrations-keys-save]").click();
    await page.waitForSelector("[data-testid=integrations-keys-saved]", { timeout: 8000 });
    const credAmo = await fetch(BASE + "/api/integrations/credentials?integrationId=int-amocrm").then((r) => r.json());
    check("секрет отдаётся только маской «••••7890», полного токена в ответе нет", credAmo.fields.find((f) => f.key === "accessToken").masked === "••••7890" && !JSON.stringify(credAmo).includes("amo-token-1234567890"));
    check("в браузере полного токена нет: поле пустое, маска рядом с полем", (await page.locator("[data-testid=integrations-key-input][data-field=accessToken]").inputValue()) === "" && (await page.locator("[data-testid=integrations-keys-dialog]").innerText()).includes("••••7890") && !(await page.locator("body").innerText()).includes("amo-token-1234567890"));
    await page.locator("[data-testid=integrations-keys-cancel]").click();
    await page.waitForFunction(() => !document.querySelector("[data-testid=integrations-keys-dialog]"), { timeout: 4000 });
    await page.locator("[data-testid=integrations-keys][data-int=int-api]").click();
    await page.waitForSelector("[data-testid=integrations-keys-dialog]");
    await page.locator("[data-testid=integrations-key-input][data-field=url]").fill(BASE + "/api/nowhere");
    await page.locator("[data-testid=integrations-keys-save]").click();
    await page.waitForSelector("[data-testid=integrations-keys-saved]", { timeout: 8000 });
    await page.locator("[data-testid=integrations-keys-cancel]").click();
    await page.waitForFunction(() => !document.querySelector("[data-testid=integrations-keys-dialog]"), { timeout: 4000 });
    await page.locator("[data-testid=integrations-check][data-int=int-api]").click();
    await page.waitForSelector("[data-testid=integrations-run][data-int=int-api]:has-text('ошибка')", { timeout: 15000 });
    const runFailText = await page.locator("[data-testid=integrations-run][data-int=int-api]").innerText();
    check("отказ связи: «Проверка · ошибка», HTTP 404 в тексте, приложение не падает", runFailText.includes("Проверка") && runFailText.includes("ошибка") && runFailText.includes("HTTP 404"));
    check("обратная связь: «проверка связи — ошибка»", /проверка связи — ошибка/.test(await page.locator("[data-testid=integrations-feedback]").innerText()));
    const missing = await fetch(BASE + "/api/integrations/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ integrationId: "int-bitrix" }) });
    check("без ключей — 400 «Не заполнены ключи» (прямой вызов)", missing.status === 400 && JSON.stringify(await missing.json()).includes("Не заполнены ключи"));
    const health = await fetch(BASE + "/api/health").then((r) => r.json());
    check("/api/health: {ok:true}", health.ok === true);
    await open("/integrations");
    check("после перезагрузки: последний прогон на месте (журнал серверный)", (await page.locator("[data-testid=integrations-run]").count()) === 1 && /Проверка · ошибка/.test(await page.locator("[data-testid=integrations-run]").innerText()));

    // ---------- этап 9: синхронизация переносит данные — демо-источник int-demo (без сети)
    const sync1 = await fetch(BASE + "/api/integrations/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ integrationId: "int-demo" }) }).then((r) => r.json());
    check("этап 9: sync int-demo — «Демо-источник вернул 3 лида; импортировано 3 (новых 3, обновлено 0)»", sync1.run?.ok === true && /импортировано 3 \(новых 3, обновлено 0\)/.test(sync1.run?.detail ?? ""));
    const leadsNow = await fetch(BASE + "/api/collections/leads").then((r) => r.json());
    const demo1 = leadsNow.find((l) => l.id === "ext-demo-1");
    check("этап 9: лиды в снимке с детерминированным id ext-demo-1…3, стадия «new», воронка «fn-sales», событие импорта", leadsNow.filter((l) => /^ext-demo-/.test(l.id)).length === 3 && demo1?.stageId === "new" && demo1?.funnelId === "fn-sales" && demo1?.events?.[0]?.text === "Лид импортирован (Демо-источник)");
    await page.goto(BASE + "/crm?view=kanban", { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=crm-kanban-card]", { timeout: 8000 });
    check("этап 9: импортированные лиды видны в канбане CRM", (await page.locator("main").innerText()).includes("Импорт: сделка Г"));
    const sync2 = await fetch(BASE + "/api/integrations/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ integrationId: "int-demo" }) }).then((r) => r.json());
    check("этап 9: повторный sync идемпотентен — «импортировано 3 (новых 0, обновлено 3)»", sync2.run?.ok === true && /импортировано 3 \(новых 0, обновлено 3\)/.test(sync2.run?.detail ?? ""));
    await open("/integrations");
    check("этап 9: демо-источник не появляется в интерфейсе (кнопок адаптера по-прежнему 3)", (await page.locator("[data-testid=integrations-check]").count()) === 3);

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
    check("тариф: «Тариф: Демо», цены скрыты, есть выбор и сохранение (этап 7)", tariffText.includes("Тариф: Демо") && tariffText.includes("Цены не показываются (демо)") && (await page.locator("[data-testid=settings-tariff-select]").count()) === 1 && (await page.locator("[data-testid=settings-tariff-save]").count()) === 1 && (await page.locator("[data-testid=settings-tariff-select] option").count()) === 3);
    await page.locator("[data-testid=settings-tariff-select]").selectOption("Базовый");
    await page.locator("[data-testid=settings-tariff-save]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=settings-tariff-feedback]")?.textContent?.includes("Тариф сохранён"), { timeout: 8000 });
    check("смена тарифа: «Тариф сохранён: Базовый», записан в профиле на сервере", /Тариф: Базовый/.test(await page.locator("[data-testid=settings-tariff-name]").innerText()) && (await profileOf())?.tariff === "Базовый");
    await open("/settings");
    await page.locator("[data-testid=settings-tab-tariff]").click();
    check("перезагрузка: тариф «Базовый» сохранён", /Тариф: Базовый/.test(await page.locator("[data-testid=settings-tariff-name]").innerText()) && (await page.locator("[data-testid=settings-tariff-save]").isDisabled()));
    await page.locator("[data-testid=settings-tariff-select]").selectOption("Демо");
    check("возврат к сиду: кнопка активна при изменении, «Тариф: Демо» до сохранения", /Тариф: Демо/.test(await page.locator("[data-testid=settings-tariff-name]").innerText()) && !(await page.locator("[data-testid=settings-tariff-save]").isDisabled()));

    // вкладка «Данные»: экспорт → импорт → битый файл → сброс
    await page.locator("[data-testid=settings-tab-data]").click();
    const dataText = await page.locator("main").innerText();
    check("данные: «Экспорт в JSON», «Импорт из JSON», «Сбросить к демо», подсказка про хранилище", dataText.includes("Экспорт в JSON") && dataText.includes("Импорт из JSON") && dataText.includes("Сбросить к демо") && /Данные хранятся на сервере приложения \(\.data\/db\.json\)/.test(dataText));
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
    check("импорт: «Данные импортированы», профиль записан на сервере", !(await page.locator("[data-testid=settings-data-feedback]").innerText()).includes("пропущено") && (await profileOf())?.name === "ООО «Импорт»");
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
