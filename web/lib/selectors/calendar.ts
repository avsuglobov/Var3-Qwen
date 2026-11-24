import { APP_NAME } from "@/lib/config";
import type { CalendarEvent } from "@/lib/schemas";

/**
 * Чистые функции раздела «Календарь» (этап 3, группа 6) и экспорт .ics (RFC 5545) — порт
 * `../download/sections3.js` calendar()/buildICS(): сетка месяца с точками событий, ближайшие
 * события, строгий разбор дат и длительностей, folding по 75 октетов, пропуски некорректных
 * событий (файл остаётся валидным). Валидатор — `lib/ics/validate.ts` (порт scripts/lib/ics_validate.js).
 */

export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Типы событий: технический тип → русская метка и иконка/цвет точки (EV_TYPE_RU/EV_IC/EV_CL прототипа). */
export type EventType = "call" | "deadline" | "meeting" | "training";
export const EVENT_TYPES: readonly EventType[] = ["call", "deadline", "meeting", "training"];
export const EV_TYPE_RU: Record<EventType, string> = { call: "Звонок", deadline: "Срок", meeting: "Встреча", training: "Обучение" };

/** Тон точки события в сетке (call — акцент, deadline — критичный, meeting — статус, training — нейтральный). */
export function eventDotTone(type: string | null | undefined): "accent" | "critical" | "status" | "muted" {
  if (type === "call") return "accent";
  if (type === "deadline") return "critical";
  if (type === "meeting") return "status";
  return "muted";
}

const pad = (n: number): string => (n < 10 ? "0" + n : String(n));

/** «2026-11-16» из компонентов локальной даты. */
export function ymd(y: number, m: number, d: number): string {
  return y + "-" + pad(m + 1) + "-" + pad(d);
}

export function todayStr(now: Date = new Date()): string {
  return ymd(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Штамп UTC для DTSTAMP: 20261115T093005Z. */
export function utcStamp(d: Date): string {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
}

/** «Плавающее» локальное время для DTSTART/DTEND (без «Z»): 20261116T100000. */
export function floatStamp(d: Date): string {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
}

export function icsEscape(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n|\r/g, "\\n");
}

/** Строгий разбор даты/времени: ГГГГ-ММ-ДД и Ч:ММ / ЧЧ:ММ; пустое время → 09:00; несуществующие даты (30 февраля, 25:00) → null. */
export function parseStart(date: unknown, time: unknown): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date == null ? "" : date));
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(time == null || time === "" ? "09:00" : time));
  if (!dm || !tm) return null;
  const y = Number(dm[1]), mo = Number(dm[2]), d = Number(dm[3]), h = Number(tm[1]), mi = Number(tm[2]);
  if (h > 23 || mi > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** «45 мин», «2 ч», «1 ч 30 мин», «1,5 часа», «90» (минуты) → минуты; пустое/мусор/0 → null; максимум 10080. */
export function parseDuration(s: unknown): number | null {
  const t = String(s == null ? "" : s).toLowerCase().trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) { const n = parseInt(t, 10); return n > 0 && n <= 10080 ? n : null; }
  const re = /(\d+(?:[.,]\d+)?)\s*(ч(?:ас(?:а|ов)?)?|h(?:ours?|rs?)?|мин(?:ут[аы]?)?|min(?:utes?)?|м|m)(?![а-яёa-z])/g;
  let total = 0, found = false, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const v = parseFloat(m[1].replace(",", "."));
    total += /^(ч|h)/.test(m[2]) ? v * 60 : v; found = true;
  }
  total = Math.round(total);
  return found && total > 0 && total <= 10080 ? total : null;
}

export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() + m, 0);
}

/** Складывание строк: не более 75 октетов UTF-8 на строку, продолжение начинается с пробела, символы не режутся. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "", bytes = 0;
  Array.from(line).forEach((ch) => {
    const cp = ch.codePointAt(0) as number;
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + n > 75) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += n;
  });
  out.push(cur);
  return out.join("\r\n");
}

export interface IcsBuildResult {
  text: string;
  count: number;
  /** id пропущенных событий (некорректная дата/id/название или дубликат UID). */
  skipped: string[];
}

/** Сборка VCALENDAR. События с некорректной датой/id/названием или дубли пропускаются. Срок без длительности — точка во времени (без DTEND). */
export function buildICS(events: readonly CalendarEvent[], now: Date = new Date()): IcsBuildResult {
  const stamp = utcStamp(now); // DTSTAMP обязан быть в UTC (с «Z») и одинаковым для всего файла
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + APP_NAME + "//Demo//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + APP_NAME + " (демо)"];
  let count = 0;
  const skipped: string[] = [];
  const seen: Record<string, 1> = {};
  events.forEach((e) => {
    const start = e ? parseStart(e.date, e.time) : null;
    const uid = e && typeof e.id === "string" && /^[A-Za-z0-9_-]+$/.test(e.id) ? e.id : null;
    if (!start || !uid || !e.title || seen[uid]) { skipped.push(e && e.id ? String(e.id) : "?"); return; }
    seen[uid] = 1;
    const dur = parseDuration(e.duration);
    const end = dur != null ? addMinutes(start, dur) : (e.type !== "deadline" ? addMinutes(start, 60) : null);
    lines.push("BEGIN:VEVENT", "UID:" + uid + "@aiworkspace", "DTSTAMP:" + stamp, "DTSTART:" + floatStamp(start));
    if (end) lines.push("DTEND:" + floatStamp(end));
    lines.push("SUMMARY:" + icsEscape(e.title));
    lines.push("DESCRIPTION:" + icsEscape("Тип: " + (EV_TYPE_RU[e.type as EventType] || "Событие") + " · Исполнитель: " + (e.assignee || "—")));
    lines.push("END:VEVENT");
    count++;
  });
  lines.push("END:VCALENDAR");
  return { text: lines.map(foldLine).join("\r\n") + "\r\n", count, skipped };
}

export const ICS_FILENAME = "ai-workspace-calendar.ics";

/** Ячейка сетки месяца (для рендера): dim — пустая «добивка» недели. */
export interface CalendarCell {
  day: number | null;
  date: string | null;
  isToday: boolean;
  events: CalendarEvent[];
}

/** Сетка выбранного месяца: Пн–Вс, события дня, «добивка» пустыми ячейками до полной недели. */
export function calendarGrid(year: number, month: number, events: readonly CalendarEvent[], today: string = todayStr()): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWD = (new Date(year, month, 1).getDay() + 6) % 7; // Пн=0
  const eventsOn = (dayStr: string): CalendarEvent[] => events.filter((e) => e.date === dayStr);
  for (let i = 0; i < firstWD; i++) cells.push({ day: null, date: null, isToday: false, events: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = ymd(year, month, d);
    cells.push({ day: d, date: ds, isToday: ds === today, events: eventsOn(ds) });
  }
  const total = firstWD + daysInMonth;
  const tail = (7 - (total % 7)) % 7;
  for (let k = 0; k < tail; k++) cells.push({ day: null, date: null, isToday: false, events: [] });
  return cells;
}

/** Ближайшие события: сортировка по дате+времени, первые n (прототип — 6). */
export function upcomingEvents(events: readonly CalendarEvent[], limit = 6): CalendarEvent[] {
  const key = (e: CalendarEvent): string => String(e.date ?? "") + String(e.time ?? "");
  return events.slice().sort((a, b) => (key(a) < key(b) ? -1 : 1)).slice(0, limit);
}
