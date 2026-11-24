import fs from "node:fs";
import path from "node:path";
import { FAIL_FLAG_KEY, LATENCY_KEY, createLocalApi } from "@/lib/api/local-adapter";
import { ApiError, type Api, type ApiErrorCode, type StorageLike } from "@/lib/api/types";

/**
 * Серверное хранилище (этап 4): тот же движок, что и у адаптера localStorage (формат снимка `aiws-db-v2`,
 * Zod-валидация, демо-фикстуры), но состояние живёт в файле `.data/db.json`, а не в браузере.
 * Клиент работает с ним через REST-маршруты `app/api/*` и адаптер `lib/api/rest-adapter.ts`.
 *
 * Для e2e и демонстрации настоящих сетевых состояний — `/api/debug`: серверная задержка ответов,
 * имитация недоступности (503) и «повреждение» файла хранилища (приложение восстанавливает демо-данные).
 */

export interface Faults {
  /** Все запросы к данным отвечают 503 (имитация недоступности сервиса). */
  fail: boolean;
  /** Серверная задержка каждого ответа, мс (0 — без задержки). */
  latencyMs: number;
}

interface ServerStore {
  readonly api: Api;
  getFaults(): Faults;
  setFaults(patch: { fail?: boolean; latencyMs?: number }): Faults;
  /** Пишет в файл хранилища битый снимок и пересоздаёт движок: следующая загрузка отбросит битые коллекции. */
  corrupt(): void;
}

const DATA_DIR = (): string => process.env.AIWS_DATA_DIR ?? path.join(process.cwd(), ".data");
const DATA_FILE = (): string => path.join(DATA_DIR(), "db.json");
/** Известный битый снимок из проверок прототипа: не-массив вместо коллекции + запись с XSS-«id». */
const GARBAGE = JSON.stringify({ version: 1, LEADS: "oops", ONBOARDING: [{ id: 'x"><b id="pwn">', name: "x", done: true }] });

/** Хранилище-файл: JSON-объект «ключ → строка», атомарная запись через tmp+rename. */
function fileStorageLike(): StorageLike {
  const readAll = (): Record<string, string> => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(DATA_FILE(), "utf8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
    } catch {
      return {}; // файла нет или он бит — движок отдаст демо-данные и запишет их при первом сохранении
    }
  };
  const writeAll = (map: Record<string, string>): void => {
    fs.mkdirSync(DATA_DIR(), { recursive: true });
    const tmp = `${DATA_FILE()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(map));
    fs.renameSync(tmp, DATA_FILE());
  };
  return {
    getItem: (k) => readAll()[k] ?? null,
    setItem: (k, v) => writeAll({ ...readAll(), [k]: v }),
    removeItem: (k) => {
      const next = { ...readAll() };
      delete next[k];
      writeAll(next);
    }
  };
}

/** Флаги сбоя/задержки выдаются движку через те же ключи, что и в адаптере localStorage: guard() читает их из storage. */
function withFaults(storage: StorageLike, faults: Faults): StorageLike {
  return {
    getItem: (k) => {
      if (k === FAIL_FLAG_KEY) return faults.fail ? "1" : null;
      if (k === LATENCY_KEY) return faults.latencyMs > 0 ? String(faults.latencyMs) : null;
      return storage.getItem(k);
    },
    setItem: (k, v) => storage.setItem(k, v),
    removeItem: (k) => storage.removeItem(k)
  };
}

function createStore(): ServerStore {
  const faults: Faults = { fail: false, latencyMs: 0 };
  const storage = fileStorageLike();
  let engine: Api | null = null;
  const api = (): Api => {
    if (!engine) engine = createLocalApi({ storage: withFaults(storage, faults), latencyMs: 0 });
    return engine;
  };
  return {
    get api() {
      return api();
    },
    getFaults: () => ({ ...faults }),
    setFaults(patch) {
      if (patch.fail !== undefined) faults.fail = patch.fail;
      if (patch.latencyMs !== undefined) faults.latencyMs = Number.isFinite(patch.latencyMs) && patch.latencyMs > 0 ? patch.latencyMs : 0;
      return this.getFaults();
    },
    corrupt() {
      fs.mkdirSync(DATA_DIR(), { recursive: true });
      fs.writeFileSync(DATA_FILE(), GARBAGE);
      engine = null; // движок пересоздаётся: следующая загрузка разберёт битый файл и восстановит демо-данные
    }
  };
}

/** Синглтон через globalThis: dev-сервер пересоздаёт модуль при HMR, файл хранилища при этом общий. */
const globalStore = globalThis as unknown as { __aiwsServerStore?: ServerStore };

export function getServerStore(): ServerStore {
  if (!globalStore.__aiwsServerStore) globalStore.__aiwsServerStore = createStore();
  return globalStore.__aiwsServerStore;
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = { validation: 400, not_found: 404, duplicate: 409, invalid_import: 422, unavailable: 503 };

/** Ошибки слоя данных → HTTP-ответ с телом {code, message} (адаптер клиента разворачивает обратно в ApiError). */
export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ code: e.code, message: e.message }, { status: STATUS_BY_CODE[e.code] });
  console.error("[api] внутренняя ошибка:", e);
  return Response.json({ code: "unavailable", message: "Внутренняя ошибка сервиса" }, { status: 500 });
}

/** Тело запроса как JSON; битое тело — ApiError «validation» (маршруты не должны видеть SyntaxError). */
export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("validation", "Тело запроса не является корректным JSON");
  }
}
