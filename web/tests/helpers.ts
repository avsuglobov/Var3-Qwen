import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const ROOT = path.resolve(__dirname, "..");
export const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Содержимое блока `selector { … }` верхнего уровня в CSS. */
export function cssBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Блок ${selector} не найден`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error(`Блок ${selector} не закрыт`);
}

/** Значения токенов `--name: value;` из блока. */
export function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1] as string] = (m[2] as string).trim();
  return out;
}

export function listFiles(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(rel, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

/** Контраст WCAG между двумя #RRGGBB. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (v[0] as number) + 0.7152 * (v[1] as number) + 0.0722 * (v[2] as number);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Сырое содержимое backend под ключом снимка (этап 17, без гидрации вложений): db.json — у файлового драйвера, kv-таблица — у SQLite. */
export function rawStoredValue(dir: string, driver: "file" | "sqlite"): string {
  if (driver === "file") {
    return (JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8")) as Record<string, string>)["aiws-db-v2"] as string;
  }
  const db = new Database(path.join(dir, "db.sqlite3"), { readonly: true });
  try {
    return (db.prepare("SELECT value FROM kv WHERE key = ?").get("aiws-db-v2") as { value: string }).value;
  } finally {
    db.close();
  }
}
