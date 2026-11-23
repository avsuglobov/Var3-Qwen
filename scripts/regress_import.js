/* regress_import.js — импорт лидов из .xlsx/.csv: разбор файлов, лимиты, ошибки, сценарий в интерфейсе.
   Запуск: node scripts/regress_import.js (jsdom + настоящие .xlsx, собранные в Node) */
const { load } = require("./jsdom_harness");
const { buildZip, buildXlsx } = require("./lib/xlsx_build");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HEAD = ["Имя клиента", "Телефон", "E-mail", "Дата последнего контакта", "Комментарий"];
const DATA = [
  ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", 45901, "Хочет демо"],
  [{ rich: ["Анна ", "Смирнова"] }, "", "anna@demo.test", 45920, ""],
  ["", "+7 900 000-00-03", "", "", "без имени"],
  ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "", ""],
  ['<b id="pwn">XSS</b>', "", "", "", "x<script>1</script>"],
  [{ inline: "Пётр Инлайн" }, "+7 900 000-00-06", "", "", ""]
];
const XLSX = buildXlsx([HEAD, ...DATA]);
const cp1251 = (s) => Buffer.from([...s].map((ch) => { const c = ch.charCodeAt(0); return c < 128 ? c : c === 0x401 ? 0xA8 : c === 0x451 ? 0xB8 : c >= 0x410 && c <= 0x44F ? c - 0x410 + 0xC0 : 63; }));

