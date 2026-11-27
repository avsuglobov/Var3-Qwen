import path from "node:path";
import { createFileDriver } from "./file-driver";
import { createSqliteDriver } from "./sqlite-driver";
import type { StorageDriver } from "./types";

export type { StorageDriver } from "./types";
export { blobId, blobRefId, isBlobRef } from "./attachments";

/**
 * Выбор драйвера хранения (этап 17): SQLite — дефолт (`better-sqlite3`), файловый драйвер
 * (`.data/db.json`) остаётся для dev и e2e — `AIWS_DB_DRIVER=file`. Каталог данных —
 * `AIWS_DATA_DIR` или `.data` рядом с приложением.
 */
export function createStorageDriver(dataDir = process.env.AIWS_DATA_DIR ?? path.join(process.cwd(), ".data")): StorageDriver {
  return process.env.AIWS_DB_DRIVER === "file" ? createFileDriver(dataDir) : createSqliteDriver(dataDir);
}
