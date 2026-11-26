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
  /** Обязательное по умолчанию; false — необязательная альтернатива (например OAuth-тройка amoCRM). */
  required?: boolean;
}

/** Итог одного вызова адаптера (проверки связи или синхронизации). */
export interface IntegrationRunOutcome {
  ok: boolean;
  detail: string;
  /** HTTP-статус внешнего сервиса; null — до ответа не дошло (сеть, таймаут, некорректная конфигурация). */
  status: number | null;
  /**
   * Этап 10: обновившиеся ключи авторизации (OAuth amoCRM), которые исполнитель сохраняет
   * обратно в .data/secrets.json тем же атомарным механизмом; в браузер не отдаётся.
   */
  rotate?: Record<string, string>;
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

/** Результат синхронизации: итог связи плюс — если адаптер переносит данные — полученные лиды.
    Этап 12: truncated — изменённых записей больше потолка прогона; курсор не сдвигается,
    следующий прогон продолжит выгрузку с прежнего места. */
export type SyncResult = IntegrationRunOutcome & { leads?: ExternalLead[]; truncated?: boolean };

/** Кто запустил прогон: ручная кнопка или тик авто-синхронизации (этап 14). */
export const runTrigger = z.enum(["auto", "manual"]);
export type RunTrigger = z.infer<typeof runTrigger>;

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
  at: z.number().int(),
  /** Этап 14: кто запустил прогон; в записях до этапа 14 поля нет — журнал совместим со старыми файлами. */
  trigger: runTrigger.optional()
});
export type IntegrationRun = z.infer<typeof integrationRunSchema>;

/** Состояние входа через OAuth (этап 11): одноразовый state и время старта; лежит рядом с ключами. */
export const oauthPendingSchema = z.object({
  state: z.string().min(16).max(128),
  createdAt: z.number().int().positive()
});

/** Курсор инкрементальной синхронизации (этап 12): момент последнего успешного полного прогона. */
export const syncCursorSchema = z.object({
  /** Момент прогона, мс с эпохи: следующий sync фильтрует внешние записи «обновлённые с этого момента». */
  at: z.number().int().positive()
});
export type SyncCursor = z.infer<typeof syncCursorSchema>;

/** Состояние тумблера авто-синхронизации интеграции (этап 14). */
export const autoSyncStateSchema = z.object({ enabled: z.boolean() });
export type AutoSyncState = z.infer<typeof autoSyncStateSchema>;

/** Содержимое файла секретов: ключи не попадают в снимок, экспорт данных и клиент. */
export const credentialsFileSchema = z.object({
  version: z.literal(1),
  credentials: z.record(z.string().max(40), z.object({
    /** Только ключи, определённые адаптером этой интеграции (проверяется маршрутом при записи). */
    fields: z.record(z.string().max(100), z.string().max(2000)),
    updatedAt: z.number().int()
  })),
  /** Незавершённые входы через OAuth (этап 11): по интеграции — одноразовый state. */
  pending: z.record(z.string().max(40), oauthPendingSchema).optional(),
  /** Курсоры инкрементальной синхронизации (этап 12): по интеграции — момент последнего успешного полного прогона. */
  syncCursor: z.record(z.string().max(40), syncCursorSchema).optional(),
  /** Тумблер авто-синхронизации (этап 14): по интеграции — включена ли автосинхронизация (записи нет — включена). */
  autoSync: z.record(z.string().max(40), autoSyncStateSchema).optional()
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
  /**
   * Синхронизация: доступность сервиса, а с этапа 9 — и выборка лидов (leads, если адаптер переносит данные).
   * Этап 12: cursorAt (мс с эпохи) — курсор последнего успешного полного прогона; адаптер, поддерживающий
   * инкремент, фильтрует внешние записи «обновлённые с этого момента», пагинирует выборку до потолка
   * прогона и помечает обрезку флагом truncated. Источники без инкремента (webhook, демо) курсор игнорируют.
   */
  sync(creds: Record<string, string>, fetchImpl?: typeof fetch, cursorAt?: number): Promise<SyncResult>;
}

/** Итог «до сети»: некорректная конфигурация адаптера (нет ключей, битый формат адреса). */
export function configError(detail: string): IntegrationRunOutcome {
  return { ok: false, detail, status: null };
}

/** Итог сетевой ошибки (DNS, отказ соединения, таймаут). Сообщение сервера обрезается. */
export function netError(e: unknown): IntegrationRunOutcome {
  return { ok: false, detail: `Сеть недоступна или таймаут: ${e instanceof Error ? e.message.slice(0, 200) : "ошибка запроса"}`, status: null };
}
