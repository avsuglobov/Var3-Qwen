import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/lib/api/local-adapter";
import { createFileDriver } from "@/lib/server/storage/file-driver";
import { createSqliteDriver } from "@/lib/server/storage/sqlite-driver";
import { blobId, createStorageDriver, type StorageDriver } from "@/lib/server/storage";
import { rawStoredValue } from "./helpers";

/**
 * Этап 17: parity-тесты драйверов хранения — один набор сценариев для файлового драйвера (dev/e2e)
 * и SQLite (дефолт). Проверяются: снимок (get/set/remove), вынос вложений в blob-хранилище
 * (ссылка `blob:<sha256>` в сохранённом снимке, честный base64 наружу), дедупликация, сборка мусора,
 * живучесть при недоступном blob, битый снимок (диагностика /api/debug), миграция legacy db.json.
 */

const BYTES = Buffer.from("Привет из вложения — бриф.txt", "utf8");
const BASE64 = BYTES.toString("base64");
const OTHER_BASE64 = Buffer.from("другой файл", "utf8").toString("base64");
const GARBAGE = JSON.stringify({ version: 1, LEADS: "oops" });

const snapWith = (...data: (string | undefined)[]): string =>
  JSON.stringify({
    version: 1,
    CONVERSATIONS: [
      {
        id: "c1",
        contactName: "Иван",
        channel: "telegram",
        agentId: "a1",
        mode: "auto",
        messages: [
          {
            from: "client",
            text: "привет",
            attachments: data.map((d) => ({ name: "файл.txt", size: 10, mime: "text/plain", ...(d ? { data: d } : {}) }))
          }
        ]
      }
    ],
    LEADS: []
  });

