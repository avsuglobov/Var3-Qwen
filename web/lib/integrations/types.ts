import { z } from "zod";

/**
 * Типы слоя внешних интеграций (этап 8). Адаптеры выполняют реальные HTTP-запросы к внешним
 * сервисам — только на сервере (маршруты app/api/integrations/*): ключи хранятся в отдельном
 * файле .data/secrets.json вне снимка данных и отдаются в браузер только маскированными.
 */

/** Поле конфигурации интеграции: набор задаёт адаптер, значения вводятся вручную в диалоге «Ключи». */
export interface IntegrationFieldDef {
  key: string;
  label: string;
  /** Секретное поле: вводится как пароль, с сервера отдаётся только маска (последние 4 знака). */
  secret: boolean;
  /** Подсказка о формате значения. */
  hint?: string;
}

/** Итог одного вызова адаптера (проверки связи или синхронизации). */
export interface IntegrationRunOutcome {
  ok: boolean;
  detail: string;
  /** HTTP-статус внешнего сервиса; null — до ответа не дошло (сеть, таймаут, некорректная конфигурация). */
  status: number | null;
}

/** Действие прогона. */
export const integrationAction = z.enum(["check", "sync"]);
export type IntegrationAction = z.infer<typeof integrationAction>;

/** Сущность «лид», полученная от внешнего сервиса до маппинга в снимок (этап 9). */
export const externalLeadSchema = z.object({
  /** Идентификатор записи у внешнего сервиса (числовые id amoCRM/Bitrix24 приводятся к строке). */
  externalId: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  value: z.number().min(0).max(1_000_000_000).nullable()
});
export type ExternalLead = z.infer<typeof externalLeadSchema>;

/** Результат синхронизации: итог связи плюс — если адаптер переносит данные — полученные лиды. */
export type SyncResult = IntegrationRunOutcome & { leads?: ExternalLead[] };

/** Запись журнала интеграций (.data/integration-runs.json, вне снимка данных). */
export const integrationRunSchema = z.object({
  id: z.string().max(40),
  integrationId: z.string().max(40),
  action: integrationAction,
  ok: z.boolean(),
  detail: z.string().max(500),
  status: z.number().int().nullable(),
  latencyMs: z.number().int().min(0).nullable(),
  /** Время прогона, мс с эпохи. */
  at: z.number().int()
});
export type IntegrationRun = z.infer<typeof integrationRunSchema>;

/** Содержимое файла секретов: ключи не попадают в снимок, экспорт данных и клиент. */
export const credentialsFileSchema = z.object({
  version: z.literal(1),
  credentials: z.record(z.string().max(40), z.object({
    /** Только ключи, определённые адаптером этой интеграции (проверяется маршрутом при записи). */
    fields: z.record(z.string().max(100), z.string().max(2000)),
    updatedAt: z.number().int()
  }))
});
export type CredentialsFile = z.infer<typeof credentialsFileSchema>;

/**
 * Интерфейс адаптера внешнего сервиса. fetchImpl по умолчанию — глобальный fetch;
 * в unit-тестах подставляется заглушка, поэтому адаптеры проверяются без сети.
 */
export interface IntegrationAdapter {
  readonly id: string;
  readonly fields: readonly IntegrationFieldDef[];
  check(creds: Record<string, string>, fetchImpl?: typeof fetch): Promise<IntegrationRunOutcome>;
  /** Синхронизация: доступность сервиса, а с этапа 9 — и выборка лидов (leads, если адаптер переносит данные). */
  sync(creds: Record<string, string>, fetchImpl?: typeof fetch): Promise<SyncResult>;
}

/** Итог «до сети»: некорректная конфигурация адаптера (нет ключей, битый формат адреса). */
export function configError(detail: string): IntegrationRunOutcome {
  return { ok: false, detail, status: null };
}

/** Итог сетевой ошибки (DNS, отказ соединения, таймаут). Сообщение сервера обрезается. */
export function netError(e: unknown): IntegrationRunOutcome {
  return { ok: false, detail: `Сеть недоступна или таймаут: ${e instanceof Error ? e.message.slice(0, 200) : "ошибка запроса"}`, status: null };
}
