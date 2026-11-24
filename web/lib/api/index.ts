import { createLocalApi } from "@/lib/api/local-adapter";
import { createRestApi } from "@/lib/api/rest-adapter";
import type { Api, StorageLike } from "@/lib/api/types";

export * from "@/lib/api/types";
export { createLocalApi, createMemoryStorage, STORAGE_KEY, FAIL_FLAG_KEY, LATENCY_KEY } from "@/lib/api/local-adapter";
export { createRestApi } from "@/lib/api/rest-adapter";

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // доступ запрещён (приватный режим): адаптер перейдёт на память
  }
}

let instance: Api | null = null;

/**
 * Единственная точка получения API.
 * Этап 4: приложение работает через REST-адаптер (маршруты `app/api/*`, хранилище на сервере в формате прототипа).
 * Адаптер localStorage остаётся офлайн-вариантом интерфейса и используется в unit-тестах (`tests/api.test.ts`).
 */
export function getApi(): Api {
  if (!instance) instance = createRestApi();
  return instance;
}

/** Офлайн-адаптер (localStorage): оставлен как запасная реализация интерфейса и для тестов движка. */
export function createOfflineApi(options?: { storage?: StorageLike | null; latencyMs?: number }): Api {
  const latency = options?.latencyMs ?? Number(process.env.NEXT_PUBLIC_MOCK_LATENCY_MS ?? 250);
  return createLocalApi({ storage: options?.storage ?? browserStorage(), latencyMs: Number.isFinite(latency) ? latency : 250 });
}