function withDriver(create: (dir: string) => StorageDriver, fn: (driver: StorageDriver, dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-storage-"));
  try {
    fn(create(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Для тестов, где backend готовится до создания драйвера (миграция legacy db.json). */
function withDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-storage-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Что реально лежит в backend под ключом снимка (без гидрации движком). */
const rawSnapshot = (dir: string, name: "file" | "sqlite"): string => rawStoredValue(dir, name);

function blobCount(dir: string, name: "file" | "sqlite"): number {
  if (name === "file") {
    try {
      return fs.readdirSync(path.join(dir, "attachments")).length;
    } catch {
      return 0;
    }
  }
  return (new Database(path.join(dir, "db.sqlite3"), { readonly: true }).prepare("SELECT COUNT(*) AS n FROM blobs").get() as { n: number }).n;
}

const DRIVERS = [
  { name: "file" as const, create: createFileDriver },
  { name: "sqlite" as const, create: createSqliteDriver }
];

describe.each(DRIVERS)("драйвер $name", ({ name, create }) => {
  it("снимок: запись, чтение, отсутствие ключа, удаление", () =>
    withDriver(create, (driver) => {
      expect(driver.getItem(STORAGE_KEY)).toBeNull();
      driver.setItem(STORAGE_KEY, '{"version":1}');
      expect(driver.getItem(STORAGE_KEY)).toBe('{"version":1}');
      driver.setItem("other", "x");
      driver.removeItem(STORAGE_KEY);
      expect(driver.getItem(STORAGE_KEY)).toBeNull();
      expect(driver.getItem("other")).toBe("x");
    }));

  it("вложение: в backend — ссылка blob:<sha256>, наружу — исходный base64, getBlob — байты", () =>
    withDriver(create, (driver, dir) => {
      driver.setItem(STORAGE_KEY, snapWith(BASE64));
      const id = blobId(BYTES);
      expect(rawSnapshot(dir, name)).toContain(`blob:${id}`);
      expect(rawSnapshot(dir, name)).not.toContain(BASE64);
      const back = JSON.parse(driver.getItem(STORAGE_KEY)!);
      expect(back.CONVERSATIONS[0].messages[0].attachments[0].data).toBe(BASE64);
      expect(driver.getBlob(id)?.equals(BYTES)).toBe(true);
    }));

  it("одинаковое содержимое вложений хранится один раз, разное — отдельно", () =>
    withDriver(create, (driver, dir) => {
      driver.setItem(STORAGE_KEY, snapWith(BASE64, BASE64, OTHER_BASE64));
      expect(blobCount(dir, name)).toBe(2);
      const att = JSON.parse(driver.getItem(STORAGE_KEY)!).CONVERSATIONS[0].messages[0].attachments;
      expect(att.map((a: { data?: string }) => a.data)).toEqual([BASE64, BASE64, OTHER_BASE64]);
    }));

  it("сборка мусора: blob без ссылок в снимке удаляется", () =>
    withDriver(create, (driver, dir) => {
      driver.setItem(STORAGE_KEY, snapWith(BASE64));
      expect(blobCount(dir, name)).toBe(1);
      driver.setItem(STORAGE_KEY, snapWith());
      expect(blobCount(dir, name)).toBe(0);
      expect(driver.getBlob(blobId(BYTES))).toBeNull();
    }));

  it("недоступный blob не роняет переписку — поле data убирается", () =>
    withDriver(create, (driver, dir) => {
      driver.setItem(STORAGE_KEY, snapWith(BASE64));
      // перезаписываем снимок в backend ссылкой на несуществующий blob, минуя extract
      const stored = JSON.parse(rawSnapshot(dir, name));
      stored.CONVERSATIONS[0].messages[0].attachments[0].data = `blob:${"0".repeat(64)}`;
      driver.setItem(STORAGE_KEY, JSON.stringify(stored)); // extract пропустит уже-ссылку
      const back = JSON.parse(driver.getItem(STORAGE_KEY)!);
      const att = back.CONVERSATIONS[0].messages[0].attachments[0];
      expect("data" in att).toBe(false);
      expect(att.name).toBe("файл.txt");
    }));

  it("не-снимочные ключи не трогаются (fault-флаги, прочие значения)", () =>
    withDriver(create, (driver) => {
      driver.setItem("aiws-mock-fail", "blob:abc");
      expect(driver.getItem("aiws-mock-fail")).toBe("blob:abc");
      driver.setItem("plain", "не json вовсе");
      expect(driver.getItem("plain")).toBe("не json вовсе");
    }));

  it("writeGarbage: битый снимок читается как есть (движок восстановит демо-данные)", () =>
    withDriver(create, (driver) => {
      driver.setItem(STORAGE_KEY, snapWith());
      driver.writeGarbage(GARBAGE);
      expect(driver.getItem(STORAGE_KEY)).toBe(GARBAGE);
    }));
});

describe("миграция legacy db.json (этап 17)", () => {
  it("файловый драйвер: base64 в db.json читается, при первом сохранении уходит в blob-файлы", () =>
    withDir((dir) => {
      fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ [STORAGE_KEY]: snapWith(BASE64) }));
      const driver = createFileDriver(dir);
      expect(JSON.parse(driver.getItem(STORAGE_KEY)!).CONVERSATIONS[0].messages[0].attachments[0].data).toBe(BASE64);
      driver.setItem(STORAGE_KEY, snapWith(BASE64));
      expect(blobCount(dir, "file")).toBe(1);
      expect(rawSnapshot(dir, "file")).toContain(`blob:${blobId(BYTES)}`);
    }));

  it("SQLite-драйвер: пустая база + db.json → содержимое импортировано, вложение в blobs", () =>
    withDir((dir) => {
      fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ [STORAGE_KEY]: snapWith(BASE64) }));
      const driver = createSqliteDriver(dir);
      expect(JSON.parse(driver.getItem(STORAGE_KEY)!).CONVERSATIONS[0].messages[0].attachments[0].data).toBe(BASE64);
      expect(blobCount(dir, "sqlite")).toBe(1);
      expect(rawSnapshot(dir, "sqlite")).toContain(`blob:${blobId(BYTES)}`);
      // legacy-файл остаётся как резервная копия, повторная инициализация ничего не затирает
      expect(fs.existsSync(path.join(dir, "db.json"))).toBe(true);
    }));

  it("SQLite-драйвер: существующая база не перечитывает db.json заново", () =>
    withDir((dir) => {
      const driver = createSqliteDriver(dir);
      driver.setItem(STORAGE_KEY, '{"version":1,"CONVERSATIONS":[],"LEADS":[]}');
      fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ [STORAGE_KEY]: snapWith(BASE64) }));
      expect(driver.getItem(STORAGE_KEY)).toBe('{"version":1,"CONVERSATIONS":[],"LEADS":[]}');
    }));
});

describe("выбор драйвера (AIWS_DB_DRIVER)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("по умолчанию — SQLite, AIWS_DB_DRIVER=file — файловый", () => {
    vi.stubEnv("AIWS_DB_DRIVER", "");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-select-"));
    try {
      expect(createStorageDriver(dir).name).toBe("sqlite");
      vi.stubEnv("AIWS_DB_DRIVER", "file");
      expect(createStorageDriver(dir).name).toBe("file");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
