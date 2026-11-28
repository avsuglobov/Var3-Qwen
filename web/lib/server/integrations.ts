import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import { adapterOf } from "@/lib/integrations/adapters";
import { importExternalLeads } from "@/lib/integrations/import-map";
import type { IntegrationAction, IntegrationRun, IntegrationRunOutcome, RunTrigger, SyncResult } from "@/lib/integrations/types";
import { INTEGRATIONS } from "@/lib/mock-data/reference";
import { appendRun } from "@/lib/server/runs";
import { credentialsOf, saveCredentials, saveSyncCursor, syncCursorOf } from "@/lib/server/secrets";
import { notifyEvent } from "@/lib/server/notify";
import { getServerStore } from "@/lib/server/store";

/**
 * Исполнитель прогонов интеграций (этапы 8–10): проверка ключей, реальный вызов адаптера,
 * запись в журнал. Этап 9: если синхронизация принесла выборку лидов — она маппится и
 * записывается в снимок (апсерт по детерминированному id ext-<источник>-<внешний id>),
 * а в детали прогона появляются счётчики «импортировано N (новых M, обновлено K)».
 * Этап 10: если адаптер обновил OAuth-токены (rotate) — новые ключи сохраняются в
 * .data/secrets.json тем же атомарным механизмом, в детали добавляется пометка.
 * Этап 12: синхронизация инкрементальная — курсор последнего успешного полного прогона
 * хранится в secrets.json и передаётся адаптеру; полный прогон сдвигает курсор, обрезанный
 * потолком (truncated) — нет, следующий прогон продолжит выгрузку с прежнего места.
 * Ошибка конфигурации (нет обязательных ключей) — 400 клиенту; сетевая ошибка внешнего
 * сервиса или ошибка записи — это валидный результат прогона (ok:false) в журнале и UI.
 * fetchImpl — секам для unit-тестов; в продакшене используется глобальный fetch.
 * Этап 13: параллельные прогоны одной интеграции блокируются — ручной прогон при занятой
 * интеграции отвечает 409 duplicate, тик авто-синхронизации занятую интеграцию пропускает.
 * Этап 14: у прогона есть trigger — ручная кнопка «manual», тик планировщика «auto»
 * (в журнале и UI показывается припиской «(авто)»); старые записи без поля остаются валидны.
 */

/** Слаг источника для id лидов: int-amocrm → amocrm, int-demo → demo. */
function sourceSlug(integrationId: string): string {
  return integrationId.replace(/^int-/, "").slice(0, 20);
}

/** Подпись источника в note/событиях: имя карточки справочника, для int-demo — «Демо-источник». */
function sourceLabel(integrationId: string): string {
  return INTEGRATIONS.find((it) => it.id === integrationId)?.name ?? "Демо-источник";
}

/** Этап 13: замки прогонов по интеграции; в globalThis — dev-HMR пересоздаёт модуль, замок общий. */
const globalLocks = globalThis as unknown as { __aiwsRunLocks?: Set<string> };
const runLocks: Set<string> = (globalLocks.__aiwsRunLocks ??= new Set());

/** true — прогон этой интеграции сейчас выполняется (ручной или автоматический). */
export function isRunInFlight(integrationId: string): boolean {
  return runLocks.has(integrationId);
}

/** Занимает замок интеграции; false — прогон уже выполняется (пока держится, новый не стартует). */
export function acquireRunLock(integrationId: string): boolean {
  if (runLocks.has(integrationId)) return false;
  runLocks.add(integrationId);
  return true;
}

/** Освобождает замок после завершения прогона (вызывается в finally). */
export function releaseRunLock(integrationId: string): void {
  runLocks.delete(integrationId);
}

