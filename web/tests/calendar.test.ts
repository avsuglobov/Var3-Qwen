import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { validateICS } from "@/lib/ics/validate";
import {
  buildICS,
  calendarGrid,
  foldLine,
  parseDuration,
  parseStart,
  upcomingEvents,
  todayStr
} from "@/lib/selectors/calendar";

/* Порт scripts/regress_ics.js прототипа: строгий разбор дат/длительностей, DTSTAMP в UTC,
   folding по 75 октетов, CRLF, пропуск некорректных событий, русские метки, сетка месяца. */

const FIXED = new Date(Date.UTC(2026, 10, 15, 9, 30, 5));

describe("ics: parseStart — строгий разбор даты/времени", () => {
  it("валидные значения, в том числе «9:05» и пустое время → 09:00", () => {
    expect(parseStart("2026-11-16", "10:00")?.getTime()).toBe(new Date(2026, 10, 16, 10, 0).getTime());
    expect(parseStart("2026-11-20", "9:05")?.getTime()).toBe(new Date(2026, 10, 20, 9, 5).getTime());
    expect(parseStart("2026-11-20", "")?.getTime()).toBe(new Date(2026, 10, 20, 9, 0).getTime());
  });
  it("невалидные даты и время → null (включая 30 февраля, 25:00, 10:60)", () => {
    for (const x of ["", "abc", "2026-02-30", "2026-13-01", "2026-11-31", "16.11.2026", null]) {
      expect(parseStart(x, "10:00")).toBeNull();
    }
    expect(parseStart("2026-11-16", "25:00")).toBeNull();
    expect(parseStart("2026-11-16", "10:60")).toBeNull();
    expect(parseStart("2026-11-16", "ab")).toBeNull();
  });
});

describe("ics: parseDuration — длительность с единицами", () => {
  it("«45 мин»=45, «2 ч»=120, «1 ч 30 мин»=90", () => {
    expect(parseDuration("45 мин")).toBe(45);
    expect(parseDuration("2 ч")).toBe(120);
    expect(parseDuration("1 ч 30 мин")).toBe(90);
  });
  it("«1,5 часа»=90, «90»=90, «2 h»=120, «15 min»=15", () => {
    expect(parseDuration("1,5 часа")).toBe(90);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("2 h")).toBe(120);
    expect(parseDuration("15 min")).toBe(15);
  });
  it("пусто, мусор и 0 → null", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("долго")).toBeNull();
    expect(parseDuration("0 мин")).toBeNull();
    expect(parseDuration("0")).toBeNull();
  });
});

describe("ics: foldLine — не более 75 октетов, символы не режутся", () => {
  const long = "DESCRIPTION:Тип: Встреча · Исполнитель: " + "Бухгалтерия-Командная-Группа ".repeat(6) + "😀 конец";
  const folded = foldLine(long);
  const segs = folded.split("\r\n");
  it("каждый сегмент ≤75 октетов, продолжение с пробела", () => {
    expect(segs.every((s) => Buffer.byteLength(s, "utf8") <= 75)).toBe(true);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.slice(1).every((s) => s[0] === " ")).toBe(true);
  });
  it("склейка возвращает исходную строку без U+FFFD", () => {
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    expect(segs.some((s) => s.includes("\uFFFD"))).toBe(false);
  });
});

