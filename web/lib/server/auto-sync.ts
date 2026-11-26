import { INTEGRATION_ADAPTERS } from "@/lib/integrations/adapters";
import type { IntegrationRun } from "@/lib/integrations/types";
import { isRunInFlight, runIntegration } from "@/lib/server/integrations";
import { credentialsOf } from "@/lib/server/secrets";

/**
 * Серверный планировщик авто-синхронизации (этап 13): каждые 15 минут по каждой подключённой
 * интеграции (адаптер есть, ключи сохранены в .data/secrets.json) выполняется sync тем же
 * исполнителем, что и у ручной кнопки, — записи идут в тот же журнал прогонов. Параллельные
 * прогоны одной интеграции блокируются замком исполнителя: занятая (ручной прогон в полёте)
 * интеграция пропускается до следующего тика. Решения этапа (без UI): интервал фиксирован —
 * 15 минут; первый тик — после полного интервала, а не при старте сервера; в journal прогоны
 * не помечаются как автоматические. Старт — из instrumentation.ts (register(), только
 * nodejs-рантайм); идемпотентность через globalThis: dev-HMR не создаёт второй таймер.
 */

/** Интервал авто-синхронизации — 15 минут (решение этапа 13). */
export const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;

const globalAuto = globalThis as unknown as { __aiwsAutoSyncTimer?: NodeJS.Timeout };

/** Запускает планировщик; повторные вызовы (HMR, повторный register) второй таймер не создают. */
export function startAutoSync(): void {
  if (globalAuto.__aiwsAutoSyncTimer) return;
  const timer = setInterval(() => {
    void autoSyncTick();
  }, AUTO_SYNC_INTERVAL_MS);
  timer.unref?.(); // таймер не должен сам держать процесс сервера живым
  globalAuto.__aiwsAutoSyncTimer = timer;
}

/**
 * Один тик планировщика: подключённые и не занятые интеграции синхронизируются параллельно;
 * ошибка конфигурации (ApiError, например не заполнены обязательные ключи) наружу не падает —
 * причина пишется в лог сервера, в журнал прогона при этом не попадает (прогон не стартовал).
 */
export async function autoSyncTick(): Promise<void> {
  const runs: Array<{ id: string; run: Promise<IntegrationRun> }> = [];
  for (const adapter of INTEGRATION_ADAPTERS) {
    if (isRunInFlight(adapter.id)) continue;
    if (!credentialsOf(adapter.id)) continue; // ключи не сохранялись — интеграция не подключена
    runs.push({ id: adapter.id, run: runIntegration(adapter.id, "sync") });
  }
  const settled = await Promise.allSettled(runs.map((r) => r.run));
  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      console.warn(`[auto-sync] ${runs[i].id}: прогон не выполнен: ${s.reason instanceof Error ? s.reason.message : "неизвестная ошибка"}`);
    }
  });
}
