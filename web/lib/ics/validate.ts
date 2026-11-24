/**
 * Строгая проверка .ics (RFC 5545) — TS-порт `scripts/lib/ics_validate.js` прототипа
 * (общий инструмент regress_ics.js и ics_check.js). validateICS(text, { expectedCount,
 * expectedTitles }) -> массив строк-ошибок (пустой массив = файл корректен).
 * Проверяет: CRLF, line folding ≤75 октетов, DTSTAMP в UTC с «Z», корректные DTSTART/DTEND
 * (DTEND строго позже DTSTART), уникальные UID, отсутствие NaN/undefined/null,
 * русские метки типа в DESCRIPTION, совпадение названий с данными.
 */

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

function validDateTime(v: string, utc: boolean): number | null {
  const m = (utc ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/ : /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/).exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || h > 23 || mi > 59 || se > 60) return null;
  return dt.getTime();
}

export interface IcsValidateOptions {
  expectedCount?: number;
  expectedTitles?: readonly string[];
}

export function validateICS(text: string, opts: IcsValidateOptions = {}): string[] {
  const err: string[] = [];
  if (typeof text !== "string" || !text) return ["пустой файл"];
  if (!text.endsWith("\r\n")) err.push("файл не заканчивается CRLF");
  if (/[^\r]\n|^\n/.test(text)) err.push("есть строки, оканчивающиеся голым LF (нужен CRLF)");
  const raw = text.split("\r\n"); if (raw[raw.length - 1] === "") raw.pop();
  raw.forEach((l, i) => { const n = Buffer.byteLength(l, "utf8"); if (n > 75) err.push(`строка ${i + 1}: ${n} октетов (>75), нужен line folding`); });
  if (/(^|[^A-Za-zА-Яа-я])(NaN|undefined|null)([^A-Za-zА-Яа-я]|$)/.test(text)) err.push("в файле есть NaN/undefined/null");
  const lines = text.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
  if (lines[0] !== "BEGIN:VCALENDAR") err.push("первая строка не BEGIN:VCALENDAR");
  if (lines[lines.length - 1] !== "END:VCALENDAR") err.push("последняя строка не END:VCALENDAR");
  if (!lines.includes("VERSION:2.0")) err.push("нет VERSION:2.0");
  if (!lines.some((l) => l.startsWith("PRODID:"))) err.push("нет PRODID");
  type Ev = Record<string, string[]>;
  const events: Ev[] = []; let cur: Ev | null = null, depth = 0;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") { if (cur) err.push("вложенный VEVENT"); cur = {}; depth++; continue; }
    if (l === "END:VEVENT") { if (!cur) err.push("END:VEVENT без BEGIN"); else events.push(cur); cur = null; depth--; continue; }
    if (cur) { const i = l.indexOf(":"); if (i > 0) { const k = l.slice(0, i).split(";")[0]; (cur[k] = cur[k] || []).push(l.slice(i + 1)); } }
  }
  if (depth !== 0) err.push("несбалансированные BEGIN/END:VEVENT");
  const uids = new Set<string>(), titles: string[] = [];
  events.forEach((e, n) => {
    const tag = `VEVENT #${n + 1}`;
    for (const k of ["UID", "DTSTAMP", "DTSTART", "SUMMARY"]) if (!e[k] || e[k].length !== 1 || !e[k][0]) err.push(`${tag}: нет ровно одного ${k}`);
    if (e.UID) { if (uids.has(e.UID[0])) err.push(`${tag}: UID не уникален (${e.UID[0]})`); uids.add(e.UID[0]); }
    if (e.DTSTAMP && validDateTime(e.DTSTAMP[0], true) == null) err.push(`${tag}: DTSTAMP не в UTC-формате с «Z»: ${e.DTSTAMP[0]}`);
    const st = e.DTSTART ? validDateTime(e.DTSTART[0], false) : null;
    if (e.DTSTART && st == null) err.push(`${tag}: некорректный DTSTART: ${e.DTSTART[0]}`);
    if (e.DTEND) {
      const en = validDateTime(e.DTEND[0], false);
      if (en == null) err.push(`${tag}: некорректный DTEND: ${e.DTEND[0]}`);
      else if (st != null && en <= st) err.push(`${tag}: DTEND не позже DTSTART`);
    }
    if (e.SUMMARY) titles.push(unescapeText(e.SUMMARY[0]));
    if (e.DESCRIPTION && /Тип: (call|meeting|deadline|training)\b/.test(e.DESCRIPTION[0])) err.push(`${tag}: в описании сырой технический тип вместо русской метки`);
  });
  if (opts.expectedCount != null && events.length !== opts.expectedCount) err.push(`событий ${events.length}, ожидалось ${opts.expectedCount}`);
  if (opts.expectedTitles) {
    const want = [...opts.expectedTitles].sort().join("\n"), got = [...titles].sort().join("\n");
    if (want !== got) err.push("названия событий в файле не совпадают с ожидаемыми");
  }
  return err;
}