describe("ics: buildICS — сборка из сида", () => {
  const r = buildICS(SEED_DATA.CALENDAR_EVENTS, FIXED);
  it("строгий валидатор не находит ошибок", () => {
    expect(validateICS(r.text, { expectedCount: SEED_DATA.CALENDAR_EVENTS.length, expectedTitles: SEED_DATA.CALENDAR_EVENTS.map((e) => e.title) })).toEqual([]);
  });
  it("DTSTAMP в UTC с «Z» = переданное время", () => {
    expect(r.text.includes("DTSTAMP:20261115T093005Z")).toBe(true);
  });
  it("срок без длительности — без DTEND, остальные с DTEND", () => {
    const ev2 = r.text.split("BEGIN:VEVENT")[2];
    expect(/UID:EV-2@aiworkspace[\s\S]*?DTEND[\s\S]*?END:VEVENT/.test(ev2)).toBe(false);
    expect(/DTEND:20261116T104500/.test(r.text)).toBe(true);
    expect(r.count).toBe(5);
    expect(r.skipped).toEqual([]);
  });
  it("русские метки типа, сырые технические типы отсутствуют", () => {
    expect(/Тип: Звонок/.test(r.text)).toBe(true);
    expect(/Тип: Срок/.test(r.text)).toBe(true);
    expect(/Тип: call/.test(r.text)).toBe(false);
  });
  it("текст оканчивается CRLF, голых LF нет", () => {
    expect(r.text.endsWith("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(r.text)).toBe(false);
  });
});

describe("ics: buildICS — некорректные события пропускаются, файл остаётся валидным", () => {
  const mixed = SEED_DATA.CALENDAR_EVENTS.concat([
    { id: "BAD-1", title: "Пустая дата", date: "", time: "10:00", duration: "30 мин", type: "call", assignee: "М" },
    { id: "BAD-2", title: "30 февраля", date: "2026-02-30", time: "10:00", type: "call" },
    { id: "BAD-3", title: "Время 25:00", date: "2026-11-20", time: "25:00", type: "call" },
    { id: "EV-1", title: "Дубль UID", date: "2026-11-21", time: "10:00", type: "call" },
    { id: 'x"y', title: "Плохой id", date: "2026-11-21", time: "10:00", type: "call" },
    { id: "BAD-6", title: "", date: "2026-11-21", time: "10:00", type: "call" },
    { id: "OK-7", title: "Длинное; с, символами\\ и переносом\nстроки " + "очень длинное название ".repeat(5), date: "2026-11-22", time: "9:05", duration: "2 ч", type: "meeting", assignee: "Группа" }
  ]);
  const r = buildICS(mixed, FIXED);
  it("пропущено 6 некорректных, валидатор чист", () => {
    expect(r.skipped).toEqual(["BAD-1", "BAD-2", "BAD-3", "EV-1", 'x"y', "BAD-6"]);
    expect(validateICS(r.text, { expectedCount: SEED_DATA.CALENDAR_EVENTS.length + 1 })).toEqual([]);
  });
  it("«9:05» + «2 ч» → DTSTART 09:05–DTEND 11:05", () => {
    expect(/DTSTART:20261122T090500\r\nDTEND:20261122T110500/.test(r.text.replace(/\r\n /g, ""))).toBe(true);
  });
  it("экранирование ; , \\ и перевода строки в SUMMARY", () => {
    expect(/SUMMARY:Длинное\\; с\\, символами\\\\ и переносом\\nстроки/.test(r.text.replace(/\r\n /g, ""))).toBe(true);
  });
});

describe("ics: валидатор ловит ошибки старого формата", () => {
  const oldStyle = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//X//RU\r\nBEGIN:VEVENT\r\nUID:EV-1@aiworkspace\r\nDTSTAMP:20261115T093005\r\nDTSTART:NaNNaNNaNTNaNNaNNaN\r\nDTEND:20261116T110500\r\nSUMMARY:Тест\r\nDESCRIPTION:Тип: call · Исполнитель: AI-Продажи и ещё довольно длинная строка для проверки фолдинга\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const oe = validateICS(oldStyle).join(" | ");
  it("DTSTAMP без Z, NaN, >75 октетов, сырой тип, нет финального CRLF", () => {
    expect(/DTSTAMP не в UTC/.test(oe)).toBe(true);
    expect(/NaN/.test(oe)).toBe(true);
    expect(/октетов/.test(oe)).toBe(true);
    expect(/сырой технический тип/.test(oe)).toBe(true);
    expect(/не заканчивается CRLF/.test(oe)).toBe(true);
  });
  it("DTEND ≤ DTSTART, дубль UID, голый LF", () => {
    const base = buildICS(SEED_DATA.CALENDAR_EVENTS, FIXED);
    expect(/DTEND не позже/.test(validateICS(base.text.replace(/DTEND:20261116T104500/, "DTEND:20261116T090000")).join(" "))).toBe(true);
    expect(/UID не уникален/.test(validateICS(base.text.replace("UID:EV-2@", "UID:EV-1@")).join(" "))).toBe(true);
    expect(/голым LF/.test(validateICS(base.text.replace(/\r\n/, "\n")).join(" "))).toBe(true);
  });
});

describe("селекторы «Календарь»: сетка и ближайшие события", () => {
  it("calendarGrid: ноябрь 2026 — 1-е воскресенье (6 dim), 42 ячейки до полной недели", () => {
    const cells = calendarGrid(2026, 10, SEED_DATA.CALENDAR_EVENTS, "2026-11-24");
    expect(cells.length).toBe(42);
    expect(cells.slice(0, 6).every((c) => c.day === null)).toBe(true);
    expect(cells[6].day).toBe(1);
    expect(cells.slice(-6).every((c) => c.day === null)).toBe(true);
    const cell16 = cells.find((c) => c.date === "2026-11-16");
    expect(cell16?.events.map((e) => e.id)).toEqual(["EV-1", "EV-2"]);
    expect(cells.find((c) => c.date === "2026-11-24")?.isToday).toBe(true);
  });
  it("события дня в ячейках: 17 и 18 ноября по одному", () => {
    const cells = calendarGrid(2026, 10, SEED_DATA.CALENDAR_EVENTS, "2026-11-24");
    expect(cells.find((c) => c.date === "2026-11-17")?.events.map((e) => e.id)).toEqual(["EV-3"]);
    expect(cells.find((c) => c.date === "2026-11-18")?.events.map((e) => e.id)).toEqual(["EV-4"]);
    expect(cells.find((c) => c.date === "2026-11-19")?.events.map((e) => e.id)).toEqual(["EV-5"]);
  });
  it("upcomingEvents: сортировка по дате+времени, лимит 6", () => {
    const up = upcomingEvents(SEED_DATA.CALENDAR_EVENTS);
    expect(up.map((e) => e.id)).toEqual(["EV-1", "EV-2", "EV-3", "EV-4", "EV-5"]);
    const many = SEED_DATA.CALENDAR_EVENTS.concat([SEED_DATA.CALENDAR_EVENTS[0]]).reverse();
    expect(upcomingEvents(many, 6).length).toBe(6);
  });
  it("todayStr: локальная дата YYYY-MM-DD", () => {
    expect(todayStr(new Date(2026, 10, 24))).toBe("2026-11-24");
    expect(todayStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