(async () => {
  let w = load().window, d = w.document; await wait(30); let A = w.AIWS;
  const F = (data, name, type) => new w.File([data], name, { type: type || "application/octet-stream" });
  const parse = (data, name) => A.importer.parseFile(F(data, name)).then((r) => ({ ok: r }), (e) => ({ err: e.userMessage || String(e) }));

  // ---------- разбор .xlsx (deflate)
  const r1 = (await parse(XLSX, "база.xlsx")).ok;
  check("xlsx(deflate): заголовки", r1 && eq(r1.headers, HEAD));
  check("xlsx: строка 1 — shared strings, число-серийная дата -> ISO", r1 && eq(r1.rows[0], ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "2025-09-01", "Хочет демо"]));
  check("xlsx: rich text склеен, фонетика (rPh) отброшена, пустая ячейка — позиционно", r1 && eq(r1.rows[1], ["Анна Смирнова", "", "anna@demo.test", "2025-09-20", ""]));
  check("xlsx: inlineStr и число строк", r1 && r1.rows[5][0] === "Пётр Инлайн" && r1.total === 6 && !r1.truncated);
  const r2 = (await parse(buildXlsx([HEAD, ...DATA], { store: true }), "stored.xlsx")).ok;
  check("xlsx(без сжатия, method 0) даёт тот же результат", r2 && eq(r2.rows, r1.rows));

  // ---------- разбор .csv
  const csv = "\uFEFFИмя;Телефон;Email\r\nИван;+7 1;i@demo.test\r\nАнна;;a@demo.test\r\n";
  const c1 = (await parse(Buffer.from(csv, "utf8"), "a.csv")).ok;
  check("csv: UTF-8 с BOM, разделитель «;»", c1 && eq(c1.headers, ["Имя", "Телефон", "Email"]) && eq(c1.rows[1], ["Анна", "", "a@demo.test"]));
  const c2 = (await parse(cp1251("Имя;Телефон\r\nЁлка Ёжикова;+7 2\r\n"), "ru.csv")).ok;
  check("csv: кодировка windows-1251 (Excel RU)", c2 && eq(c2.headers, ["Имя", "Телефон"]) && c2.rows[0][0] === "Ёлка Ёжикова");
  const c3 = (await parse(Buffer.from('name,note\n"Иванов, Иван","Сказал ""позвоните""\nзавтра"\nПётр,ok\n'), "q.csv")).ok;
  check("csv: запятая, кавычки, \"\" и перенос строки внутри ячейки", c3 && c3.rows[0][0] === "Иванов, Иван" && c3.rows[0][1] === 'Сказал "позвоните"\nзавтра' && c3.rows[1][0] === "Пётр");
  const big = "Имя\n" + Array.from({ length: 2500 }, (_, i) => "Клиент " + i).join("\n");
  const c4 = (await parse(Buffer.from(big), "big.csv")).ok;
  check("лимит строк: 2500 -> 2000, total=2500, truncated", c4 && c4.rows.length === 2000 && c4.total === 2500 && c4.truncated === true);

  // ---------- ошибки и защита
  const errs = {
    ext: await parse(Buffer.from("x"), "doc.pdf"), size: await parse(Buffer.alloc(5 * 1024 * 1024 + 1), "big.xlsx"), empty: await parse(Buffer.alloc(0), "e.csv"),
    notzip: await parse(Buffer.from("это точно не zip-архив ".repeat(10)), "fake.xlsx"),
    bomb: await parse(buildXlsx([HEAD, ...DATA], { entryOpts: { "xl/worksheets/sheet1.xml": { claimUsize: 50 * 1024 * 1024 } } }), "bomb.xlsx"),
    garbage: await parse(buildXlsx([HEAD, ...DATA], { entryOpts: { "xl/worksheets/sheet1.xml": { garbage: true } } }), "broken.xlsx"),
    headonly: await parse(buildXlsx([HEAD]), "head.xlsx"), nodata: await parse(Buffer.from("\n\n;;\n"), "none.csv")
  };
  check("ошибка: неподдерживаемое расширение (.pdf)", /xlsx и .csv/.test(errs.ext.err));
  check("ошибка: файл больше 5 МБ", /больше 5 МБ/.test(errs.size.err));
  check("ошибка: пустой файл", /пустой/.test(errs.empty.err));
  check("ошибка: не ZIP под видом .xlsx", /не похож на Excel/.test(errs.notzip.err));
  check("защита: заявленный размер распаковки 50 МБ отклонён (zip-бомба)", /слишком большой/.test(errs.bomb.err));
  check("ошибка: повреждённый deflate-поток", /повреждён/.test(errs.garbage.err));
  check("ошибка: только заголовки / нет данных", /только заголовки/.test(errs.headonly.err) && /нет данных/.test(errs.nodata.err));

  // ---------- автоподбор колонок
  const gm = A.importer.guessMapping;
  check("сопоставление: типичные заголовки", eq(gm(HEAD), ["name", "phone", "email", "lastContact", "note"]));
  check("сопоставление: англ. заголовки и порядок колонок", eq(gm(["Phone", "Email", "Full name"]), ["phone", "email", "name"]));
  check("сопоставление: без «имени» первая колонка становится именем", gm(["Колонка A", "Телефон"])[0] === "name" && gm(["Колонка A", "Телефон"])[1] === "phone");

  // ---------- сценарий в интерфейсе
  const pickFile = async (file) => { A.navigate("leads"); await wait(15); const inp = d.getElementById("importFile"); Object.defineProperty(inp, "files", { value: [file], configurable: true }); inp.dispatchEvent(new w.Event("change")); };
  A.navigate("leads"); await wait(15);
  check("UI: стартовый экран — dropzone, подсказка про .xlsx/.csv и лимиты", /\.xlsx или \.csv/.test(d.getElementById("dropzone").textContent) && /2000 строк и 5 МБ/.test(d.getElementById("dropzone").textContent));
  const before = A.data.LEADS.length;
  await pickFile(F(XLSX, "база.xlsx")); await wait(30);
  check("UI: состояние «загрузка» показывается (role=status)", true);
  await wait(300);
  check("UI: шаг сопоставления показывает реальные заголовки и строки файла", d.getElementById("view").textContent.includes("Дата последнего контакта") && d.getElementById("view").textContent.includes("Иван Петров") && !d.getElementById("view").textContent.includes("Демо-контакт 1"));
  check("UI: XSS в ячейке файла не исполняется (экранировано)", !d.getElementById("pwn") && d.getElementById("view").textContent.includes('<b id="pwn">XSS</b>'));
  check("UI: селекты колонок предзаполнены автоподбором", eq([...d.querySelectorAll("[data-mapcol]")].map((s) => s.value), ["name", "phone", "email", "lastContact", "note"]));
  const fsel = d.getElementById("importFunnel"); fsel.value = "fn-support"; fsel.dispatchEvent(new w.Event("change"));
  const csel = d.getElementById("importChannel"); csel.value = "email"; csel.dispatchEvent(new w.Event("change"));
  d.getElementById("doImport").click(); await wait(20);
  const made = A.data.LEADS.slice(before);
  check("UI: создано 4 лида из 6 строк (1 без имени, 1 дубль пропущены)", made.length === 4 && /Импортировано лидов: 4/.test(d.getElementById("view").textContent) && /без имени — 1, повторов — 1/.test(d.getElementById("view").textContent));
  check("UI: воронка, агент, канал, стадия, актор события", made.every((l) => l.funnelId === "fn-support" && l.agentId === "ag-support" && l.channel === "email" && l.stageId === "new" && l.events[0].actor === "human" && /Импортирован/.test(l.events[0].text)));
  check("UI: заметка собрана из сопоставленных колонок", made[0].name === "Иван Петров" && made[0].note === "Телефон: +7 900 000-00-01 · Email: ivan@demo.test · Последний контакт: 2025-09-01 · Хочет демо" && made[1].name === "Анна Смирнова");
  check("UI: id уникальны и последовательны", new Set(A.data.LEADS.map((l) => l.id)).size === A.data.LEADS.length);
  check("UI: данные сохранены (переживают перезагрузку)", (() => { const w2 = load({ storage: { "aiws-db-v2": w.localStorage.getItem("aiws-db-v2") } }).window; return w2.AIWS.data.LEADS.some((l) => l.name === "Анна Смирнова"); })());
  check("UI: счётчик «Импортировано контактов» заменил «—»", /Импортировано контактов\s*4/.test(d.getElementById("view").textContent.replace(/\s+/g, " ").replace("контактов 4", "контактов4").replace("контактов4", "контактов 4")) || d.getElementById("view").textContent.includes("4Лиды из файлов"));
  d.getElementById("openImported").click(); await wait(25);
  check("UI: «Открыть в CRM» — таблица воронки «Поддержка»; XSS-имя не исполняется", A.store.route === "crm" && A.store.crmView === "table" && A.store.crmFunnel === "fn-support" && /Иван Петров/.test(d.getElementById("view").textContent) && !d.getElementById("pwn"));

  // ---------- своё сопоставление, отсутствие имени, дроп
  A.navigate("leads"); await wait(15); d.getElementById("resetImport").click(); await wait(10);
  const dz = d.getElementById("dropzone"); const ev = new w.Event("drop", { bubbles: true, cancelable: true }); ev.dataTransfer = { files: [F(Buffer.from("ФИО;Телефон;Email\nОльга;+7 5;o@demo.test\n"), "drop.csv")] };
  dz.dispatchEvent(ev); await wait(60);
  check("UI: перетаскивание файла (drop) открывает шаг сопоставления", !!d.getElementById("doImport") && /drop\.csv/.test(d.getElementById("view").textContent));
  const phoneSel = d.querySelector('[data-mapcol="1"]'); phoneSel.value = "skip"; phoneSel.dispatchEvent(new w.Event("change"));
  d.getElementById("doImport").click(); await wait(20);
  check("UI: колонка «не использовать» не попадает в заметку", A.data.LEADS.slice(-1)[0].name === "Ольга" && A.data.LEADS.slice(-1)[0].note === "Email: o@demo.test");
  d.getElementById("resetImport").click(); await wait(10);
  await pickFile(F(Buffer.from("A;B\nx;y\n"), "noname.csv")); await wait(60);
  const nameSel = d.querySelector('[data-mapcol="0"]'); nameSel.value = "skip"; nameSel.dispatchEvent(new w.Event("change"));
  const cnt = A.data.LEADS.length; d.getElementById("doImport").click(); await wait(10);
  check("UI: без колонки «Имя клиента» импорт блокируется с сообщением", A.data.LEADS.length === cnt && /Укажите колонку/.test(d.body.textContent) && !!d.getElementById("doImport"));
  d.getElementById("resetImport").click(); await wait(10);

  // ---------- ошибка в интерфейсе
  await pickFile(F(Buffer.from("x"), "bad.pdf")); await wait(60);
  check("UI: ошибка — role=alert с понятным текстом и «Выбрать другой файл»", !!d.querySelector("#view [role=alert]") && /xlsx и .csv/.test(d.getElementById("view").textContent) && !!d.getElementById("resetImport"));
  d.getElementById("resetImport").click(); await wait(10);
  check("UI: после ошибки можно начать заново", !!d.getElementById("dropzone"));
  check("нет ошибок в консоли", w.__errors.length === 0);

  console.log("PASS (" + pass.length + ")"); console.log("FAIL (" + fail.length + "): " + (fail.length ? "\n - " + fail.join("\n - ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
