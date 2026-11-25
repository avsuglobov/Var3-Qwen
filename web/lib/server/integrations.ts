import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import { adapterOf } from "@/lib/integrations/adapters";
import { importExternalLeads } from "@/lib/integrations/import-map";
import type { IntegrationAction, IntegrationRun, IntegrationRunOutcome, SyncResult } from "@/lib/integrations/types";
import { INTEGRATIONS } from "@/lib/mock-data/reference";
import { appendRun } from "@/lib/server/runs";
import { credentialsOf } from "@/lib/server/secrets";
import { getServerStore } from "@/lib/server/store";

/**
 * Исполнитель прогонов интеграций (этапы 8–9): проверка ключей, реальный вызов адаптера,
 * запись в журнал. Этап 9: если синхронизация принесла выборку лидов — она маппится и
 * записывается в снимок (апсерт по детерминированному id ext-<источник>-<внешний id>),
 * а в детали прогона появляются счётчики «импортировано N (новых M, обновлено K)».
 * Ошибка конфигурации (нет ключей) — 400 клиенту; сетевая ошибка внешнего сервиса или
 * ошибка записи — это валидный результат прогона (ok:false) в журнале и интерфейсе.
 */

/** Слаг источника для id лидов: int-amocrm → amocrm, int-demo → demo. */
function sourceSlug(integrationId: string): string {
  return integrationId.replace(/^int-/, "").slice(0, 20);
}

/** Подпись источника в note/событиях: имя карточки справочника, для int-demo — «Демо-источник». */
function sourceLabel(integrationId: string): string {
  return INTEGRATIONS.find((it) => it.id === integrationId)?.name ?? "Демо-источник";
}

export async function runIntegration(integrationId: string, action: IntegrationAction): Promise<IntegrationRun> {
  const adapter = adapterOf(integrationId);
  if (!adapter) throw new ApiError("not_found", `Для интеграции ${integrationId} адаптер пока не реализован`);
  const saved = credentialsOf(integrationId);
  const creds = saved?.fields ?? {};
  const missing = adapter.fields.filter((f) => !(creds[f.key] ?? "").trim()).map((f) => f.label);
  if (missing.length > 0) {
    throw new ApiError("validation", `Не заполнены ключи (${missing.join(", ")}) — нажмите «Ключи» и заполните поля`);
  }
  const started = Date.now();
  let outcome: IntegrationRunOutcome | SyncResult;
  try {
    outcome = action === "check" ? await adapter.check(creds) : await adapter.sync(creds);
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
      outcome = {
        ...outcome,
        detail: `${outcome.detail}; импортировано ${counts.created + counts.updated} (новых ${counts.created}, обновлено ${counts.updated})`
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
    at: started
  };
  appendRun(run);
  return run;
}
