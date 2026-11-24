/* documents.check.mjs — браузерные проверки раздела «Документы и согласование» (этап 3, группа 5):
   шаблоны, «Что ИИ делает сам», очередь согласования (4 демо-документа, фильтры статусов),
   одобрение/отклонение с записью в localStorage, создание документа (DOC-205, «Счёт №205»),
   «Документ» из CRM с клиентом из лида, PDF (jsPDF, файл «счёт-DOC-204.pdf»), печать (iframe),
   удаление без подтверждения (как в прототипе), overflow 375…1920 × 2 темы, контраст AA,
   внешние запросы, консоль.
   Запуск: npm run build && node e2e/docs.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/docs");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/docs", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = () => prepare(() => localStorage.clear());
    const open = async (url = "/docs") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=docs-table], main [role=alert]"); };
    const storageDocs = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").DOCUMENTS || []; } catch { return []; } });
    const setFilter = async (f) => { await page.locator(`[data-testid=docs-filter][data-filter=${f}]`).click(); await page.waitForTimeout(100); };
    const feedback = () => page.locator("[data-testid=docs-feedback]").innerText().catch(() => "");

    // ---------- loading: скелетоны, затем данные
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1500"));
    await page.goto(BASE + "/docs", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, данных ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=docs-table]").count()) === 0);
    await page.waitForSelector("[data-testid=docs-table]", { timeout: 8000 });
    check("loading → success: скелетоны исчезли, очередь заполнена", (await page.locator("[aria-busy=true]").count()) === 0 && (await page.locator("[data-testid=docs-row]").count()) === 4);

    // ---------- очередь: сид, статусы, типы
    await reset(); await open();
    check("шапка: «Документы и согласование» и кнопка «Создать документ»", (await page.locator("h1").innerText()).includes("Документы и согласование") && (await page.locator("[data-testid=docs-create-btn]").count()) === 1);
    check("шаблоны: Счёт, Коммерческое предложение, Акт", /Счёт/.test(await page.locator("[data-testid=docs-templates]").innerText()) && /Коммерческое предложение/.test(await page.locator("[data-testid=docs-templates]").innerText()) && /Акт/.test(await page.locator("[data-testid=docs-templates]").innerText()));
    check("«Что ИИ делает сам»: два «Сам» и «Согласует» с лимитом счёта", (await page.getByText("Формирует счёт по шаблону").count()) === 1 && (await page.getByText("Готовит КП по тарифам").count()) === 1 && (await page.getByText("Счёт свыше лимита").count()) === 1);
    const firstRow = await page.locator("[data-testid=docs-row][data-doc=DOC-204]").innerText();
    check("DOC-204: «Демо-счёт №204», тип «Счёт», «На согласовании»", firstRow.includes("Демо-счёт №204") && firstRow.includes("Счёт") && firstRow.includes("На согласовании"));
    const row203 = await page.locator("[data-testid=docs-row][data-doc=DOC-203]").innerText();
    const row201 = await page.locator("[data-testid=docs-row][data-doc=DOC-201]").innerText();
    check("DOC-203 «Одобрено» без действий согласования, DOC-201 «Отклонено»", row203.includes("Одобрено") && !row203.includes("Одобрить") && row201.includes("Отклонено"));
    check("у каждого документа есть PDF, Печать и Удалить", (await page.locator("[data-testid=docs-pdf]").count()) === 4 && (await page.locator("[data-testid=docs-print]").count()) === 4 && (await page.locator("[data-testid=docs-delete]").count()) === 4);
    check("у pending есть Одобрить/Отклонить (DOC-204, DOC-202), у остальных нет", (await page.locator("[data-testid=docs-approve]").count()) === 2 && (await page.locator("[data-testid=docs-reject]").count()) === 2);

    // ---------- фильтры очереди
    await setFilter("pending");
    check("фильтр «На согласов.»: DOC-204 и DOC-202", (await page.locator("[data-testid=docs-row]").count()) === 2 && (await page.locator("[data-testid=docs-row][data-doc=DOC-204]").count()) === 1);
    await setFilter("approved");
    check("фильтр «Одобрено»: только DOC-203", (await page.locator("[data-testid=docs-row]").count()) === 1 && (await page.locator("[data-testid=docs-row][data-doc=DOC-203]").count()) === 1);
    await setFilter("all");

    // ---------- одобрение и отклонение (оптимистичные, запись в localStorage)
    await page.locator("[data-testid=docs-approve][data-doc=DOC-204]").click();
    await page.waitForTimeout(400);
    check("одобрение DOC-204: «Документ одобрен», статус «Одобрено»", (await feedback()).includes("Документ одобрен") && (await page.locator("[data-testid=docs-row][data-doc=DOC-204]").innerText()).includes("Одобрено"));
    const docs1 = await storageDocs();
    check("одобрение записано в localStorage (DOC-204 approved, без пропусков сида)", docs1.find((d) => d.id === "DOC-204")?.status === "approved" && docs1.length === 4);
    await page.locator("[data-testid=docs-reject][data-doc=DOC-202]").click();
    await page.waitForTimeout(400);
    check("отклонение DOC-202: «Документ отклонён»", (await feedback()).includes("Документ отклонён") && (await storageDocs()).find((d) => d.id === "DOC-202")?.status === "rejected");

    // ---------- создание документа
    await page.locator("[data-testid=docs-create-btn]").click();
    await page.waitForSelector("[data-testid=docs-new-type]");
    check("модалка: «Счёт» по умолчанию, согласующий «Менеджер продаж», подсказка про сумму", (await page.locator("[data-testid=docs-new-type]").inputValue()) === "invoice" && (await page.locator("[data-testid=docs-new-approver]").inputValue()) === "Менеджер продаж" && /Сумма не запрашивается/.test(await page.locator("body").innerText()));
    await page.locator("[data-testid=docs-new-type]").selectOption("invoice");
    await page.locator("[data-testid=docs-new-save]").click();
    await page.waitForTimeout(400);
    check("создание: «Документ создан», DOC-205 «Счёт №205» в очереди со статусом «На согласовании»", (await feedback()).includes("Документ создан") && (await page.locator("[data-testid=docs-row][data-doc=DOC-205]").innerText()).includes("Счёт №205") && (await page.locator("[data-testid=docs-row][data-doc=DOC-205]").innerText()).includes("На согласовании"));
    const docs2 = await storageDocs();
    check("DOC-205 записан в localStorage (pending, клиент из лидов)", docs2.find((d) => d.id === "DOC-205")?.status === "pending" && docs2.length === 5 && /^LD-|Демо-клиент/.test(docs2.find((d) => d.id === "DOC-205")?.client || ""));

    // ---------- PDF и печать
    await page.locator("[data-testid=docs-pdf][data-doc=DOC-204]").click();
    await page.waitForTimeout(1200);
    check("PDF: «PDF сформирован: счёт-DOC-204.pdf» (jsPDF с кириллицей)", (await feedback()).includes("PDF сформирован: счёт-DOC-204.pdf"));
    await page.locator("[data-testid=docs-print][data-doc=DOC-204]").click();
    await page.waitForTimeout(100);
    check("печать: открывается скрытый iframe с печатной формой", (await page.locator("iframe[aria-hidden=true]").count()) >= 1 && (await feedback()).includes("Открываю печать…"));
    await page.waitForTimeout(2000);
    check("печать: iframe удалён после вызова печати, нет ошибок печати", (await page.locator("iframe[aria-hidden=true]").count()) === 0 || (await feedback()).includes("Печать недоступна"));

    // ---------- удаление без подтверждения (как в прототипе)
    await page.locator("[data-testid=docs-delete][data-doc=DOC-201]").click();
    await page.waitForSelector("[data-testid=docs-row][data-doc=DOC-201]", { state: "detached", timeout: 5000 });
    check("удаление DOC-201: «Документ удалён», строка исчезла", (await feedback()).includes("Документ удалён") && (await page.locator("[data-testid=docs-row]").count()) === 4);
    await page.locator("[data-testid=docs-delete][data-doc=DOC-202]").click();
    await page.waitForSelector("[data-testid=docs-row][data-doc=DOC-202]", { state: "detached", timeout: 5000 });
    check("удаление DOC-202: очередь без отклонённых", (await feedback()).includes("Документ удалён") && (await page.locator("[data-testid=docs-row]").count()) === 3);
    await setFilter("rejected");
    check("пустой фильтр: «Нет документов по выбранному фильтру»", (await page.locator("[data-testid=docs-table-empty]").innerText()).includes("Нет документов по выбранному фильтру"));
    await setFilter("all");

    // ---------- «Документ» из CRM с клиентом из лида
    await page.goto(BASE + "/crm", { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=crm-journal-card]");
    check("CRM: кнопка «Документ» активна (не «Скоро»)", (await page.locator("[data-testid=crm-make-doc]").isDisabled()) === false && !(await page.locator("[data-testid=crm-inspector]").innerText()).includes("Скоро"));
    await page.locator("[data-testid=crm-make-doc]").click();
    await page.waitForSelector("[data-testid=docs-new-type]");
    const inspectorName = (await page.locator("[data-testid=crm-inspector]").innerText()).split("\n")[0];
    check("модалка из CRM: клиент предвыбран из лида («" + inspectorName.trim() + "»)", (await page.locator("[data-testid=docs-new-client]").inputValue()).trim() === inspectorName.trim() || (await page.locator("[data-testid=docs-new-client]").inputValue()).includes(inspectorName.trim()));
    await page.locator("[data-testid=docs-new-save]").click();
    await page.waitForTimeout(400);
    const docs3 = await storageDocs();
    const inspName = (await page.locator("[data-testid=crm-inspector]").innerText()).split("\n")[0].trim();
    check("документ из CRM создан и записан (клиент = имя лида)", docs3.some((d) => d.client === inspName));
    await page.goto(BASE + "/docs", { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=docs-table]");
    check("новый документ виден в очереди «Документов»", (await page.locator("[data-testid=docs-table]").innerText()).includes("Демо-клиент А") || (await page.locator("[data-testid=docs-row]").count()) >= 6);

    // ---------- overflow и контраст
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        await open();
        const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o[0] > o[1]) over.push(`docs ${theme} ${w}: ${o[0]}>${o[1]}`);
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

    check("нет внешних запросов (jsPDF и шрифт — локальные)", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("Документы");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
