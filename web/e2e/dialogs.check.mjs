/* dialogs.check.mjs — браузерные проверки раздела «Диалоги» (этап 3, группа 2): список входящих,
   переписка с чипом режима (ИИ отвечает / Менеджер отвечает / ИИ в режиме чтения), передача диалога
   «Передать менеджеру» / «Вернуть ИИ», отправка сообщения менеджером (переход в режим чтения),
   панель контекста, мобильный режим список↔переписка, переименование «ИИ-» → «AI-»,
   состояния loading/empty/error/success, overflow, контраст, консоль.
   Запуск: npm run build && node e2e/dialogs.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/dialogs");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/dialogs", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = () => prepare(() => localStorage.clear());
    const open = async (url = "/dialogs") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=chat-item], main [role=alert], [data-testid=dialogs-empty]"); };
    const items = page.locator("[data-testid=chat-item]");
    const msgs = page.locator("[data-testid=chat-msg]");
    const chip = page.locator("[data-testid=chat-mode]");
    const input = page.locator("[data-testid=chat-input]");
    const chipText = async () => (await chip.innerText()).trim();

    // ---------- loading: скелетоны, затем данные
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1500"));
    await page.goto(BASE + "/dialogs", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, переписки ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await items.count()) === 0);
    await page.waitForSelector("[data-testid=chat-item]", { timeout: 8000 });
    check("loading → success: скелетоны исчезли, 3 диалога", (await page.locator("[aria-busy=true]").count()) === 0 && (await items.count()) === 3);

    // ---------- success: список и выбор по умолчанию
    await reset(); await open();
    const names = await page.locator("[data-testid=chat-item-name]").allInnerTexts();
    check("список: демо-диалоги А/Е/В", JSON.stringify(names) === JSON.stringify(["Демо-клиент А", "Демо-клиент Е", "Демо-клиент В"]), JSON.stringify(names));
    check("по умолчанию открыт первый диалог", (await page.locator("[data-testid=chat-thread]").getAttribute("data-conv-id")) === "cv-1");
    check("режим ai: чип «ИИ отвечает»", (await chipText()) === "ИИ отвечает");
    check("режим ai: поле отключено, плейсхолдер «ИИ ведёт диалог…», отправка отключена", (await input.isDisabled()) && (await input.getAttribute("placeholder")) === "ИИ ведёт диалог…" && (await page.locator("[data-testid=chat-send]").isDisabled()));
    check("режим ai: доступна «Передать менеджеру», «Вернуть ИИ» нет", (await page.locator("[data-testid=chat-takeover]").count()) === 1 && (await page.locator("[data-testid=chat-giveback]").count()) === 0);
    check("в шапке: контакт и «канал · сотрудник»", /Демо-клиент А/.test(await page.locator("[data-testid=chat-thread]").innerText()) && /Telegram · Продажи/.test(await page.locator("[data-testid=chat-thread]").innerText()));

    // ---------- передача менеджеру и отправка сообщения
    await page.locator("[data-testid=chat-takeover]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=chat-mode]")?.textContent?.trim() === "Менеджер отвечает");
    // адаптер имитирует задержку сети: ждём факта записи в localStorage, а не только оптимистичный UI
    await page.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").CONVERSATIONS || []).find((c) => c.id === "cv-1")?.mode === "human"; } catch { return false; } }, undefined, { timeout: 8000 });
    check("передача: чип «Менеджер отвечает», поле активно с плейсхолдером «Ответ менеджера…»", (await chipText()) === "Менеджер отвечает" && !(await input.isDisabled()) && (await input.getAttribute("placeholder")) === "Ответ менеджера…");
    const before = await msgs.count();
    await input.fill("Проверка отправки сообщения");
    await page.locator("[data-testid=chat-send]").click();
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length === n + 1, before);
    await page.waitForFunction((n) => { try { const cv = (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").CONVERSATIONS || []).find((c) => c.id === "cv-1"); return cv?.mode === "reading" && (cv?.messages?.length ?? 0) === n + 1; } catch { return false; } }, before, { timeout: 8000 });
    const last = msgs.last();
    check("сообщение отправлено: автор «Менеджер», время ЧЧ:ММ", (await last.getAttribute("data-from")) === "human" && /Менеджер · \d{2}:\d{2}/.test(await last.innerText()));
    check("после ответа менеджера диалог в «ИИ в режиме чтения»", (await chipText()) === "ИИ в режиме чтения");
    check("контекст: статус «С менеджером»", (await page.locator("[data-testid=chat-context-status]").innerText()) === "С менеджером");
    check("превью в списке обновилось текстом сообщения", (await items.first().innerText()).includes("Проверка отправки сообщения"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=chat-msg]");
    check("перезагрузка: сообщение и режим сохранены (localStorage)", (await msgs.count()) === before + 1 && (await chipText()) === "ИИ в режиме чтения");

    // ---------- пустая отправка и возврат ИИ
    const saved = await msgs.count();
    await page.locator("[data-testid=chat-send]").click();
    check("пустое поле: сообщение не отправляется", (await msgs.count()) === saved);
    await page.locator("[data-testid=chat-giveback]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=chat-mode]")?.textContent?.trim() === "ИИ отвечает");
    await page.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").CONVERSATIONS || []).find((c) => c.id === "cv-1")?.mode === "ai"; } catch { return false; } }, undefined, { timeout: 8000 });
    check("возврат ИИ: чип «ИИ отвечает», поле снова отключено", (await chipText()) === "ИИ отвечает" && (await input.isDisabled()));

    // ---------- отправка по Enter и второй диалог
    await page.locator("[data-testid=chat-takeover]").click();
    await input.fill("Сообщение через Enter");
    await input.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length === n + 1, saved);
    await page.waitForFunction((n) => { try { return (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").CONVERSATIONS || []).find((c) => c.id === "cv-1")?.messages?.length === n + 1; } catch { return false; } }, saved, { timeout: 8000 });
    check("Enter отправляет сообщение", (await msgs.last().innerText()).includes("Сообщение через Enter"));
    await items.nth(1).click();
    await page.waitForFunction(() => document.querySelector("[data-testid=chat-thread]")?.getAttribute("data-conv-id") === "cv-2");
    check("второй диалог: «Демо-клиент Е», сразу «Менеджер отвечает», 3 сообщения", /Демо-клиент Е/.test(await page.locator("[data-testid=chat-thread]").innerText()) && (await chipText()) === "Менеджер отвечает" && (await msgs.count()) === 3);
    check("контекст второго диалога: «Кто обратился» и «Следующий шаг» заполнены", (await page.locator("[data-testid=chat-context]").innerText()).includes("Демо-клиент Е") && (await page.locator("[data-testid=chat-context]").innerText()).includes("Оформить возврат менеджером"));
    check("«Открыть в CRM» ведёт на /crm", (await page.locator("[data-testid=chat-open-crm]").getAttribute("href")) === "/crm");

    // ---------- переименование
    check("переименование: «ИИ-» на странице нет, в сайдбаре «AI-сотрудники»", !(await page.locator("body").innerText()).includes("ИИ-") && /AI-сотрудники/.test(await page.locator("aside nav").innerText()));

    // ---------- мобильный режим: список ↔ переписка
    await reset(); await open();
    await page.setViewportSize({ width: 375, height: 800 });
    check("мобильный: показан список, переписка скрыта", (await page.locator("[data-testid=chat-list]").isVisible()) && !(await page.locator("[data-testid=chat-thread]").isVisible()));
    await items.first().click();
    await page.waitForSelector("[data-testid=chat-thread]", { state: "visible" });
    check("мобильный: после выбора показана переписка, список скрыт, есть «назад»", (await page.locator("[data-testid=chat-thread]").isVisible()) && !(await page.locator("[data-testid=chat-list]").isVisible()) && (await page.locator("[data-testid=chat-back]").isVisible()));
    await page.locator("[data-testid=chat-back]").click();
    check("мобильный: «назад» возвращает к списку", (await page.locator("[data-testid=chat-list]").isVisible()) && !(await page.locator("[data-testid=chat-thread]").isVisible()));
    await page.setViewportSize({ width: 1440, height: 900 });

    // ---------- overflow и контраст
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        await open(); const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o[0] > o[1]) over.push(`dialogs ${theme} ${w}: ${o[0]}>${o[1]}`);
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах" + (over.length ? " [" + over.join("; ") + "]" : ""), over.length === 0);
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
    code = done("DIALOGS");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
