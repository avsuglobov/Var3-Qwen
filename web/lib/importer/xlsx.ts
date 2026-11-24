import { MAX_COLS, MAX_ROWS, MAX_UNZIP, fail } from "@/lib/importer/base";
import { findAll, findFirst, parseXml, textOfT, type XmlElement } from "@/lib/importer/xml";

/**
 * Разбор .xlsx (поведение `../download/importer.js`): .xlsx — это ZIP; читаем центральный каталог,
 * распаковываем deflate через DecompressionStream, парсим sharedStrings и первый лист.
 * Лимиты защищают от огромных файлов и «zip-бомб». Работает в Node (vitest) и в браузере.
 */

const UTF8 = new TextDecoder("utf-8");

function u16(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;
}

interface ZipEntry {
  method: number;
  csize: number;
  usize: number;
  local: number;
}

function readZip(u8: Uint8Array): Record<string, ZipEntry> {
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (u32(u8, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw fail("Файл не похож на Excel (.xlsx): не найден ZIP-каталог");
  const count = u16(u8, eocd + 10);
  const off = u32(u8, eocd + 16);
  if (count === 0xffff || off === 0xffffffff) throw fail("Файлы ZIP64 не поддерживаются");
  const entries: Record<string, ZipEntry> = {};
  let p = off;
  for (let n = 0; n < count; n++) {
    if (u32(u8, p) !== 0x02014b50) throw fail("Повреждён ZIP-каталог файла");
    const nameLen = u16(u8, p + 28);
    const extraLen = u16(u8, p + 30);
    const commentLen = u16(u8, p + 32);
    const name = UTF8.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries[name] = { method: u16(u8, p + 10), csize: u32(u8, p + 20), usize: u32(u8, p + 24), local: u32(u8, p + 42) };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  const DS = globalThis.DecompressionStream;
  if (!DS) throw fail("Браузер не поддерживает распаковку .xlsx. Сохраните файл как CSV и загрузите его");
  const ds = new DS("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  void writer.write(raw as unknown as BufferSource).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (total > MAX_UNZIP) {
        void reader.cancel().catch(() => undefined);
        throw fail("Файл слишком большой после распаковки");
      }
      chunks.push(r.value);
    }
  } catch (e) {
    throw isFailure(e) ? e : fail("Файл повреждён: не удалось распаковать", e);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Локальный маркер ImportFailure без импорта (base.ts импортирует сюда только fail). */
type ImportFailureLike = { readonly name: "ImportFailure" };

function isFailure(e: unknown): e is ImportFailureLike {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "ImportFailure";
}

async function entryBytes(u8: Uint8Array, entries: Record<string, ZipEntry>, name: string): Promise<Uint8Array | null> {
  const e = entries[name];
  if (!e) return null;
  if (e.usize > MAX_UNZIP) throw fail("Файл слишком большой после распаковки");
  const lo = e.local;
  if (u32(u8, lo) !== 0x04034b50) throw fail("Повреждён ZIP-файл");
  const start = lo + 30 + u16(u8, lo + 26) + u16(u8, lo + 28);
  const raw = u8.subarray(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw fail("Неподдерживаемый способ сжатия в .xlsx");
}

/** Атрибут r="A1" → индекс колонки (0-й — A). */
function colIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref ?? "");
  if (!m) return -1;
  let n = 0;
  for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
  return n - 1;
}

/** Путь к первому листу: по связи workbook→rels, иначе первый xl/worksheets/sheetN.xml по номеру. */
function firstSheetPath(entries: Record<string, ZipEntry>, wb?: XmlElement, rels?: XmlElement): string | null {
  if (wb && rels) {
    const sheet = findFirst(wb, "sheet");
    const rid = sheet?.attrs["r:id"];
    if (rid) {
      for (const rel of findAll(rels, "Relationship")) {
        if (rel.attrs["Id"] === rid) {
          let t = rel.attrs["Target"] ?? "";
          if (!t) continue;
          t = t.startsWith("/") ? t.slice(1) : "xl/" + t;
          if (entries[t]) return t;
        }
      }
    }
  }
  const names = Object.keys(entries)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10));
  return names[0] ?? null;
}

/** Матрица строк первого листа (значения ячеек — строки; пустые строки пропущены). */
export async function parseXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const u8 = new Uint8Array(buf);
  const entries = readZip(u8);
  const wbXml = await entryBytes(u8, entries, "xl/workbook.xml");
  const relsXml = await entryBytes(u8, entries, "xl/_rels/workbook.xml.rels");
  const sstXml = await entryBytes(u8, entries, "xl/sharedStrings.xml");
  const wb = wbXml ? parseXml(UTF8.decode(wbXml), "workbook") : undefined;
  const rels = relsXml ? parseXml(UTF8.decode(relsXml), "rels") : undefined;
  const path = firstSheetPath(entries, wb, rels);
  if (!path) throw fail("В файле нет листов Excel");
  const sst: string[] = [];
  if (sstXml) for (const si of findAll(parseXml(UTF8.decode(sstXml), "sharedStrings"), "si")) sst.push(textOfT(si));
  const sheetBytes = await entryBytes(u8, entries, path);
  if (!sheetBytes) throw fail("В файле нет листов Excel");
  const doc = parseXml(UTF8.decode(sheetBytes), "лист");
  const rows: string[][] = [];
  for (const rowEl of findAll(doc, "row")) {
    if (rows.length > MAX_ROWS + 50) break;
    const row: string[] = [];
    let any = false;
    for (const c of rowEl.children) {
      if (c.name !== "c") continue;
      let idx = colIndex(c.attrs["r"] ?? "");
      if (idx < 0) idx = row.length;
      if (idx >= MAX_COLS) continue;
      const t = c.attrs["t"] ?? "";
      let val = "";
      if (t === "s") {
        const v = findFirst(c, "v");
        const n = v ? parseInt(v.text, 10) : NaN;
        val = Number.isFinite(n) ? (sst[n] ?? "") : "";
      } else if (t === "inlineStr") {
        const is = findFirst(c, "is");
        val = is ? textOfT(is) : "";
      } else {
        const v = findFirst(c, "v");
        val = v ? v.text : "";
      }
      while (row.length <= idx) row.push("");
      row[idx] = val;
      if (val.trim() !== "") any = true;
    }
    if (any) rows.push(row);
  }
  return rows;
}
