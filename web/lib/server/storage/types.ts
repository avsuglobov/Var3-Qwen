import type { StorageLike } from "@/lib/api/types";

/**
 * Драйвер хранения (этап 17): backend под движком снимка `createLocalApi`.
 * Движок видит только `StorageLike` (одна JSON-строка снимка под ключом `aiws-db-v2`) —
 * физический носитель (файл или SQLite) ему неизвестен, REST-контракт `collections/*` и клиент не меняются.
 *
 * Вложения сообщений (этап 6) выносятся из снимка в blob-хранилище драйвера: в сохранённом снимке
 * вместо base64 остаётся ссылка `blob:<sha256>`, а наружу (getItem → API) — снова честный base64.
 */
export interface StorageDriver extends StorageLike {
  readonly name: "file" | "sqlite";
  /** Содержимое вложения по идентификатору sha256 (сырые байты, без base64-обёртки) — null, если нет. */
  getBlob(id: string): Buffer | null;
  /** Единая точка диагностики (e2e `/api/debug` corrupt): внутрь пишется битый снимок, движок восстановит демо-данные. */
  writeGarbage(garbage: string): void;
  /** Освобождение ресурсов (закрыть соединение SQLite). */
  close(): void;
}
