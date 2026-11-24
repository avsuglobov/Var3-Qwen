import { fail } from "@/lib/importer/base";

/**
 * Разбор CSV (поведение `decodeCsv`/`parseCSV` прототипа): автоопределение разделителя
 * по первой строке («;», «,», таб), кавычки с удвоением и переносами строк внутри ячейки,
 * UTF-8 с BOM; если текст декодировался с заменой символов — повторная попытка в windows-1251
 * (русскоязычный Excel часто сохраняет CSV в cp1251).
 */

export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (utf8.charCodeAt(0) === 0xfeff) return utf8.slice(1);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1251").decode(bytes);
  } catch {
    return utf8;
  }
}

export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? "";
  let delim = ";";
  let best = -1;
  for (const d of [";", ",", "\t"]) {
    const n = first.split(d).length - 1;
    if (n > best) {
      best = n;
      delim = d;
    }
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Проверка кодировки (для тестов): текст без «битых» символов после декодирования. */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes.length === 0) throw fail("В файле нет данных");
  return decodeText(bytes);
}
