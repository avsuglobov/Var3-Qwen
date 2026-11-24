/* agents.check.mjs — браузерные проверки раздела «AI-сотрудники» (этап 3, группа 1): список, мастер создания,
   карточка сотрудника с вкладками (инструкция, знания, каналы, воронка, правила, тест-чат), пауза/возобновление,
   переименование «ИИ-» → «AI-», состояния loading/empty/error/success, overflow, контраст, консоль.
   Запуск: npm run build && node e2e/agents.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { apiReset, BASE, importSnapshot, launch, reporter, setFaults, startServer, waitReady, waitFor } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/agents");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    // 503 от панели сбоев — намеренный ответ сервера, в консоль браузера пишется как «Failed to load resource»; не ошибка приложения
    page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/Failed to load resource.*status of 503/.test(m.text())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/agents", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = async () => { await apiReset(); await prepare(() => localStorage.clear()); };
    const open = async (url = "/agents") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=agents-grid], main [role=alert], [data-testid=agents-empty], [data-testid=agent-tab]"); };
    const cards = page.locator("[data-testid=agent-card]");
    const text = (sel) => page.locator(sel).innerText();

    // ---------- loading: скелетоны, затем данные
    await reset(); await setFaults({ latencyMs: 1500 });
    await page.goto(BASE + "/agents", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, карточек ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await cards.count()) === 0);
    await page.waitForSelector("[data-testid=agent-card]", { timeout: 8000 });
    await waitFor(async () => (await page.locator("[aria-busy=true]").count()) === 0, { timeout: 10000 });
    check("loading → success: скелетоны исчезли, 5 сотрудников", (await page.locator("[aria-busy=true]").count()) === 0 && (await cards.count()) === 5);
    await setFaults({ latencyMs: 0 });

    // ---------- success: демо-данные и переименование
    await reset(); await open();
    const monograms = await page.locator("[data-testid=agent-monogram]").allInnerTexts();
    check("список: монограммы демо-команды ПР/ПП/СН/HR/РО", JSON.stringify(monograms) === JSON.stringify(["ПР", "ПП", "СН", "HR", "РО"]), JSON.stringify(monograms));
    const statuses = await cards.allInnerTexts();
    const joined = statuses.join(" ");
    check("список: статусы текстом (3 «В сети», 1 «Ожидание», 1 «Не в сети»)", (joined.match(/В сети/g) || []).length === 3 && (joined.match(/Ожидание/g) || []).length === 1 && (joined.match(/Не в сети/g) || []).length === 1);
    check("список: воронки по справочнику и «—» без воронки", /Воронка: Продажи/.test(statuses[0]) && /Воронка: —/.test(statuses[3]));
    check("список: 4 канала показаны как 3 чипа + «+1»", (await cards.nth(0).locator("text=+1").count()) === 1 && (await cards.nth(0).locator("span[title]").count()) === 3);
    check("список: у каждой карточки пометка «Демо»", (await page.locator("[data-testid=agent-card] >> text=Демо").count()) === 5);
    check("переименование: в сайдбаре «AI-сотрудники», «ИИ-» на странице нет", /AI-сотрудники/.test(await text("aside nav")) && !(await text("body")).includes("ИИ-"));

    // ---------- мастер: пустое название отклоняется
    await page.getByRole("button", { name: "Создать сотрудника" }).click();
    await page.waitForSelector("[role=dialog]");
    const dialog = page.locator("[role=dialog]");
    await dialog.getByRole("button", { name: "Создать", exact: true }).click();
    check("мастер: пустое название — предупреждение, окно открыто, сотрудник не создан", (await dialog.locator("[role=alert]").innerText()).includes("Укажите название сотрудника") && (await dialog.count()) === 1 && (await cards.count()) === 5);
    await dialog.getByRole("button", { name: "Поддержка" }).click();
    await dialog.getByRole("button", { name: "Telegram" }).click();
    await dialog.getByRole("button", { name: "Email" }).click();
    await dialog.locator("#wiz-name").fill("Тест Продажи");
    await dialog.locator("#wiz-instruction").fill("Отвечать вежливо");
    await dialog.getByRole("button", { name: "Создать", exact: true }).click();
    await page.waitForSelector("[role=dialog]", { state: "detached" });
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=agent-card]").length === 6, null, { timeout: 8000 });
    check("мастер: сотрудник создан (6-я карточка, монограмма ТП, статус «Ожидание»)", (await cards.count()) === 6 && /ТП/.test(await cards.nth(5).innerText()) && /Ожидание/.test(await cards.nth(5).innerText()));
    check("мастер: каналы применены (Email есть, Telegram нет)", /Email/.test(await cards.nth(5).innerText()) && !/Telegram/.test(await cards.nth(5).innerText()));
    check("мастер: воронка не назначена («—»)", /Воронка: —/.test(await cards.nth(5).innerText()));
    await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=agent-card]");
    check("мастер: сотрудник сохранён на сервере (после перезагрузки)", (await cards.count()) === 6 && /Тест Продажи/.test(await cards.nth(5).innerText()));

    // ---------- карточка сотрудника: вкладки нового сотрудника открываются без ошибок
    await cards.nth(5).getByRole("link", { name: "Открыть" }).click();
    await page.waitForSelector("[data-testid=agent-tab]");
    check("карточка: имя, статус и роль нового сотрудника", (await text("h1")) === "Тест Продажи" && /Роль: Поддержка/.test(await text("main")) && (await page.locator("[data-testid=agent-status]").innerText()).includes("Ожидание"));
    for (const t of ["instruction", "knowledge", "channels", "funnel", "approvals", "test"]) {
      await page.locator(`[data-testid=tab-${t}]`).click();
      await page.waitForTimeout(60);
      if (t === "approvals") check("карточка: правила не заданы (честно пишется)", /Правила не заданы/.test(await text("[data-testid=agent-tab]")));
      if (t === "funnel") check("карточка: «Без воронки» для роли без воронки", /Без воронки/.test(await text("[data-testid=agent-tab]")));
    }
    check("карточка: все 6 вкладок открываются без ошибок в консоли", problems.length === 0, problems.slice(0, 2).join(" | "));

    // ---------- демо-агент «Продажи»: инструкция, пауза, вкладки
    await page.goto(BASE + "/agents/ag-sales", { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=agent-tab]");
    check("агент: заголовок, роль, статус «В сети»", (await text("h1")) === "Продажи" && /Роль: Продажи/.test(await text("main")) && (await page.locator("[data-testid=agent-status]").innerText()).includes("В сети"));
    // инструкция: пустая отклоняется, валидная сохраняется
    await page.locator("#agent-instruction").fill("   ");
    await page.getByRole("button", { name: "Сохранить" }).click();
    check("инструкция: пустая отклоняется с сообщением", /Инструкция не может быть пустой/.test(await text("main")));
    await page.locator("#agent-instruction").fill("Новая инструкция для теста");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.waitForSelector("[data-testid=instruction-saved]");
    check("инструкция: сохранение подтверждается статусом", (await page.locator("[data-testid=instruction-saved]").innerText()) === "Инструкция сохранена");
    await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=agent-tab]");
    check("инструкция: сохраняется после перезагрузки (на сервере)", /Новая инструкция для теста/.test(await text("[data-testid=agent-tab]")));
    // пауза и возобновление с сохранением
    await page.locator("[data-testid=agent-pause]").click();
    await page.waitForTimeout(600);
    check("пауза: статус «Не в сети», кнопка «Возобновить»", (await page.locator("[data-testid=agent-status]").innerText()).includes("Не в сети") && /Возобновить/.test(await text("[data-testid=agent-pause]")));
    await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=agent-status]");
    check("пауза: сохраняется после перезагрузки (на сервере)", (await page.locator("[data-testid=agent-status]").innerText()).includes("Не в сети"));
    check("шапка: «2 / 6 агентов» после паузы и создания (считаются только «В сети»)", /2\s*\/\s*6\s*агентов/.test(await text("header.sticky")));
    await page.locator("[data-testid=agent-pause]").click();
    await page.waitForTimeout(600);
    check("возобновление: статус снова «В сети»", (await page.locator("[data-testid=agent-status]").innerText()).includes("В сети"));
    // знания и каналы
    await page.locator("[data-testid=tab-knowledge]").click();
    check("знания: 3 источника с «Индексировано», добавление помечено «Скоро»", (await page.locator("[data-testid=agent-tab] >> text=Индексировано").count()) === 3 && (await page.getByRole("button", { name: "Добавить источник" }).isDisabled()));
    await page.locator("[data-testid=tab-channels]").click();
    check("каналы: 4 подключённых чипа, подключение помечено «Скоро»", (await page.locator("[data-testid=agent-tab] span[title]").count()) === 4 && (await page.getByRole("button", { name: "Подключить канал" }).isDisabled()));
    // воронка
    await page.locator("[data-testid=tab-funnel]").click();
    await page.waitForSelector("[data-testid=agent-funnel] > div");
    const counts = await page.locator("[data-testid=agent-funnel] > div").allInnerTexts();
    check("воронка: 4 стадии демо-воронки по 1 лиду", counts.length === 4 && /Новые/.test(counts[0]) && /Сделка/.test(counts[3]) && counts.map((c) => c.replace(/\D/g, "")).join("") === "1111", JSON.stringify(counts));
    // правила согласования
    await page.locator("[data-testid=tab-approvals]").click();
    const rows = await page.locator("[data-testid=agent-approvals] tbody tr").allInnerTexts();
    check("правила: 3 строки, режимы «Сам»/«Согласует» текстом", rows.length === 3 && /Сам/.test(rows[0]) && /Согласует/.test(rows[1]));
    // тест-чат
    await page.locator("[data-testid=tab-test]").click();
    check("тест-чат: приветствие и честная пометка «не LLM»", /Готов к проверке/.test(await text("[data-testid=agent-test-chat]")) && /не LLM/.test(await text("[data-testid=agent-tab]")));
    await page.locator("[data-testid=test-input]").fill("Есть тариф для команды?");
    await page.getByRole("button", { name: "Отправить" }).click();
    check("тест-чат: скриптованный ответ по ключевому слову «тариф»", /каталог тарифов/.test(await text("[data-testid=agent-test-chat]")));

    // ---------- empty
    await reset(); await importSnapshot({ version: 1, AGENTS: [] }); await open();
    check("empty: «Сотрудников пока нет» и подсказка", /Сотрудников пока нет/.test(await text("main")) && /Создайте первого/.test(await text("main")));

    // ---------- error → повтор
    await reset(); await setFaults({ fail: true }); await open();
    await page.waitForSelector("main [role=alert]");
    check("error: «Не удалось загрузить данные» с «Повторить»", /Не удалось загрузить данные/.test(await text("main")) && /имитация сбоя/.test(await text("main")));
    await setFaults({ fail: false });
    await page.locator("main [role=alert] button").first().click();
    await page.waitForSelector("[data-testid=agent-card]", { timeout: 8000 });
    check("error → «Повторить» восстанавливает список (5 карточек)", (await cards.count()) === 5);

    // ---------- overflow и контраст (обе темы, список и карточка)
    await reset(); await open();
    let over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        await open(); const o1 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o1[0] > o1[1]) over.push(`agents ${theme} ${w}: ${o1[0]}>${o1[1]}`);
        await open("/agents/ag-sales"); const o2 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o2[0] > o2[1]) over.push(`detail ${theme} ${w}: ${o2[0]}>${o2[1]}`);
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах" + (over.length ? " [" + over.join("; ") + "]" : ""), over.length === 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    const bad = {};
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await open();
      for (const [k, v] of Object.entries(await page.evaluate(contrastProbe))) bad[theme + " list " + k] = v;
      await open("/agents/ag-sales");
      for (const [k, v] of Object.entries(await page.evaluate(contrastProbe))) bad[theme + " detail " + k] = v;
    }
    check("контраст WCAG AA на списке и карточке в обеих темах" + (Object.keys(bad).length ? "\n     " + Object.entries(bad).slice(0, 5).map(([k, v]) => `${v.ratio} ${k}`).join("\n     ") : ""), Object.keys(bad).length === 0);

    check("нет внешних запросов", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("AGENTS");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
