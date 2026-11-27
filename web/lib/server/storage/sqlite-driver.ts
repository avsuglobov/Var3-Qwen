import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { STORAGE_KEY } from "@/lib/api/local-adapter";
import { extractBlobs, hydrateBlobs } from "./attachments";
import type { StorageDriver } from "./types";

/**
 * SQLite-драйвер (этап 17, дефолт): better-sqlite3, база `.data/db.sqlite3`.
 * Таблицы: `kv` — строка снимка под ключом `aiws-db-v2` (движок снимка не меняется),
 * `blobs` — содержимое вложений (BLOB, адресация sha256). Существующий `.data/db.json`
 * импортируется при первом запуске, если база ещё пуста (миграция без потери данных);
 * старый файл остаётся рядом как резервная копия.
 *
 * Ограничение — один инстанс процесса на каталог данных (планировщик in-process, см. этап 14):
 * запись снимка целиком идемпотентна, внешние блокировки не нужны. Postgres имеет смысл
 * только при мультиинстанс-развёртывании — в объём этапа не входит.
 */
export function createSqliteDriver(dataDir: string): StorageDriver {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "db.sqlite3"));
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, bytes BLOB NOT NULL);"
  );

  const getStmt = db.prepare<[string], { value: string }>("SELECT value FROM kv WHERE key = ?");
  const putStmt = db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const delStmt = db.prepare("DELETE FROM kv WHERE key = ?");
  const blobPutStmt = db.prepare("INSERT INTO blobs (id, bytes) VALUES (?, ?) ON CONFLICT(id) DO NOTHING");
  const blobGetStmt = db.prepare<[string], { bytes: Buffer }>("SELECT bytes FROM blobs WHERE id = ?");
  const blobDelStmt = db.prepare("DELETE FROM blobs WHERE id = ?");
  const blobIdsStmt = db.prepare<[], { id: string }>("SELECT id FROM blobs");

  const isEmpty = (): boolean => db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM kv").get()!.n === 0;

  const putBlob = (id: string, bytes: Buffer): void => void blobPutStmt.run(id, bytes);
  const getBlob = (id: string): Buffer | null => blobGetStmt.get(id)?.bytes ?? null;
  const gc = (refs: Set<string>): void => {
    for (const { id } of blobIdsStmt.all()) if (!refs.has(id)) blobDelStmt.run(id);
  };

  // Миграция JSON → SQLite: legacy db.json переносится при первом запуске — сразу с выносом
  // вложений в blobs (base64 в сохранённом снимке не остаётся). Файл остаётся как резервная копия.
  const legacy = path.join(dataDir, "db.json");
  if (isEmpty() && fs.existsSync(legacy)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(legacy, "utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, string>))
          if (typeof v === "string") putStmt.run(k, extractBlobs(v, putBlob).snapshot);
      }
    } catch (e) {
      console.error("[storage] миграция db.json не удалась (файл оставлен как есть):", e);
    }
  }

  return {
    name: "sqlite",
    getItem: (k) => {
      const row = getStmt.get(k);
      return row ? hydrateBlobs(row.value, getBlob) : null;
    },
    setItem: (k, v) => {
      const { snapshot, refs } = extractBlobs(v, putBlob);
      putStmt.run(k, snapshot);
      gc(refs);
    },
    removeItem: (k) => void delStmt.run(k),
    getBlob,
    writeGarbage(garbage) {
      putStmt.run(STORAGE_KEY, garbage);
    },
    close: () => db.close()
  };
}
