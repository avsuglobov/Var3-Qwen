/* crm.check.mjs — браузерные проверки раздела «CRM» (этап 3, группа 3): журнал смены с инспектором
   лида, смена стадии списком, канбан (колонки, счётчики, КРИТИЧНО, dnd-kit перетаскивание мышью,
   клик по карточке), таблица (фильтр по стадиям, сортировка ID → Имя → Активность, клик по строке),
   создание и удаление лида с подтверждением, deep-link ?lead=, «Открыть диалог», «Документ» открывает модалку с клиентом из лида,
   переименование «ИИ-» → «AI-», бейдж синхронизации из справочника интеграций (этап 6: amoCRM и
   Bitrix24, скрыт при загрузке), overflow 375…1920 × 2 темы, контраст, консоль.
   Запуск: npm run build && node e2e/crm.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { apiItems, apiReset, BASE, launch, reporter, setFaults, startServer, waitReady, waitFor } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/crm");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/crm", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = async () => { await apiReset(); await prepare(() => localStorage.clear()); };
    const open = async (url = "/crm") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=crm-journal-card], [data-testid=crm-kanban], [data-testid=crm-table], main [role=alert]"); };
    const storageLeads = () => apiItems("leads");
    const switchView = async (v) => { await page.locator(`[data-testid=crm-view-switch][data-view=${v}]`).click(); await page.waitForSelector(v === "journal" ? "[data-testid=crm-journal-card]" : v === "kanban" ? "[data-testid=crm-kanban]" : "[data-testid=crm-table]"); };
    // dnd-kit активируется последовательными pointermove: один прыжок (dragTo) сенсор не поднимает
    const dragCard = async (leadId, toStage) => {
      const card = page.locator(`[data-testid=crm-kanban-card][data-lead=${leadId}]`);
      const col = page.locator(`[data-testid=crm-kanban-col][data-stage=${toStage}]`);
      // после предыдущего dnd канбан перерисовывается (refetch) — карточка на миг отвязана, ждём её возврата
      await card.waitFor({ state: "visible", timeout: 8000 });
      const box = await card.boundingBox(), tbox = await col.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(
          box.x + box.width / 2 + ((tbox.x + tbox.width / 2) - (box.x + box.width / 2)) * (i / 12),
          box.y + box.height / 2 + ((tbox.y + tbox.height / 2) - (box.y + box.height / 2)) * (i / 12)
        );
        await page.waitForTimeout(30);
      }
      await page.mouse.up();
    };

    // ---------- loading: скелетоны, затем данные
    await reset(); await setFaults({ latencyMs: 1500 });
    await page.goto(BASE + "/crm", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, данных ещё нет (бейдж синхронизации скрыт)", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=crm-journal-card]").count()) === 0 && (await page.locator("[data-testid=crm-sync]").count()) === 0);
    await page.waitForSelector("[data-testid=crm-journal-card]", { timeout: 8000 });
    await waitFor(async () => (await page.locator("[aria-busy=true]").count()) === 0, { timeout: 10000 });
    check("loading → success: скелетоны исчезли, журнал с событиями", (await page.locator("[aria-busy=true]").count()) === 0 && (await page.locator("[data-testid=crm-journal-row]").count()) > 0);
    await setFaults({ latencyMs: 0 });

    // ---------- журнал: вид по умолчанию, инспектор первого лида воронки
    await reset(); await open();
    check("журнал: активен вид «Журнал», воронка «Продажи»", (await page.locator("[data-testid=crm-view-switch][data-view=journal]").getAttribute("aria-pressed")) === "true" && (await page.locator("[data-testid=crm-funnel-select]").inputValue()) === "fn-sales");
    check("инспектор по умолчанию: первый лид воронки LD-1042 «Демо-клиент А», стадия «Новые»", (await page.locator("[data-testid=crm-inspector]").innerText()).includes("Демо-клиент А") && /LD-1042/.test(await page.locator("[data-testid=crm-inspector-kv]").innerText()) && (await page.locator("[data-testid=crm-inspector-stage]").innerText()).includes("Новые"));
    const rowsTotal = await page.locator("[data-testid=crm-journal-row]").count();
    check(`журнал fn-sales: ${rowsTotal} событий, есть и ИИ, и Менеджер`, rowsTotal >= 6 && (await page.locator("[data-testid=crm-journal-row][data-actor=ai]").count()) > 0 && (await page.locator("[data-testid=crm-journal-row][data-actor=human]").count()) > 0);
    const syncText = await page.locator("[data-testid=crm-sync]").innerText();
    check("бейдж синхронизации: статусы из справочника интеграций (amoCRM ОК, Bitrix24 ОК)", /Синхр\. amoCRM: ОК · Bitrix24: ОК/.test(syncText));

    // ---------- смена стадии списком в инспекторе
    await page.locator("[data-testid=crm-lead-stage-select]").selectOption("work");
    await waitFor(async () => (await storageLeads()).find((l) => l.id === "LD-1042")?.stageId === "work");
    const moved = await storageLeads();
    check("стадия изменена: событие «Перемещён в стадию «В работе»», активность обновлена", (moved.find((l) => l.id === "LD-1042")?.events || []).some((e) => e.text === "Перемещён в стадию «В работе»") && moved.find((l) => l.id === "LD-1042")?.lastActivity);
    check("фидбек «Стадия изменена»", (await page.locator("[data-testid=crm-feedback]").innerText()).includes("Стадия изменена"));
    await page.locator("[data-testid=crm-lead-stage-select]").selectOption("new");
    await waitFor(async () => (await storageLeads()).find((l) => l.id === "LD-1042")?.stageId === "new");

    // ---------- выбор лида из журнала и связи с разделами
    await page.locator("[data-testid=crm-journal-lead-link]", { hasText: "LD-1037" }).first().click();
    check("клик по ссылке события открывает лид в инспекторе", (await page.locator("[data-testid=crm-inspector]").innerText()).includes("Демо-клиент Г"));
    check("«Открыть диалог» у лида без диалога — предупреждение «Для этого лида нет диалога»", await page.locator("[data-testid=crm-open-dialog]").click().then(() => page.locator("[data-testid=crm-feedback]").innerText()).then((t) => t.includes("Для этого лида нет диалога")));
    await page.locator("[data-testid=crm-journal-lead-link]", { hasText: "LD-1042" }).first().click();
    await page.locator("[data-testid=crm-open-dialog]").click();
    await page.waitForURL("**/dialogs");
    check("«Открыть диалог» у лида с диалогом ведёт на /dialogs", page.url().endsWith("/dialogs"));
    await open();
    await page.locator("[data-testid=crm-make-doc]").click();
    await page.waitForSelector("[data-testid=docs-new-type]");
    check("«Документ» активен и открывает модалку с клиентом из лида", (await page.locator("[data-testid=docs-new-client]").inputValue()).trim() === (await page.locator("[data-testid=crm-inspector]").innerText()).split("\n")[0].trim());
    await page.locator("[data-testid=docs-new-cancel]").click();

    // ---------- канбан: колонки, счётчики, перетаскивание, клик
    await switchView("kanban");
    const counts = await page.evaluate(() => [...document.querySelectorAll("[data-testid=crm-kanban-col]")].map((c) => [c.getAttribute("data-stage"), Number(c.querySelector("[data-testid=crm-kanban-col-count]")?.textContent || "0")]));
    check("канбан: 4 колонки стадий, по одному лиду (fn-sales)", counts.length === 4 && JSON.stringify(counts) === JSON.stringify([["new", 1], ["work", 1], ["qual", 1], ["deal", 1]]), JSON.stringify(counts));
    await dragCard("LD-1042", "qual");
    await waitFor(async () => (await storageLeads()).find((l) => l.id === "LD-1042")?.stageId === "qual");
    const afterDrag = await storageLeads();
    check("dnd: карточка переместилась в «Квалификация», событие в ленте", (afterDrag.find((l) => l.id === "LD-1042")?.events || []).some((e) => e.text === "Перемещён в стадию «Квалификация»"));
    await dragCard("LD-1042", "new");
    await waitFor(async () => (await storageLeads()).find((l) => l.id === "LD-1042")?.stageId === "new");
    check("dnd: возврат в «Новые»", true);
    await page.locator("[data-testid=crm-kanban-card][data-lead=LD-1041]").click();
    await page.waitForSelector("[data-testid=crm-journal-card]");
    check("клик по карточке канбана открывает журнал с этим лидом", (await page.locator("[data-testid=crm-inspector]").innerText()).includes("Демо-клиент Б"));

    // ---------- воронки и «КРИТИЧНО»
    await switchView("kanban");
    await page.locator("[data-testid=crm-funnel-select]").selectOption("fn-support");
    await page.waitForSelector("[data-testid=crm-kanban-card][data-lead=LD-1035]");
    check("воронка «Поддержка»: 2 лида, у лида с «Эскалация» метка «КРИТИЧНО»", (await page.locator("[data-testid=crm-kanban-card]").count()) === 2 && (await page.locator("[data-testid=crm-kanban-critical]").count()) === 1);
    await page.locator("[data-testid=crm-funnel-select]").selectOption("fn-sales");

    // ---------- таблица: фильтр, сортировка, выбор строки
    await switchView("table");
    check("таблица: 4 строки лидов fn-sales", (await page.locator("[data-testid=crm-table-row]").count()) === 4);
    await page.locator("[data-testid=crm-stage-filter][data-filter=qual]").click();
    check("фильтр по стадии: остаётся LD-1039 (aria-pressed)", (await page.locator("[data-testid=crm-table-row]").count()) === 1 && (await page.locator("[data-testid=crm-table-row]").getAttribute("data-lead")) === "LD-1039" && (await page.locator("[data-testid=crm-stage-filter][data-filter=qual]").getAttribute("aria-pressed")) === "true");
    await page.locator("[data-testid=crm-stage-filter][data-filter=all]").click();
    await page.locator("[data-testid=crm-sort-btn]").click();
    const namesSorted = await page.locator("[data-testid=crm-table-row] td:nth-child(2)").allInnerTexts();
    check("сортировка «Имя»: строки по алфавиту", JSON.stringify(namesSorted) === JSON.stringify([...namesSorted].sort((a, b) => a.localeCompare(b, "ru"))), JSON.stringify(namesSorted));
    await page.locator("[data-testid=crm-sort-btn]").click();
    await page.locator("[data-testid=crm-sort-btn]").click();
    const idsSorted = await page.locator("[data-testid=crm-table-row] td:nth-child(1)").allInnerTexts();
    check("сортировка «Активность» → снова «ID»: порядок LD-1037 … LD-1042 (числовой)", idsSorted[0] === "LD-1037" && idsSorted.at(-1) === "LD-1042", JSON.stringify(idsSorted));
    await page.locator("[data-testid=crm-table-row][data-lead=LD-1037]").click();
    await page.waitForSelector("[data-testid=crm-journal-card]");
    check("клик по строке таблицы открывает лид в журнале", (await page.locator("[data-testid=crm-inspector]").innerText()).includes("Демо-клиент Г"));
    await page.locator("[data-testid=crm-funnel-select]").selectOption("fn-support");
    await switchView("table");
    await page.locator("[data-testid=crm-stage-filter][data-filter=deal]").click();
    check("пустая стадия: «Нет лидов на выбранной стадии»", (await page.locator("[data-testid=crm-table-empty]").innerText()).includes("Нет лидов"));
    await page.locator("[data-testid=crm-funnel-select]").selectOption("fn-sales");

    // ---------- создание лида
    await page.locator("[data-testid=crm-new-lead-btn]").click();
    await page.waitForSelector("[data-testid=crm-new-lead-name]");
    await page.locator("[data-testid=crm-new-lead-name]").fill("ООО Ромашка");
    await page.locator("[data-testid=crm-new-lead-channel]").selectOption("email");
    await page.locator("[data-testid=crm-new-lead-note]").fill("Проверка создания лида");
    await page.locator("[data-testid=crm-new-lead-save]").click();
    await waitFor(async () => (await storageLeads()).some((l) => l.name === "ООО Ромашка"));
    const created = (await storageLeads()).find((l) => l.name === "ООО Ромашка");
    check("лид создан: LD-1043, стадия «new», событие «Лид создан вручную», канал email", !!created && created.id === "LD-1043" && created.stageId === "new" && created.channel === "email" && (created.events || []).some((e) => e.text === "Лид создан вручную"));
    check("после создания: фидбек, журнал с новым лидом в инспекторе", (await page.locator("[data-testid=crm-feedback]").innerText()).includes("LD-1043") && (await page.locator("[data-testid=crm-inspector]").innerText()).includes("ООО Ромашка"));

    // ---------- удаление лида с подтверждением
    const beforeDelete = (await storageLeads()).length;
    await page.locator("[data-testid=crm-delete-lead]").click();
    await page.waitForSelector("[data-testid=crm-delete-confirm]");
    check("подтверждение: текст называет лид и id", /ООО Ромашка/.test(await page.locator("[data-testid=crm-delete-text]").innerText()) && /LD-1043/.test(await page.locator("[data-testid=crm-delete-text]").innerText()));
    await page.locator("[data-testid=crm-delete-cancel]").click();
    check("«Отмена» не удаляет", (await storageLeads()).length === beforeDelete);
    await page.locator("[data-testid=crm-delete-lead]").click();
    await page.waitForSelector("[data-testid=crm-delete-confirm]");
    await page.locator("[data-testid=crm-delete-confirm]").click();
    await waitFor(async () => (await storageLeads()).length === beforeDelete - 1);
    await page.waitForFunction(() => document.querySelector("[data-testid=crm-feedback]")?.textContent?.includes("Лид удалён"), undefined, { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector("[data-testid=crm-inspector]")?.textContent?.includes("Демо-клиент А"), undefined, { timeout: 8000 });
    check("после «Удалить»: лида нет на сервере, фидбек «Лид удалён», инспектор — первый лид воронки (как в прототипе)", !(await storageLeads()).some((l) => l.id === "LD-1043") && (await page.locator("[data-testid=crm-feedback]").innerText()).includes("Лид удалён") && (await page.locator("[data-testid=crm-inspector]").innerText()).includes("Демо-клиент А"));

    // ---------- deep-link
    await open("/crm?lead=LD-1039");
    await page.waitForFunction(() => document.querySelector("[data-testid=crm-inspector]")?.textContent?.includes("Демо-клиент В"), undefined, { timeout: 8000 });
    check("deep-link ?lead=LD-1039 открывает лида в инспекторе", (await page.locator("[data-testid=crm-inspector]").innerText()).includes("Демо-клиент В"));
    await open("/crm?lead=LD-1041&view=table");
    check("deep-link ?view=table открывает таблицу", (await page.locator("[data-testid=crm-table]").count()) === 1);

    // ---------- переименование
    check("переименование: «ИИ-» на странице нет", !(await page.locator("body").innerText()).includes("ИИ-"));

    // ---------- overflow и контраст
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const v of ["journal", "kanban", "table"]) {
          await open(); await switchView(v);
          const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          if (o[0] > o[1]) over.push(`crm/${v} ${theme} ${w}: ${o[0]}>${o[1]}`);
        }
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах (3 вида)" + (over.length ? " [" + over.slice(0, 4).join("; ") + "]" : ""), over.length === 0);
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
    code = done("CRM");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