export async function runIntegration(integrationId: string, action: IntegrationAction, fetchImpl: typeof fetch = fetch, trigger: RunTrigger = "manual"): Promise<IntegrationRun> {
  if (!acquireRunLock(integrationId)) {
    throw new ApiError("duplicate", "Для этой интеграции уже выполняется прогон — дождитесь его завершения");
  }
  try {
    const adapter = adapterOf(integrationId);
    if (!adapter) throw new ApiError("not_found", `Для интеграции ${integrationId} адаптер пока не реализован`);
    const saved = credentialsOf(integrationId);
    const creds = saved?.fields ?? {};
    const missing = adapter.fields.filter((f) => (f.required ?? true) && !(creds[f.key] ?? "").trim()).map((f) => f.label);
    if (missing.length > 0) {
      throw new ApiError("validation", `Не заполнены ключи (${missing.join(", ")}) — нажмите «Ключи» и заполните поля`);
    }
    // Этап 12: курсор инкремента — момент последнего успешного полного прогона (null — его ещё не было).
    const cursorAt = action === "sync" ? syncCursorOf(integrationId) : null;
    const started = Date.now();
    // Этап 20: количество новых лидов прогона — для события «Новый лид» (эскалация наружу).
    let importedNew = 0;
    let outcome: IntegrationRunOutcome | SyncResult;
    try {
      outcome = action === "check" ? await adapter.check(creds, fetchImpl) : await adapter.sync(creds, fetchImpl, cursorAt ?? undefined);
      // Этап 10: адаптер мог обновить OAuth-токены — сохраняем новые ключи рядом с остальными.
      if (outcome.ok && outcome.rotate) {
        saveCredentials(integrationId, { ...creds, ...outcome.rotate });
        outcome = { ...outcome, detail: `${outcome.detail}; токен доступа обновлён и сохранён` };
      }
      // Этап 9: синхронизация с выборкой лидов — апсерт в снимок через серверное хранилище.
      if (action === "sync" && outcome.ok && "leads" in outcome && outcome.leads) {
        const leads = outcome.leads;
        const api = getServerStore().api;
        const funnels = await api.reference.funnels();
        const funnel = funnels[0];
        if (!funnel) throw new Error("в справочнике нет воронок для размещения импортированных лидов");
        const counts = await importExternalLeads(api.leads, sourceSlug(integrationId), leads, {
          funnelId: funnel.id,
          stageId: funnel.stages[0],
          agentId: funnel.agentId,
          sourceLabel: sourceLabel(integrationId),
          now: Date.now()
        });
        // Этап 12: полный (необрезанный) прогон сдвигает курсор — следующий принесёт только обновления;
        // обрезанный потолком оставляет курсор на месте, следующий прогон продолжит выгрузку с прежнего места.
        const truncated = outcome.truncated === true;
        if (!truncated) saveSyncCursor(integrationId, started);
        const cursorNote = truncated
          ? "изменённых записей больше потолка прогона — курсор не сдвинут, повторите синхронизацию"
          : "курсор синхронизации обновлён";
        importedNew = counts.created;
        outcome = {
          ...outcome,
          detail: `${outcome.detail}; импортировано ${counts.created + counts.updated} (новых ${counts.created}, обновлено ${counts.updated}); ${cursorNote}`
        };
      }
    } catch (e) {
      outcome = { ok: false, detail: `Ошибка прогона: ${e instanceof Error ? e.message.slice(0, 200) : "неизвестная ошибка"}`, status: null };
    }
    const run: IntegrationRun = {
      id: randomUUID(),
      integrationId,
      action,
      ok: outcome.ok,
      detail: outcome.detail.slice(0, 500),
      status: outcome.status,
      latencyMs: Date.now() - started,
      at: started,
      trigger
    };
    appendRun(run);
    // Этап 20: уведомления о синхронизации — fire-and-forget, результат прогона не меняют.
    // «Новый лид» — новые лиды у любого прогона; «Итог синхронизации» и «Ошибка агента
    // (КРИТИЧНО)» — только авто-прогоны: ручной пользователь и так видит в журнале.
    if (action === "sync" && run.ok && importedNew > 0) {
      void notifyEvent("Новый лид", {
        subject: `Новые лиды: ${integrationId} — импортировано ${importedNew}`,
        lines: [`Интеграция ${integrationId}: ${run.detail.slice(0, 300)}.`, "Новые лиды размещены в первой стадии воронки — требуют разбора."]
      });
    }
    if (trigger === "auto" && action === "sync") {
      if (run.ok) {
        void notifyEvent("Итог синхронизации", {
          subject: `Итог синхронизации: ${integrationId}`,
          lines: [run.detail.slice(0, 400)]
        });
      } else {
        void notifyEvent("Ошибка агента (КРИТИЧНО)", {
          subject: `Сбой авто-синхронизации: ${integrationId}`,
          lines: [`Интеграция ${integrationId}: ${run.detail.slice(0, 300)}.`, "Авто-синхронизация выполнена с ошибкой — проверьте журнал интеграций."]
        });
      }
    }
    return run;
  } finally {
    releaseRunLock(integrationId);
  }
}
