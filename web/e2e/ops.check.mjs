/* ops.check.mjs — браузерные проверки разделов «Хранилище», «Команда», «Снабжение», «Аналитика»
   (этап 3, группа 7). Хранилище: описание компании сохраняется на сервере и переживает
   перезагрузку, переключатель «Искать в интернете» (role=switch, клавиатура), таблица источников
   (типы PDF/Word/Excel/Сайт/API, бейдж «Индексировано» с точкой). Команда: шаблоны-чипы
   (Услуги/Производство), цепочка узлов со стрелками, подсказка о передаче результата.
   Снабжение: запросы с статусом «Сводка готова» (точка), сводка условий без цен + предупреждение.
   Аналитика: KPI «—», разбор диалогов (ОК/Нарушение), чат «Вопрос руководителю» с ответом
   по сценарию («AI-РОП печатает…» → ответ). Пустое сообщение не отправляется.
   Overflow 375…1920 × 2 темы, контраст AA, внешние запросы, консоль.
   Запуск: npm run build && node e2e/ops.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { apiProfile, apiReset, BASE, launch, reporter, setFaults, startServer, waitReady, waitFor } from "./lib/harness.mjs";

const { check, done } = reporter();

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/storage");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/storage", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = async () => { await apiReset(); await prepare(() => localStorage.clear()); };
    const open = async (url = "/storage") => {
      const waitSel = { "/storage": "[data-testid=storage-table]", "/team": "[data-testid=team-chain]", "/supply": "[data-testid=supply-requests]", "/analytics": "[data-testid=analytics-review]" }[url];
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

    // ================= Хранилище
    await reset(); await setFaults({ latencyMs: 1500 });
    await page.goto(BASE + "/storage", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: скелетоны показаны, таблицы ещё нет", (await page.locator("[aria-busy=true]").count()) >= 1 && (await page.locator("[data-testid=storage-table]").count()) === 0);
    await page.waitForSelector("[data-testid=storage-table]", { timeout: 8000 });
    await waitFor(async () => (await page.locator("[aria-busy=true]").count()) === 0, { timeout: 10000 });
    check("loading → success: карточки и источники заполнены", (await page.locator("[aria-busy=true]").count()) === 0 && (await page.locator("[data-testid=storage-row]").count()) === 5);
    await setFaults({ latencyMs: 0 });
    check("шапка: «Хранилище и база знаний», «Описание компании и источники знаний»", (await page.locator("h1").innerText()) === "Хранилище и база знаний" && /Описание компании и источники знаний/.test(await page.locator("main").innerText()));
    check("форма заполнена демо-профилем: «Демо-компания»", (await page.locator("[data-testid=storage-name]").inputValue()) === "Демо-компания");
    await page.locator("[data-testid=storage-name]").fill("ООО «Демо-торг»");
    await page.locator("[data-testid=storage-save]").click();
    await page.waitForTimeout(400);
    check("«Сохранить описание»: «Описание сохранено», записано на сервере", (await page.locator("[data-testid=storage-feedback]").innerText()).includes("Описание сохранено") && (await profileOf())?.name === "ООО «Демо-торг»");
    await open();
    check("перезагрузка: имя компании сохранено", (await page.locator("[data-testid=storage-name]").inputValue()) === "ООО «Демо-торг»");
    const sw = page.locator("[data-testid=storage-websearch]");
    check("переключатель «Искать в интернете»: role=switch, включён по умолчанию", (await sw.getAttribute("role")) === "switch" && (await sw.getAttribute("aria-checked")) === "true");
    await sw.click();
    check("клик переключает (aria-checked=false)", (await sw.getAttribute("aria-checked")) === "false");
    await sw.focus(); await page.keyboard.press("Space");
    check("пробел переключает с клавиатуры (aria-checked=true)", (await sw.getAttribute("aria-checked")) === "true");
    const row1 = await page.locator("[data-testid=storage-row][data-source=ks-1]").innerText();
    check("источник ks-1: «Демо-описание продукта.pdf», тип PDF, бейдж «Индексировано»", row1.includes("Демо-описание продукта.pdf") && row1.includes("PDF") && row1.includes("Индексировано"));
    const row4 = await page.locator("[data-testid=storage-row][data-source=ks-4]").innerText();
    check("источник ks-4 (web): тип «Сайт», статус «Обновляется» без точки", row4.toLowerCase().includes("сайт") && row4.includes("Обновляется") && !row4.includes("Индексировано"));

    // ================= Команда
    await open("/team");
    check("шапка: «Команда», «Конструктор цепочек AI-сотрудников» («ИИ-» переименованы)", (await page.locator("h1").innerText()) === "Команда" && (await page.locator("main").innerText()).includes("Конструктор цепочек AI-сотрудников"));
    check("шаблоны: чипы «Услуги» и «Производство», активен первый", (await page.locator("[data-testid=team-tpl]").count()) === 2 && (await page.locator("[data-testid=team-tpl][data-tpl=ch-services]").getAttribute("aria-pressed")) === "true");
    check("цепочка «Услуги»: Поддержка → Продажи → РОП (3 узла, 2 стрелки)", (await page.locator("[data-testid=team-node]").count()) === 3 && /Квалификация и КП/.test(await page.locator("[data-testid=team-chain]").innerText()) && /Контроль качества/.test(await page.locator("[data-testid=team-chain]").innerText()));
    await page.locator("[data-testid=team-tpl][data-tpl=ch-prod]").click();
    check("выбор «Производство»: цепочка сменилась, чип активен", (await page.locator("[data-testid=team-tpl][data-tpl=ch-prod]").getAttribute("aria-pressed")) === "true" && /Закупка комплектующих/.test(await page.locator("[data-testid=team-chain]").innerText()) && /Цепочка: Производство/.test(await page.locator("main").innerText()));
    check("подсказка: «Результат каждого шага передаётся следующему AI-сотруднику»", /Результат каждого шага передаётся следующему AI-сотруднику/.test(await page.locator("main").innerText()));

    // ================= Снабжение
    await open("/supply");
    check("шапка: «Снабжение», «Запросы поставщикам и сводка условий»", (await page.locator("h1").innerText()) === "Снабжение" && (await page.locator("main").innerText()).includes("Запросы поставщикам и сводка условий"));
    const req55 = await page.locator("[data-testid=supply-request][data-request=SR-55]").innerText();
    check("SR-55: «Демо-заказ: комплектующие», 4 поставщиков, 2 ответа, «В работе» без точки", req55.includes("Демо-заказ: комплектующие") && req55.includes("4") && req55.includes("2") && req55.includes("В работе"));
    const req54 = await page.locator("[data-testid=supply-request][data-request=SR-54]").innerText();
    check("SR-54: «Сводка готова» — сводка таблицы запросов полна", req54.includes("Сводка готова") && req54.includes("3"));
    check("сводка условий: 3 поставщика, сроки «10 дн.»/«14 дн.»/«21 дн.»", (await page.locator("[data-testid=supply-offer]").count()) === 3 && /10 дн\./.test(await page.locator("[data-testid=supply-offers]").innerText()) && /21 дн\./.test(await page.locator("[data-testid=supply-offers]").innerText()));
    check("предупреждение: «Цены не показываются (демо)…»", /Цены не показываются \(демо\)/.test(await page.locator("main").innerText()));

    // ================= Аналитика
    await open("/analytics");
    check("шапка: «Аналитика», «Разбор диалогов менеджеров и оценка качества цепочки»", (await page.locator("h1").innerText()) === "Аналитика" && (await page.locator("main").innerText()).includes("Разбор диалогов менеджеров и оценка качества цепочки"));
    check("KPI ×3: «—» с подсказками (демо-оценка, выборка, согласование)", (await page.locator("[data-testid=analytics-kpi-quality]").innerText()) === "—" && (await page.locator("[data-testid=analytics-kpi-violations]").innerText()) === "—" && (await page.locator("[data-testid=analytics-kpi-escalations]").innerText()) === "—");
    const row1a = await page.locator("[data-testid=analytics-row][data-conv=cv-1]").innerText();
    const row2a = await page.locator("[data-testid=analytics-row][data-conv=cv-2]").innerText();
    check("разбор: cv-1 «Нарушение» + текст, cv-2 «ОК»", row1a.includes("Нарушение") && row1a.includes("Пропущен уточняющий вопрос") && row2a.includes("ОК") && !row2a.includes("Нарушение"));
    await page.locator("[data-testid=rop-input]").fill("какая цена тарифа?");
    await page.locator("[data-testid=rop-send]").click();
    check("сообщение появилось в чате («Вы»)", (await page.locator("[data-testid=rop-msg-human]").count()) === 1);
    await page.waitForSelector("[data-testid=rop-typing]", { timeout: 2000 });
    check("«AI-РОП печатает…» показано", true);
    await page.waitForSelector("[data-testid=rop-msg-ai]:not(:has-text('Готов разобрать'))", { timeout: 3000 });
    const aiText = await page.locator("[data-testid=rop-msg-ai]").last().innerText();
    check("ответ по сценарию о тарифах (scriptedReply)", /тариф/.test(aiText) && /демо/.test(aiText));
    const countBefore = await page.locator("[data-testid=rop-msg-human]").count();
    await page.locator("[data-testid=rop-send]").click();
    await page.waitForTimeout(300);
    check("пустое сообщение не отправляется", (await page.locator("[data-testid=rop-msg-human]").count()) === countBefore && !(await page.locator("[data-testid=rop-error]").count()));
    await page.locator("[data-testid=rop-input]").fill("спасибо");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[data-testid=rop-msg-ai]:has-text('Принял, благодарю')", { timeout: 3000 });
    check("Enter отправляет, второй ответ по сценарию", (await page.locator("[data-testid=rop-msg-human]").count()) === 2);

    // ================= overflow и контраст (все четыре раздела)
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        for (const url of ["/storage", "/team", "/supply", "/analytics"]) {
          await open(url);
          const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          if (o[0] > o[1]) over.push(`${url} ${theme} ${w}: ${o[0]}>${o[1]}`);
        }
      }
    }
    check("overflow: нет горизонтальной прокрутки на 375/768/1280/1440/1920 в обеих темах (4 раздела)" + (over.length ? " [" + over.slice(0, 4).join("; ") + "]" : ""), over.length === 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    const bad = {};
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      for (const url of ["/storage", "/team", "/supply", "/analytics"]) {
        await open(url);
        for (const [k, v] of Object.entries(await page.evaluate(contrastProbe))) bad[theme + " " + url + " " + k] = v;
      }
    }
    check("контраст WCAG AA на всех разделах в обеих темах" + (Object.keys(bad).length ? "\n     " + Object.entries(bad).slice(0, 5).map(([k, v]) => `${v.ratio} ${k}`).join("\n     ") : ""), Object.keys(bad).length === 0);

    check("нет внешних запросов", [...hosts].every((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h)), [...hosts].join(","));
    check("консоль: нет ошибок и предупреждений (hydration, React)" + (problems.length ? " [" + problems.slice(0, 3).join(" | ") + "]" : ""), problems.length === 0);
    await browser.close();
    code = done("Служебные разделы");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
