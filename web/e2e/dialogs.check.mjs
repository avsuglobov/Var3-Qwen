/* dialogs.check.mjs — браузерные проверки раздела «Диалоги» (этап 3, группа 2): список входящих,
   переписка с чипом режима (ИИ отвечает / Менеджер отвечает / ИИ в режиме чтения), передача диалога
   «Передать менеджеру» / «Вернуть ИИ», отправка сообщения менеджером (переход в режим чтения),
   вложения в диалоге (этап 6): выбор файла, чипы, лимиты 1 МБ и 3 файла, скачивание data-URL,
   сохранение на сервере и после перезагрузки, отправка без текста, превью «📎 имя»,
   панель контекста, мобильный режим список↔переписка, переименование «ИИ-» → «AI-»,
   состояния loading/empty/error/success, overflow, контраст, консоль.
   Этап 16: кнопка «Ответ ИИ» — серверный маршрут /api/ai/reply, честная пометка «демо,
   не LLM» без настроенного провайдера, запись ответа с пометкой на сервере.
   Запуск: npm run build && node e2e/dialogs.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { apiItems, apiReset, BASE, importSnapshot, launch, reporter, setFaults, startServer, waitReady, waitFor } from "./lib/harness.mjs";

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
    const reset = async () => { await apiReset(); await prepare(() => localStorage.clear()); };
    const open = async (url = "/dialogs") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=chat-item], main [role=alert], [data-testid=dialogs-empty]"); };
    const storageConvos = () => apiItems("conversations");
    const items = page.locator("[data-testid=chat-item]");
    const msgs = page.locator("[data-testid=chat-msg]");
    const chip = page.locator("[data-testid=chat-mode]");
    const input = page.locator("[data-testid=chat-input]");
    const chipText = async () => (await chip.innerText()).trim();

    // ---------- loading: скелетоны, затем данные
    await reset(); await setFaults({ latencyMs: 1500 });
    await page.goto(BASE + "/dialogs", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, переписки ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await items.count()) === 0);
    await page.waitForSelector("[data-testid=chat-item]", { timeout: 8000 });
    await waitFor(async () => (await page.locator("[aria-busy=true]").count()) === 0, { timeout: 10000 });
    check("loading → success: скелетоны исчезли, 3 диалога", (await page.locator("[aria-busy=true]").count()) === 0 && (await items.count()) === 3);
    await setFaults({ latencyMs: 0 });

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
    // запись идёт на сервер через REST: ждём факта записи, а не только оптимистичный UI
    await waitFor(async () => (await storageConvos()).find((c) => c.id === "cv-1")?.mode === "human");
    check("передача: чип «Менеджер отвечает», поле активно с плейсхолдером «Ответ менеджера…»", (await chipText()) === "Менеджер отвечает" && !(await input.isDisabled()) && (await input.getAttribute("placeholder")) === "Ответ менеджера…");
    const before = await msgs.count();
    await input.fill("Проверка отправки сообщения");
    await page.locator("[data-testid=chat-send]").click();
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length === n + 1, before);
    await waitFor(async () => { const cv = (await storageConvos()).find((c) => c.id === "cv-1"); return cv?.mode === "reading" && (cv?.messages?.length ?? 0) === before + 1; });
    const last = msgs.last();
    check("сообщение отправлено: автор «Менеджер», время ЧЧ:ММ", (await last.getAttribute("data-from")) === "human" && /Менеджер · \d{2}:\d{2}/.test(await last.innerText()));
    check("после ответа менеджера диалог в «ИИ в режиме чтения»", (await chipText()) === "ИИ в режиме чтения");
    check("контекст: статус «С менеджером»", (await page.locator("[data-testid=chat-context-status]").innerText()) === "С менеджером");
    check("превью в списке обновилось текстом сообщения", (await items.first().innerText()).includes("Проверка отправки сообщения"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=chat-msg]");
    check("перезагрузка: сообщение и режим сохранены (на сервере)", (await msgs.count()) === before + 1 && (await chipText()) === "ИИ в режиме чтения");

    // ---------- пустая отправка и возврат ИИ
    const saved = await msgs.count();
    await page.locator("[data-testid=chat-send]").click();
    check("пустое поле: сообщение не отправляется", (await msgs.count()) === saved);
    await page.locator("[data-testid=chat-giveback]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=chat-mode]")?.textContent?.trim() === "ИИ отвечает");
    await waitFor(async () => (await storageConvos()).find((c) => c.id === "cv-1")?.mode === "ai");
    check("возврат ИИ: чип «ИИ отвечает», поле снова отключено", (await chipText()) === "ИИ отвечает" && (await input.isDisabled()));

    // ---------- отправка по Enter и второй диалог
    await page.locator("[data-testid=chat-takeover]").click();
    await input.fill("Сообщение через Enter");
    await input.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length === n + 1, saved);
    await waitFor(async () => (await storageConvos()).find((c) => c.id === "cv-1")?.messages?.length === saved + 1);
    check("Enter отправляет сообщение", (await msgs.last().innerText()).includes("Сообщение через Enter"));

    // ---------- вложения в диалоге (этап 6)
    await reset(); await open();
    await page.locator("[data-testid=chat-takeover]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=chat-mode]")?.textContent?.trim() === "Менеджер отвечает");
    const fileInput = page.locator("[data-testid=chat-file-input]");
    check("скрепка: доступна в режиме менеджера, скрытое поле файла в DOM", !(await page.locator("[data-testid=chat-attach]").isDisabled()) && (await fileInput.count()) === 1);
    const tiny = { name: "бриф.txt", mimeType: "text/plain", buffer: Buffer.from("Краткое ТЗ по проекту, 2 страницы") };
    await fileInput.setInputFiles([tiny]);
    await page.waitForSelector("[data-testid=chat-file-chip]");
    check("выбранный файл: чип с именем и размером, есть «Убрать»", /бриф\.txt/.test(await page.locator("[data-testid=chat-file-chip]").innerText()) && /\d+ Б/.test(await page.locator("[data-testid=chat-file-chip]").innerText()) && (await page.locator("[data-testid=chat-file-remove]").count()) === 1);
    await page.locator("[data-testid=chat-file-remove]").click();
    check("файл убран: чип исчез", (await page.locator("[data-testid=chat-file-chip]").count()) === 0);
    await fileInput.setInputFiles([tiny]);
    await page.waitForSelector("[data-testid=chat-file-chip]");
    const attachBefore = await msgs.count();
    await input.fill("Отправляю бриф вложением");
    await page.locator("[data-testid=chat-send]").click();
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length === n + 1, attachBefore);
    const savedConv = async () => (await storageConvos()).find((c) => c.id === "cv-1");
    await waitFor(async () => (await savedConv())?.messages?.length === attachBefore + 1);
    const attachMsg = msgs.last();
    check("сообщение с вложением: чип в пузыре с именем и размером", /бриф\.txt/.test(await attachMsg.innerText()) && /\d+ Б/.test(await attachMsg.innerText()));
    check("сервер: сообщение сохранено с вложением (name/size/data)", (await savedConv())?.messages?.at(-1)?.attachments?.[0]?.name === "бриф.txt");
    const attachLink = attachMsg.locator("[data-testid=chat-attachment]");
    check("вложение скачивается: data-URL + download с именем файла", (await attachLink.getAttribute("href"))?.startsWith("data:text/plain;base64,") === true && (await attachLink.getAttribute("download")) === "бриф.txt");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=chat-msg]");
    check("перезагрузка: вложение сохранено и снова скачивается", (await page.locator('[data-testid=chat-attachment][data-name="бриф.txt"]').count()) === 1);
    // ограничения лимитов: в «ИИ в режиме чтения» композер активен — менеджер может вкладывать файлы
    await fileInput.setInputFiles([{ name: "big.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(1048577, 1) }]);
    check("файл больше 1 МБ: ошибка role=alert, вложение не добавлено", (await page.locator("[data-testid=chat-file-error]").innerText()).includes("больше 1 МБ") && (await page.locator("[data-testid=chat-file-chip]").count()) === 0);
    await fileInput.setInputFiles([1, 2, 3, 4].map((i) => ({ name: `f${i}.txt`, mimeType: "text/plain", buffer: Buffer.from("x") })));
    check("больше 3 файлов: ошибка, ничего не добавлено", (await page.locator("[data-testid=chat-file-error]").innerText()).includes("Не больше 3") && (await page.locator("[data-testid=chat-file-chip]").count()) === 0);
    await fileInput.setInputFiles([{ name: "только-файл.txt", mimeType: "text/plain", buffer: Buffer.from("без текста") }]);
    await page.waitForSelector("[data-testid=chat-file-chip]");
    await page.locator("[data-testid=chat-send]").click();
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length === n + 2, attachBefore);
    await waitFor(async () => /📎 только-файл\.txt/.test(await items.first().innerText()));
    check("сообщение без текста, но с вложением: отправляется, превью в списке — «📎 имя»", /📎 только-файл\.txt/.test(await items.first().innerText()));

    await items.nth(1).click();
    await page.waitForFunction(() => document.querySelector("[data-testid=chat-thread]")?.getAttribute("data-conv-id") === "cv-2");
    check("второй диалог: «Демо-клиент Е», сразу «Менеджер отвечает», 3 сообщения", /Демо-клиент Е/.test(await page.locator("[data-testid=chat-thread]").innerText()) && (await chipText()) === "Менеджер отвечает" && (await msgs.count()) === 3);
    check("контекст второго диалога: «Кто обратился» и «Следующий шаг» заполнены", (await page.locator("[data-testid=chat-context]").innerText()).includes("Демо-клиент Е") && (await page.locator("[data-testid=chat-context]").innerText()).includes("Оформить возврат менеджером"));
    const crmHref = await page.locator("[data-testid=chat-open-crm]").getAttribute("href");
    check("«Открыть в CRM» ведёт на /crm с лидом этого контакта (Демо-клиент Е → LD-1035)", /^\/crm(\?lead=LD-\d+)?$/.test(crmHref ?? "") && (crmHref ?? "").includes("LD-1035"), crmHref);

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

    // этап 16: «Ответ ИИ» — серверный маршрут /api/ai/reply; без настроенного провайдера — честный демо-ответ с пометкой
    await reset(); await open();
    const msgsBeforeAi = await page.locator("[data-testid=chat-msg]").count();
    await page.locator("[data-testid=chat-ai-reply]").click();
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=chat-msg]").length > n, msgsBeforeAi, { timeout: 8000 });
    const aiNote = await page.locator("[data-testid=chat-msg-note]").last().innerText();
    check("этап 16: «Ответ ИИ» добавляет сообщение с честной пометкой «демо»", /демо/.test(aiNote) && /не LLM/.test(aiNote));
    const convId = await page.locator("[data-testid=chat-thread]").getAttribute("data-conv-id");
    const savedConvs = await apiItems("conversations");
    check("этап 16: ответ ИИ с пометкой записан на сервере", savedConvs.find((c) => c.id === convId)?.messages?.some((m) => m.from === "ai" && Boolean(m.note)) === true);

    // ---------- этап 21: вкладка «Почта» — входящие письма, статусы, привязка к лиду, AI с честными пометками
    await reset(); await open();
    await page.locator("[data-testid=dialogs-tab-mail]").click();
    await page.waitForSelector("[data-testid=mail-empty]");
    check("этап 21: пустое состояние вкладки «Почта»", await page.locator("[data-testid=mail-empty]").isVisible());
    const email = {
      id: "em-e2e1", accountId: "acc-e2e", folder: "INBOX", uid: 10, messageId: "<e2e1@test>",
      from: "Иван Тестов <ivan@test>", to: "sales@test", subject: "Вопрос о тарифах",
      date: Date.parse("2026-11-23T10:00:00Z"), body: "Здравствуйте, нужны цены и сроки.",
      status: "Новое", leadId: null, category: null, categorySource: null, attachments: []
    };
    await importSnapshot({ version: 1, EMAILS: [email] });
    await open();
    await page.locator("[data-testid=dialogs-tab-mail]").click();
    await page.waitForSelector("[data-testid=mail-item]");
    check("этап 21: письмо из хранилища в списке вкладки «Почта»", (await page.locator("[data-testid=mail-item]").count()) === 1);
    await page.locator("[data-testid=mail-item]").click();
    await page.waitForSelector("[data-testid=mail-card]");
    check("этап 21: карточка письма показывает тему и тело", (await page.locator("[data-testid=mail-body]").innerText()).includes("цен"));
    // статус → «В работе» сохраняется на сервере (коллекция EMAILS)
    await page.locator("[data-testid=mail-status]").selectOption("В работе");
    await waitFor(async () => (await apiItems("emails"))[0]?.status === "В работе");
    check("этап 21: смена статуса сохраняется на сервере", (await apiItems("emails"))[0]?.status === "В работе");
    // AI-классификация без провайдера — честная пометка «не LLM»
    await page.locator("[data-testid=mail-ai-classify]").click();
    await page.waitForSelector("[data-testid=mail-category]", { timeout: 5000 });
    const mailNote = await page.locator("[data-testid=mail-ai-note]").innerText();
    check("этап 21: классификация с честной пометкой «демо, не LLM»", /не LLM/.test(mailNote) && (await apiItems("emails"))[0]?.categorySource === "scripted");
    // привязка к лиду
    await page.locator("[data-testid=mail-lead]").selectOption({ index: 1 });
    await waitFor(async () => Boolean((await apiItems("emails"))[0]?.leadId));
    check("этап 21: привязка к лиду сохраняется", Boolean((await apiItems("emails"))[0]?.leadId));

    check("нет внешних запросов", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("DIALOGS");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
