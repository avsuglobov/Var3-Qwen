/* tasks.check.mjs — браузерные проверки раздела «Задачи» (этап 3, группа 6): KPI (Всего/Активные/
   Выполнено/Просрочено — просрочка вычисляется от текущей даты), список с чек-тогглом («Задача
   выполнена»/«вернуть в работу»), удаление без подтверждения с ролью=status «Задача удалена»
   (как в прототипе), фильтры Все/Активные/Выполненные и пустое состояние, создание задачи
   (пустое название → «Введите название задачи», TK-7), доска приоритетов на dnd-kit (3 колонки,
   счётчики, перетаскивание карточки мышью с записью в localStorage), overflow 375…1920 × 2 темы
   (список и доска), контраст AA, внешние запросы, консоль.
   Запуск: npm run build && node e2e/tasks.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/tasks");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/tasks", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = () => prepare(() => localStorage.clear());
    const open = async (url = "/tasks") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=tasks-list], [data-testid=tasks-board], main [role=alert]"); };
    const storageTasks = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").TASKS || []; } catch { return []; } });
    const todayISO = () => { const t = new Date(); const p = (n) => (n < 10 ? "0" + n : "" + n); return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate()); };
    const feedback = () => page.locator("[data-testid=tasks-feedback]").innerText().catch(() => "");
    const switchView = async (v) => { await page.locator(`[data-testid=tasks-view][data-value=${v}]`).click(); await page.waitForSelector(v === "list" ? "[data-testid=tasks-list]" : "[data-testid=tasks-board]"); };
    const setFilter = async (f) => { await page.locator(`[data-testid=tasks-filter][data-value=${f}]`).click(); await page.waitForTimeout(120); };
    // dnd-kit активируется последовательными pointermove (как dragCard в crm.check.mjs)
    const dragCard = async (taskId, toPriority) => {
      const card = page.locator(`[data-testid=tasks-card][data-task=${taskId}]`);
      const col = page.locator(`[data-testid=tasks-col][data-priority=${toPriority}]`);
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
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1500"));
    await page.goto(BASE + "/tasks", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны KPI, списка ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=tasks-list]").count()) === 0);
    await page.waitForSelector("[data-testid=tasks-list]", { timeout: 8000 });
    check("loading → success: скелетоны исчезли, список задач заполнен", (await page.locator("[aria-busy=true]").count()) === 0 && (await page.locator("[data-testid=tasks-row]").count()) === 6);

    // ---------- KPI: просрочка считается от текущей даты
    await reset(); await open();
    const today = todayISO();
    const seedTasks = await storageTasks();
    const expOverdue = seedTasks.filter((t) => !t.done && t.due && t.due < today).length;
    check("шапка: «Задачи», «Список/Доска», фильтры и «Новая задача»", (await page.locator("h1").innerText()) === "Задачи" && (await page.locator("[data-testid=tasks-view]").count()) === 2 && (await page.locator("[data-testid=tasks-filter]").count()) === 3 && (await page.locator("[data-testid=tasks-create-btn]").count()) === 1);
    check("KPI: Всего 6, Активные 5, Выполнено 1", (await page.locator("[data-testid=tasks-kpi-total]").innerText()) === "6" && (await page.locator("[data-testid=tasks-kpi-active]").innerText()) === "5" && (await page.locator("[data-testid=tasks-kpi-done]").innerText()) === "1");
    check("KPI Просрочено = " + expOverdue + " (расчёт от " + today + "), точка у заголовка", (await page.locator("[data-testid=tasks-kpi-overdue]").innerText()) === String(expOverdue) && expOverdue >= 1);
    const row1 = await page.locator("[data-testid=tasks-row][data-task=TK-1]").innerText();
    check("TK-1: «Подготовить КП…», Высокий, AI-Продажи, тег Документы", row1.includes("Подготовить КП") && row1.includes("Высокий") && row1.includes("AI-Продажи") && row1.includes("Документы"));
    check("TK-1 просрочен: «Просрочено · дата» с точкой, не только цвет", row1.includes("Просрочено · " + (await storageTasks()).find((t) => t.id === "TK-1").due));

    // ---------- toggle: выполнить и вернуть
    await page.locator("[data-testid=tasks-toggle][data-task=TK-3]").click();
    await page.waitForTimeout(400);
    check("toggle TK-3: «Задача выполнена», KPI Активные 4 / Выполнено 2", (await feedback()).includes("Задача выполнена") && (await page.locator("[data-testid=tasks-kpi-active]").innerText()) === "4" && (await page.locator("[data-testid=tasks-kpi-done]").innerText()) === "2");
    check("toggle записан в localStorage (TK-3 done)", (await storageTasks()).find((t) => t.id === "TK-3")?.done === true);
    await page.locator("[data-testid=tasks-toggle][data-task=TK-3]").click();
    await page.waitForTimeout(400);
    check("возврат TK-3: «Задача возвращена в работу»", (await feedback()).includes("Задача возвращена в работу") && (await storageTasks()).find((t) => t.id === "TK-3")?.done === false);

    // ---------- создание задачи (до удалений: max сида TK-6 → TK-7)
    await page.locator("[data-testid=tasks-create-btn]").click();
    await page.waitForSelector("[data-testid=tasks-new-title]");
    await page.locator("[data-testid=tasks-new-save]").click();
    check("пустое название: «Введите название задачи» (role=alert), задача не создана", (await page.locator("[data-testid=tasks-new-error]").innerText()).includes("Введите название задачи") && (await page.locator("[data-testid=tasks-row]").count()) === 6);
    await page.locator("[data-testid=tasks-new-title]").fill("Проверить КП поставщика");
    await page.locator("[data-testid=tasks-new-priority]").selectOption("low");
    await page.locator("[data-testid=tasks-new-assignee]").selectOption("Бухгалтерия");
    await page.locator("[data-testid=tasks-new-save]").click();
    await page.waitForSelector("[data-testid=tasks-row][data-task=TK-7]", { timeout: 5000 });
    check("создание TK-7: «Задача создана», в списке с исполнителем Бухгалтерия, Всего 7", (await feedback()).includes("Задача создана") && (await page.locator("[data-testid=tasks-row][data-task=TK-7]").innerText()).includes("Бухгалтерия") && (await page.locator("[data-testid=tasks-kpi-total]").innerText()) === "7");
    check("TK-7 записан в localStorage (TK-7, не выполнена)", (await storageTasks()).find((t) => t.id === "TK-7")?.done === false);

    // ---------- удаление без подтверждения (как в прототипе)
    await page.locator("[data-testid=tasks-delete][data-task=TK-6]").click();
    await page.waitForSelector("[data-testid=tasks-row][data-task=TK-6]", { state: "detached", timeout: 5000 });
    check("удаление TK-6: «Задача удалена», строка исчезла, Всего 6", (await feedback()).includes("Задача удалена") && (await page.locator("[data-testid=tasks-row]").count()) === 6);

    // ---------- фильтры и пустое состояние
    await setFilter("done");
    check("фильтр «Выполненные»: только TK-5 (выполнена в сиде)", (await page.locator("[data-testid=tasks-row]").count()) === 1 && (await page.locator("[data-testid=tasks-row][data-task=TK-5]").count()) === 1);
    await page.locator("[data-testid=tasks-delete][data-task=TK-5]").click();
    await page.waitForSelector("[data-testid=tasks-row][data-task=TK-5]", { state: "detached", timeout: 5000 });
    check("пустое состояние: «Нет задач» после удаления последней выполненной", (await page.locator("[data-testid=tasks-list]").innerText()).includes("Нет задач"));
    await setFilter("active");
    check("фильтр «Активные» не пуст", (await page.locator("[data-testid=tasks-row]").count()) >= 3);
    await setFilter("all");

    // ---------- доска: колонки, счётчики, перетаскивание, запись в localStorage
    await switchView("board");
    check("доска: 3 колонки приоритетов (Высокий/Средний/Низкий) со счётчиками", (await page.locator("[data-testid=tasks-col]").count()) === 3 && (await page.locator("[data-testid=tasks-col-count]").count()) === 3);
    const countHighBefore = await page.locator("[data-testid=tasks-col][data-priority=high] [data-testid=tasks-col-count]").innerText();
    const countMedBefore = await page.locator("[data-testid=tasks-col][data-priority=med] [data-testid=tasks-col-count]").innerText();
    await dragCard("TK-2", "med");
    await page.waitForTimeout(500);
    check("перетаскивание TK-2 из «Высокого» в «Средний»: счётчики обновились", (await page.locator("[data-testid=tasks-col][data-priority=high] [data-testid=tasks-col-count]").innerText()) === String(Number(countHighBefore) - 1) && (await page.locator("[data-testid=tasks-col][data-priority=med] [data-testid=tasks-col-count]").innerText()) === String(Number(countMedBefore) + 1));
    check("приоритет записан в localStorage (TK-2 med), «Приоритет изменён»", (await storageTasks()).find((t) => t.id === "TK-2")?.priority === "med" && (await feedback()).includes("Приоритет изменён"));
    await dragCard("TK-1", "med");
    await page.waitForTimeout(500);
    check("пустая колонка «Высокий» показывает «Перетащите карточку сюда»", (await page.locator("[data-testid=tasks-col][data-priority=high]").innerText()).includes("Перетащите карточку сюда"));

    // ---------- overflow и контраст
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const v of ["list", "board"]) {
          await open(); await switchView(v);
          const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          if (o[0] > o[1]) over.push(`tasks/${v} ${theme} ${w}: ${o[0]}>${o[1]}`);
        }
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах (список и доска)" + (over.length ? " [" + over.slice(0, 4).join("; ") + "]" : ""), over.length === 0);
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
    code = done("Задачи");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
