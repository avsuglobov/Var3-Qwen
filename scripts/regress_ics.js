/* regress_ics.js — регрессии экспорта календаря: строгий разбор дат/длительностей, DTSTAMP в UTC, folding, CRLF,
   пропуск некорректных событий, русские метки. Запуск: node scripts/regress_ics.js (jsdom) */
const { load } = require("./jsdom_harness");
const { validateICS } = require("./lib/ics_validate");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);
const readBlob = (w, b) => new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(b); });
const hm = (d) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].join("-");

(async () => {
  const w = load().window; const d = w.document; await wait(30); const A = w.AIWS; const I = A.ics;

  // --- строгий разбор даты/времени
  check("parseStart: валидные (в т.ч. '9:05')", hm(I.parseStart("2026-11-16", "10:00")) === "2026-11-16-10-0" && hm(I.parseStart("2026-11-20", "9:05")) === "2026-11-20-9-5" && hm(I.parseStart("2026-11-20", "")) === "2026-11-20-9-0");
  check("parseStart: невалидные -> null", ["", "abc", "2026-02-30", "2026-13-01", "2026-11-31", "16.11.2026", null].every((x) => I.parseStart(x, "10:00") === null) && I.parseStart("2026-11-16", "25:00") === null && I.parseStart("2026-11-16", "10:60") === null && I.parseStart("2026-11-16", "ab") === null);
  // --- длительность с единицами
  const pd = I.parseDuration;
  check("parseDuration: '45 мин'=45, '2 ч'=120, '1 ч 30 мин'=90", pd("45 мин") === 45 && pd("2 ч") === 120 && pd("1 ч 30 мин") === 90);
  check("parseDuration: '1,5 часа'=90, '90'=90, '2 h'=120, '15 min'=15", pd("1,5 часа") === 90 && pd("90") === 90 && pd("2 h") === 120 && pd("15 min") === 15);
  check("parseDuration: пусто/мусор/0 -> null", pd("") === null && pd(null) === null && pd("долго") === null && pd("0 мин") === null && pd("0") === null);
  // --- folding
  const long = "DESCRIPTION:Тип: Встреча · Исполнитель: " + "Бухгалтерия-Командная-Группа ".repeat(6) + "😀 конец";
  const folded = I.fold(long);
  const segs = folded.split("\r\n");
  check("fold: каждый сегмент ≤75 октетов", segs.every((s) => Buffer.byteLength(s, "utf8") <= 75) && segs.length > 1);
  check("fold: склейка = исходная строка, символы не разрезаны", folded.replace(/\r\n /g, "") === long && !segs.some((s) => s.includes("\uFFFD")) && segs.slice(1).every((s) => s[0] === " "));

  // --- сборка из фикстур
  const fixed = new Date(Date.UTC(2026, 10, 15, 9, 30, 5));
  const r = I.build(A.data.CALENDAR_EVENTS, fixed);
  const errs = validateICS(r.text, { expectedCount: A.data.CALENDAR_EVENTS.length, expectedTitles: A.data.CALENDAR_EVENTS.map((e) => e.title) });
  check("build: валидатор не находит ошибок" + (errs.length ? " [" + errs.join("; ") + "]" : ""), errs.length === 0);
  check("build: DTSTAMP в UTC с «Z» = переданное время", r.text.includes("DTSTAMP:20261115T093005Z"));
  check("build: срок без длительности — без DTEND, остальные с DTEND", !/UID:EV-2@aiworkspace[\s\S]*?DTEND[\s\S]*?END:VEVENT/.test(r.text.split("BEGIN:VEVENT")[2]) && /DTEND:20261116T104500/.test(r.text));
  check("build: русские метки типа, нет 'Тип: call'", /Тип: Звонок/.test(r.text) && /Тип: Срок/.test(r.text) && !/Тип: call/.test(r.text));
  check("build: текст оканчивается CRLF, нет голых LF", r.text.endsWith("\r\n") && !/[^\r]\n/.test(r.text));

  // --- некорректные события пропускаются, файл остаётся валидным
  const mixed = A.data.CALENDAR_EVENTS.concat([
    { id: "BAD-1", title: "Пустая дата", date: "", time: "10:00", duration: "30 мин", type: "call", assignee: "М" },
    { id: "BAD-2", title: "30 февраля", date: "2026-02-30", time: "10:00", type: "call" },
    { id: "BAD-3", title: "Время 25:00", date: "2026-11-20", time: "25:00", type: "call" },
    { id: "EV-1", title: "Дубль UID", date: "2026-11-21", time: "10:00", type: "call" },
    { id: 'x"y', title: "Плохой id", date: "2026-11-21", time: "10:00", type: "call" },
    { id: "BAD-6", title: "", date: "2026-11-21", time: "10:00", type: "call" },
    { id: "OK-7", title: "Длинное; с, символами\\ и переносом\nстроки " + "очень длинное название ".repeat(5), date: "2026-11-22", time: "9:05", duration: "2 ч", type: "meeting", assignee: "Группа" }
  ]);
  const r2 = I.build(mixed, fixed);
  const e2 = validateICS(r2.text, { expectedCount: A.data.CALENDAR_EVENTS.length + 1 });
  check("build(mixed): пропущено 6 некорректных, файл валиден" + (e2.length ? " [" + e2.join("; ") + "]" : ""), r2.skipped.length === 6 && e2.length === 0);
  check("build(mixed): '9:05' + '2 ч' -> 09:05–11:05", /DTSTART:20261122T090500\r\nDTEND:20261122T110500/.test(r2.text.replace(/\r\n /g, "")));
  check("build(mixed): экранирование ; , \\ и перевода строки", /SUMMARY:Длинное\\; с\\, символами\\\\ и переносом\\nстроки/.test(r2.text.replace(/\r\n /g, "")));

  // --- проверка самого валидатора на старых ошибках (он обязан их ловить)
  const oldStyle = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//X//RU\r\nBEGIN:VEVENT\r\nUID:EV-1@aiworkspace\r\nDTSTAMP:20261115T093005\r\nDTSTART:NaNNaNNaNTNaNNaNNaN\r\nDTEND:20261116T110500\r\nSUMMARY:Тест\r\nDESCRIPTION:Тип: call · Исполнитель: ИИ-Продажи и ещё довольно длинная строка для проверки фолдинга\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const oe = validateICS(oldStyle).join(" | ");
  check("валидатор ловит: DTSTAMP без Z, NaN, >75 октетов, сырой тип, нет финального CRLF", /DTSTAMP не в UTC/.test(oe) && /NaN/.test(oe) && /октетов/.test(oe) && /сырой технический тип/.test(oe) && /не заканчивается CRLF/.test(oe));
  check("валидатор ловит DTEND ≤ DTSTART, дубль UID, голый LF", /DTEND не позже/.test(validateICS(r.text.replace(/DTEND:20261116T104500/, "DTEND:20261116T090000"))) && /UID не уникален/.test(validateICS(r.text.replace("UID:EV-2@", "UID:EV-1@"))) && /голым LF/.test(validateICS(r.text.replace(/\r\n/, "\n"))));

  // --- через UI: скачивание и тосты
  w.AIWS.navigate("calendar"); await wait(15);
  A.data.CALENDAR_EVENTS.push({ id: "EV-9", title: "Битая дата", date: "31.12.2026", time: "10:00", duration: "30 мин", type: "call", assignee: "М" });
  d.getElementById("calExport").click(); await wait(15);
  const txt = await readBlob(w, w.__lastBlob);
  const e3 = validateICS(txt, { expectedCount: 5 });
  check("UI: экспорт пропускает битое событие, файл валиден" + (e3.length ? " [" + e3.join("; ") + "]" : ""), e3.length === 0);
  check("UI: тост сообщает о пропущенных", /Экспортировано событий: 5, пропущено.*: 1/.test(d.body.textContent));
  w.__lastBlob = null; A.data.CALENDAR_EVENTS.length = 0; A.data.CALENDAR_EVENTS.push({ id: "EV-9", title: "Битая", date: "", time: "10:00" });
  d.getElementById("calExport").click(); await wait(15);
  check("UI: без корректных событий файл не скачивается, есть сообщение", w.__lastBlob === null && /Нет событий с корректной датой/.test(d.body.textContent));
  check("нет ошибок в консоли", w.__errors.length === 0);

  console.log("PASS (" + pass.length + ")"); console.log("FAIL (" + fail.length + "): " + (fail.length ? "\n - " + fail.join("\n - ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
