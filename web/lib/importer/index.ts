import { MAX_BYTES, MAX_COLS, MAX_ROWS, fail, isImportFailure } from "@/lib/importer/base";
import { decodeText, parseCsv } from "@/lib/importer/csv";
import { parseXlsx } from "@/lib/importer/xlsx";

/**
 * Общий вход импорта (поведение `../download/importer.js`): разбор .xlsx и .csv,
 * нормализация матрицы (заголовки, лимиты, серийные даты Excel → ГГГГ-ММ-ДД) и
 * автоподбор сопоставления колонок. Ошибки — с понятным русским сообщением.
 */

/** Поля импорта и вариант «не использовать» (как FIELDS прототипа). */
export const FIELDS = [
  ["name", "Имя клиента"],
  ["phone", "Телефон"],
  ["email", "Email"],
  ["lastContact", "Последний контакт"],
  ["note", "Комментарий"],
  ["skip", "— не использовать —"]
] as const;

export type MappingColumn = (typeof FIELDS)[number][0];

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  /** Строк с данными всего (до обрезки по лимиту). */
  total: number;
  /** true — строк больше лимита, импортируются первые MAX_ROWS. */
  truncated: boolean;
}

/** Серийная дата Excel → ГГГГ-ММ-ДД (эпоха 1899-12-30). */
export function excelSerialToIso(n: number): string | null {
  const d = new Date(Math.round((n - 25569) * 86400000));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Нормализация матрицы: заголовки — первая непустая строка, тело — непустые строки ниже. */
export function normalize(matrix: readonly (readonly string[])[]): ParsedFile {
  let header = -1;
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i]?.some((c) => String(c).trim() !== "")) {
      header = i;
      break;
    }
  }
  if (header < 0) throw fail("В файле нет данных");
  const rowsAfter = matrix.slice(header + 1);
  const width = Math.min(MAX_COLS, Math.max(...matrix.slice(header).map((r) => r.length)));
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    const h = String(matrix[header]?.[c] ?? "").trim();
    headers.push(h || `Колонка ${c + 1}`);
  }
  const body = rowsAfter.filter((r) => r.some((x) => String(x).trim() !== ""));
  const total = body.length;
  const truncated = total > MAX_ROWS;
  const limited = truncated ? body.slice(0, MAX_ROWS) : body;
  const dateCols = headers.map((h) => /дат|date/i.test(h));
  const rows = limited.map((r) => {
    const out: string[] = [];
    for (let c = 0; c < width; c++) {
      let v = String(r[c] ?? "").trim();
      if (dateCols[c] && /^\d{5}(\.\d+)?$/.test(v)) v = excelSerialToIso(parseFloat(v)) ?? v;
      out.push(v);
    }
    return out;
  });
  if (!rows.length) throw fail("В файле только заголовки, строк с данными нет");
  return { headers, rows, total, truncated };
}

/** Разбор файла (File есть и в браузере, и в Node ≥ 20). */
export async function parseFile(file: File): Promise<ParsedFile> {
  if (!file) throw fail("Файл не выбран");
  const name = String(file.name ?? "");
  const ext = (/\.([A-Za-z0-9]+)$/.exec(name) ?? [])[1]?.toLowerCase();
  if (ext !== "xlsx" && ext !== "csv")
    throw fail("Поддерживаются файлы .xlsx и .csv (старый формат .xls — сохраните как .xlsx)");
  if (file.size > MAX_BYTES) throw fail("Файл больше 5 МБ");
  if (file.size === 0) throw fail("Файл пустой");
  try {
    const buf = await file.arrayBuffer();
    if (ext === "csv") return normalize(parseCsv(decodeText(new Uint8Array(buf))));
    return normalize(await parseXlsx(buf));
  } catch (e) {
    throw isImportFailure(e) ? e : fail("Не удалось разобрать файл", e);
  }
}

/** Правила автоподбора колонок по заголовкам (как GUESS прототипа): порядок важен. */
const GUESS: readonly (readonly [MappingColumn, RegExp])[] = [
  ["email", /e-?mail|почт/i],
  ["phone", /телефон|phone|\bтел\b|моб/i],
  ["lastContact", /дат|date|последн/i],
  ["note", /коммент|примеч|note|заметк/i],
  ["name", /^(имя|фио|клиент|контакт|name|компания|company|организац)|имя|фио/i]
];

/** Автоподбор сопоставления колонок; без «имени» первая свободная колонка становится именем. */
export function guessMapping(headers: readonly string[]): MappingColumn[] {
  const map: MappingColumn[] = headers.map(() => "skip");
  const used = new Set<string>();
  for (const [field, re] of GUESS) {
    for (let i = 0; i < headers.length; i++) {
      if (!used.has(field) && map[i] === "skip" && re.test(headers[i] ?? "")) {
        map[i] = field;
        used.add(field);
        break;
      }
    }
  }
  if (!used.has("name")) {
    for (let j = 0; j < map.length; j++) {
      if (map[j] === "skip") {
        map[j] = "name";
        break;
      }
    }
  }
  return map;
}

export { MAX_BYTES, MAX_COLS, MAX_ROWS, MAX_UNZIP, ImportFailure, isImportFailure } from "@/lib/importer/base";
export { parseCsv, decodeText } from "@/lib/importer/csv";
