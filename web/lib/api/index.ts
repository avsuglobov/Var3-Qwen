import { createLocalApi } from "@/lib/api/local-adapter";
import type { Api, StorageLike } from "@/lib/api/types";

export * from "@/lib/api/types";
export { createLocalApi, createMemoryStorage, STORAGE_KEY, FAIL_FLAG_KEY, LATENCY_KEY } from "@/lib/api/local-adapter";

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // доступ запрещён (приватный режим): адаптер перейдёт на память
  }
}

let instance: Api | null = null;

/** Единственная точка получения API. Замена на REST — здесь же (этап 10); остальной код зависит только от интерфейса `Api`. */
export function getApi(): Api {
  if (!instance) {
    const latency = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY_MS ?? 250);
    instance = createLocalApi({ storage: browserStorage(), latencyMs: Number.isFinite(latency) ? latency : 250 });
  }
  return instance;
}
