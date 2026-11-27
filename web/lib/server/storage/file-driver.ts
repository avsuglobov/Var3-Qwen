import fs from "node:fs";
import path from "node:path";
import { STORAGE_KEY } from "@/lib/api/local-adapter";
import { extractBlobs, hydrateBlobs } from "./attachments";
import type { StorageDriver } from "./types";

/**
 * Файловый драйвер (этап 4 → этап 17): JSON-файл «ключ → строка» с атомарной записью через tmp+rename
 * остаётся для dev и e2e; снимок — `.data/db.json`, содержимое вложений — файлы в `.data/attachments/<sha256>`.
 * Старый формат (base64 прямо в db.json) читается как есть и переносится в blob-файлы при первом сохранении.
 */
export function createFileDriver(dataDir: string): StorageDriver {
  const file = path.join(dataDir, "db.json");
  const attachDir = path.join(dataDir, "attachments");

  const readAll = (): Record<string, string> => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
    } catch {
      return {}; // файла нет или он бит — движок отдаст демо-данные и запишет их при первом сохранении
    }
  };
  const writeAll = (map: Record<string, string>): void => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(map));
    fs.renameSync(tmp, file);
  };
  const putBlob = (id: string, bytes: Buffer): void => {
    fs.mkdirSync(attachDir, { recursive: true });
    fs.writeFileSync(path.join(attachDir, id), bytes);
  };
  const getBlob = (id: string): Buffer | null => {
    try {
      return fs.readFileSync(path.join(attachDir, id));
    } catch {
      return null;
    }
  };
  const gc = (refs: Set<string>): void => {
    let names: string[];
    try {
      names = fs.readdirSync(attachDir);
    } catch {
      return; // каталога нет — удалять нечего
    }
    for (const name of names) if (!refs.has(name)) fs.rmSync(path.join(attachDir, name), { force: true });
  };

  return {
    name: "file",
    getItem: (k) => {
      const raw = readAll()[k];
      return raw === undefined ? null : hydrateBlobs(raw, getBlob);
    },
    setItem: (k, v) => {
      const { snapshot, refs } = extractBlobs(v, putBlob);
      writeAll({ ...readAll(), [k]: snapshot });
      gc(refs);
    },
    removeItem: (k) => {
      const next = { ...readAll() };
      delete next[k];
      writeAll(next);
    },
    getBlob,
    writeGarbage(garbage) {
      // под ключ снимка — как у SQLite-драйвера: движок разберёт битый JSON и восстановит демо-данные
      writeAll({ [STORAGE_KEY]: garbage });
    },
    close() {
      /* у файлового драйвера нет открытых ресурсов */
    }
  };
}
