/* leads.check.mjs — браузерные проверки раздела «Лиды и автокасания» (этап 3, группа 4):
   dropzone с лимитами, шаблон CSV, импорт .csv и .xlsx с сопоставлением колонок (автоподбор,
   своё сопоставление, «не использовать», блокировка без колонки «Имя клиента»), пропуск строк
   без имени и повторов, пакетное создание с воронкой/агентом/каналом/стадией, заметка из колонок,
   «Открыть в CRM» (deep-link таблицы воронки), KPI сценария реактивации, ошибки чтения файла
   (role=alert) с восстановлением, overflow, контраст, консоль.
   Запуск: npm run build && node e2e/leads.check.mjs */
import { contrastProbe } from "./lib/contrast-probe.mjs";
import { BASE, launch, reporter, startServer, waitReady } from "./lib/harness.mjs";
import { buildXlsx } from "../tests/lib/xlsx-build.mjs";

const { check, done } = reporter();

const HEAD = ["Имя клиента", "Телефон", "E-mail", "Дата последнего контакта", "Комментарий"];
const ROWS = [
  ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", 45901, "Хочет демо"],
  [{ rich: ["Анна ", "Смирнова"] }, "", "anna@demo.test", 45920, ""],
  ["", "+7 900 000-00-03", "", "", "без имени"],
  ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "", ""],
  ['<b id="pwn">XSS</b>', "", "", "", "x<script>1</script>"],
  [{ inline: "Пётр Инлайн" }, "+7 900 000-00-06", "", "", ""]
];
const XLSX = buildXlsx([HEAD, ...ROWS]);
const CSV = Buffer.from("ФИО;Телефон;Email\nОльга;+7 5;o@demo.test\n", "utf8");

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/leads");
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [], hosts = new Set();
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
    page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });

    const origin = async () => { if (!page.url().startsWith("http")) await page.goto(BASE + "/leads", { waitUntil: "networkidle" }); };
    const prepare = async (fn, arg) => { await origin(); await page.evaluate(fn, arg); };
    const reset = () => prepare(() => localStorage.clear());
    const open = async (url = "/leads") => { await page.goto(BASE + url, { waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=leads-import-card]"); };
    const dropzone = page.locator("[data-testid=leads-dropzone]");
    const feedback = page.locator("[data-testid=leads-feedback]");
    const leadsCount = async () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").LEADS || []).length; } catch { return 0; } });
    const upload = async (buffer, name, mime) => { await page.locator("[data-testid=leads-file-input]").setInputFiles({ name, mimeType: mime || "application/octet-stream", buffer }); };

    // ---------- loading: скелетоны, затем dropzone
    await reset(); await prepare(() => localStorage.setItem("aiws-mock-latency", "1500"));
    await page.goto(BASE + "/leads", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[aria-busy=true]");
    check("loading: показаны скелетоны, импорт ещё не готов", (await page.locator("[aria-busy=true]").count()) >= 1 && (await dropzone.count()) === 0);
    await page.waitForSelector("[data-testid=leads-dropzone]", { timeout: 8000 });
    check("loading → success: скелетоны исчезли, показан dropzone", (await page.locator("[aria-busy=true]").count()) === 0 && (await dropzone.count()) === 1);

    // ---------- success: dropzone с лимитами и шаблон
    await reset(); await open();
    const dzText = await dropzone.innerText();
    check("dropzone: подсказка про .xlsx/.csv и лимиты (2000 строк и 5 МБ)", /\.xlsx или \.csv/.test(dzText) && /2000 строк и 5 МБ/.test(dzText));
    await page.locator("[data-testid=leads-template-btn]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=leads-feedback]")?.textContent?.includes("Шаблон скачан"));
    check("шаблон: тост «Шаблон скачан (CSV, открывается в Excel)»", /Шаблон скачан/.test(await feedback.innerText()));

    // ---------- импорт .csv: шаг сопоставления и XSS-экранирование
    const before = await leadsCount();
    await upload(CSV, "drop.csv", "text/csv");
    await page.waitForSelector("[data-testid=leads-map]");
    check("csv: шаг сопоставления с именем файла и заголовками", /drop\.csv/.test(await page.locator("[data-testid=leads-map]").innerText()) && /ФИО/.test(await page.locator("[data-testid=leads-map]").innerText()));
    check("csv: селекты колонок предзаполнены автоподбором (ФИО→имя)", JSON.stringify(await page.locator("[data-testid=leads-map-select]").evaluateAll((els) => els.map((e) => e.value))) === JSON.stringify(["name", "phone", "email"]));
    await page.locator("[data-testid=leads-funnel-select]").selectOption("fn-support");
    await page.locator("[data-testid=leads-channel-select]").selectOption("email");
    await page.locator("[data-testid=leads-do-import]").click();
    await page.waitForSelector("[data-testid=leads-done]", { timeout: 8000 });
    const doneText = await page.locator("[data-testid=leads-done]").innerText();
    check("csv: «Импортировано лидов: 1», воронка «Поддержка»", /Импортировано лидов: 1/.test(doneText) && /Поддержка/.test(doneText));
    const last = await page.evaluate(() => (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").LEADS || []).at(-1));
    check("csv: лид в fn-support/ag-support, канал email, стадия new, событие «Импортирован»", last?.funnelId === "fn-support" && last?.agentId === "ag-support" && last?.channel === "email" && last?.stageId === "new" && /Импортирован/.test(last?.events?.[0]?.text ?? ""), JSON.stringify(last));
    check("csv: заметка собрана из сопоставленных колонок", last?.name === "Ольга" && last?.note === "Телефон: +7 5 · Email: o@demo.test", JSON.stringify(last?.note));
    check("csv: данные сохранены (переживают перезагрузку)", (await leadsCount()) === before + 1);

    // ---------- импорт .xlsx: автоподбор, пропуск без имени и повторов, серийные даты
    await reset(); await open();
    const cnt0 = await leadsCount();
    await upload(XLSX, "база.xlsx");
    await page.waitForSelector("[data-testid=leads-map]");
    check("xlsx: селекты предзаполнены по регэкспам, превью первых строк", JSON.stringify(await page.locator("[data-testid=leads-map-select]").evaluateAll((els) => els.map((e) => e.value))) === JSON.stringify(["name", "phone", "email", "lastContact", "note"]) && /Иван Петров/.test(await page.locator("[data-testid=leads-preview]").innerText()) && /Дата последнего контакта/.test(await page.locator("[data-testid=leads-map]").innerText()));
    check("xlsx: XSS в ячейке не исполняется и виден как текст", (await page.locator("#pwn").count()) === 0 && /<b id="pwn">XSS<\/b>/.test(await page.locator("[data-testid=leads-map]").innerText()));
    await page.locator("[data-testid=leads-do-import]").click();
    await page.waitForSelector("[data-testid=leads-done]", { timeout: 8000 });
    const done2 = await page.locator("[data-testid=leads-done]").innerText();
    check("xlsx: создано 4 из 6 строк — «без имени — 1, повторов — 1»", /Импортировано лидов: 4/.test(done2) && /без имени — 1, повторов — 1/.test(done2), done2);
    const made = await page.evaluate(() => (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").LEADS || []).slice(-4));
    check("xlsx: воронка/агент по умолчанию (fn-sales), канал site, стадия new", made.every((l) => l.funnelId === "fn-sales" && l.agentId === "ag-sales" && l.channel === "site" && l.stageId === "new"));
    check("xlsx: заметка с серийной датой → ISO и rich text склеен", made[0]?.note === "Телефон: +7 900 000-00-01 · Email: ivan@demo.test · Последний контакт: 2025-09-01 · Хочет демо" && made[1]?.name === "Анна Смирнова", JSON.stringify(made[0]?.note));
    check("xlsx: id уникальны и последовательны", JSON.stringify(made.map((l) => l.id)) === JSON.stringify(made.map((_, i) => `LD-${1043 + i}`)), JSON.stringify(made.map((l) => l.id)));
    check("xlsx: count лидов = сид + 4", (await leadsCount()) === cnt0 + 4);

    // ---------- KPI и «Открыть в CRM»
    await page.waitForFunction(() => document.querySelector("[data-testid=leads-kpi-imported]")?.textContent?.includes("4"), undefined, { timeout: 8000 });
    check("KPI: «Импортировано контактов» — 4 вместо «—»", /4/.test(await page.locator("[data-testid=leads-kpi-imported]").innerText()));
    await page.locator("[data-testid=leads-open-crm]").click();
    await page.waitForURL("**/crm**");
    await page.waitForSelector("[data-testid=crm-view-switch]");
    await page.waitForFunction(() => document.querySelector("[data-testid=crm-funnel-select]")?.value === "fn-sales", undefined, { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Иван Петров"), undefined, { timeout: 8000 });
    const crmUrl = page.url(), crmAria = await page.locator("[data-testid=crm-view-switch][data-view=table]").getAttribute("aria-pressed"), crmText = await page.locator("main").innerText();
    check("«Открыть в CRM»: таблица воронки «Продажи» (воронка импорта) с лидами", /view=table/.test(crmUrl) && /funnel=fn-sales/.test(crmUrl) && crmAria === "true" && /Иван Петров/.test(crmText), `url=${crmUrl} aria=${crmAria} text=${/Иван Петров/.test(crmText)}`);
    await open();

    // ---------- своё сопоставление через drop, «не использовать», блокировка без имени
    await reset(); await open();
    await page.evaluate(async ({ b64, name }) => {
      const bin = atob(b64);
      const file = new File([Uint8Array.from(bin, (c) => c.charCodeAt(0))], name, { type: "text/csv" });
      const dt = new DataTransfer(); dt.items.add(file);
      const ev = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: dt });
      document.querySelector("[data-testid=leads-dropzone]").dispatchEvent(ev);
    }, { b64: CSV.toString("base64"), name: "dropped.csv" });
    await page.waitForSelector("[data-testid=leads-map]");
    check("drop: перетаскивание файла открывает шаг сопоставления", /dropped\.csv/.test(await page.locator("[data-testid=leads-map]").innerText()));
    await page.locator('[data-mapcol="1"]').selectOption("skip");
    await page.locator("[data-testid=leads-do-import]").click();
    await page.waitForSelector("[data-testid=leads-done]", { timeout: 8000 });
    const afterSkip = await page.evaluate(() => (JSON.parse(localStorage.getItem("aiws-db-v2") || "{}").LEADS || []).at(-1));
    check("«не использовать»: колонка телефона не попадает в заметку", afterSkip?.name === "Ольга" && afterSkip?.note === "Email: o@demo.test", JSON.stringify(afterSkip?.note));
    await page.locator("[data-testid=leads-again]").click();
    await page.waitForSelector("[data-testid=leads-dropzone]");
    check("«Импортировать ещё» возвращает к dropzone", (await dropzone.count()) === 1);
    const cntNoName = await leadsCount();
    await upload(Buffer.from("A;B\nx;y\n", "utf8"), "noname.csv", "text/csv");
    await page.waitForSelector("[data-testid=leads-map]");
    await page.locator('[data-mapcol="0"]').selectOption("skip");
    await page.locator("[data-testid=leads-do-import]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=leads-feedback]")?.textContent?.includes("Укажите колонку"));
    await page.waitForFunction(() => document.activeElement?.id === "map-0", undefined, { timeout: 4000 }).catch(() => undefined);
    const fb = await feedback.innerText(), lc = await leadsCount(), active = await page.evaluate(() => document.activeElement?.id ?? "none");
    check("без колонки «Имя клиента»: импорт блокируется с сообщением и фокусом на первом селекте", /Укажите колонку «Имя клиента»/.test(fb) && lc === cntNoName && (await page.locator("[data-testid=leads-do-import]").count()) === 1 && active === "map-0", `fb=${fb} lc=${lc} active=${active}`);
    await page.locator("[data-testid=leads-cancel]").click();
    await page.waitForSelector("[data-testid=leads-dropzone]");
    await upload(Buffer.from("A;B\n;x\n", "utf8"), "emptyname.csv", "text/csv");
    await page.waitForSelector("[data-testid=leads-map]");
    await page.locator('[data-mapcol="1"]').selectOption("skip");
    await page.locator("[data-testid=leads-do-import]").click();
    await page.waitForFunction(() => document.querySelector("[data-testid=leads-feedback]")?.textContent?.includes("нечего импортировать"));
    check("имя сопоставлено, но все строки без имени → «нечего импортировать»", /Нет строк с именем клиента/.test(await feedback.innerText()) && (await leadsCount()) === cntNoName);

    // ---------- ошибка чтения файла и восстановление
    await upload(Buffer.from("x"), "bad.pdf");
    await page.waitForSelector("[data-testid=leads-error]");
    check("ошибка: role=alert с понятным текстом и «Выбрать другой файл»", (await page.locator('[data-testid=leads-error][role=alert]').count()) === 1 && /xlsx и .csv/.test(await page.locator("[data-testid=leads-error]").innerText()));
    await page.locator("[data-testid=leads-reset]").click();
    await page.waitForSelector("[data-testid=leads-dropzone]");
    check("после ошибки можно начать заново", (await dropzone.count()) === 1);

    // ---------- переименование и повторная ошибка ZIP
    check("переименование: «ИИ-» на странице нет", !(await page.locator("body").innerText()).includes("ИИ-"));
    await upload(Buffer.from("это точно не zip-архив ".repeat(10)), "fake.xlsx");
    await page.waitForSelector("[data-testid=leads-error]");
    check("fake.xlsx: «не похож на Excel» в состоянии ошибки", /не похож на Excel/.test(await page.locator("[data-testid=leads-error]").innerText()));
    await page.locator("[data-testid=leads-reset]").click();

    // ---------- overflow и контраст
    const over = [];
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme }); await page.evaluate(() => localStorage.removeItem("aiws-theme"));
      for (const w of [375, 768, 1280, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 });
        await open(); const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        if (o[0] > o[1]) over.push(`leads ${theme} ${w}: ${o[0]}>${o[1]}`);
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
    code = done("LEADS");
  } catch (e) { console.error("e2e: сбой", e); }
  if (server) server.kill();
  process.exit(code);
}
main();
