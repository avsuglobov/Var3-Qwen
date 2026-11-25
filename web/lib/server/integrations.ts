import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import { adapterOf } from "@/lib/integrations/adapters";
import type { IntegrationAction, IntegrationRun } from "@/lib/integrations/types";
import { appendRun } from "@/lib/server/runs";
import { credentialsOf } from "@/lib/server/secrets";

/**
 * Исполнитель прогонов интеграций (этап 8): проверка ключей, реальный вызов адаптера,
 * запись в журнал. Маршруты /api/integrations/check и /api/integrations/sync отличаются
 * только действием. Ошибка конфигурации (нет ключей) — 400 клиенту; сетевая ошибка внешнего
 * сервиса — это валидный результат прогона (ok:false), он попадает в журнал и в интерфейс.
 */
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
  let outcome;
  try {
    outcome = action === "check" ? await adapter.check(creds) : await adapter.sync(creds);
  } catch (e) {
    outcome = { ok: false, detail: `Ошибка адаптера: ${e instanceof Error ? e.message.slice(0, 200) : "неизвестная ошибка"}`, status: null };
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
