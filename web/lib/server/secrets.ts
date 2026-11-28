import fs from "node:fs";
import path from "node:path";
import { credentialsFileSchema, type AiBlock, type AuthBlock, type CredentialsFile, type NotificationsBlock } from "@/lib/integrations/types";

/**
 * Хранилище ключей внешних сервисов (этап 8): файл `.data/secrets.json` рядом со снимком,
 * но вне его — ключи не попадают в экспорт данных, в снимок и в клиент. Запись атомарная
 * (tmp + rename, права 0600); чтение — каждый раз с диска без кеша: e2e удаляет файл между
 * шагами, а dev-сервер переживает ручные правки. Этап 12: рядом с ключами лежат курсоры
 * инкрементальной синхронизации — момент последнего успешного полного прогона по интеграции.
 */

const SECRETS_FILE = "secrets.json";

function secretsPath(): string {
  return path.join(process.env.AIWS_DATA_DIR ?? path.join(process.cwd(), ".data"), SECRETS_FILE);
}

/** Читает файл секретов; файла нет или он бит — пустой набор (валидация отбрасывает мусор). */
export function readCredentials(): CredentialsFile {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(secretsPath(), "utf8"));
    const file = credentialsFileSchema.safeParse(parsed);
    return file.success ? file.data : { version: 1, credentials: {} };
  } catch {
    return { version: 1, credentials: {} };
  }
}

/** Атомарно записывает файл секретов с правами 0600. */
export function writeCredentials(file: CredentialsFile): void {
  fs.mkdirSync(path.dirname(secretsPath()), { recursive: true });
  const tmp = `${secretsPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
  fs.renameSync(tmp, secretsPath());
}

/** Сохранённые поля интеграции; null — ключи ещё не задавались. */
export function credentialsOf(integrationId: string): { fields: Record<string, string>; updatedAt: number } | null {
  return readCredentials().credentials[integrationId] ?? null;
}

/** Сохраняет набор полей интеграции целиком (диалог «Ключи» отправляет все поля адаптера). */
export function saveCredentials(integrationId: string, fields: Record<string, string>): void {
  const file = readCredentials();
  file.credentials[integrationId] = { fields, updatedAt: Date.now() };
  writeCredentials(file);
}

/** Курсор синхронизации интеграции (мс с эпохи); null — успешного полного прогона ещё не было. */
export function syncCursorOf(integrationId: string): number | null {
  return readCredentials().syncCursor?.[integrationId]?.at ?? null;
}

/** Сохраняет курсор инкрементальной синхронизации — только после успешного полного прогона (этап 12). */
export function saveSyncCursor(integrationId: string, at: number): void {
  const file = readCredentials();
  file.syncCursor = { ...file.syncCursor, [integrationId]: { at } };
  writeCredentials(file);
}

/** Этап 14: включена ли авто-синхронизация интеграции; записи нет — включена (поведение этапа 13). */
export function autoSyncEnabledOf(integrationId: string): boolean {
  return readCredentials().autoSync?.[integrationId]?.enabled ?? true;
}

/** Сохраняет тумблер авто-синхронизации («Интеграции» → карточка, этап 14). */
export function saveAutoSync(integrationId: string, enabled: boolean): void {
  const file = readCredentials();
  file.autoSync = { ...file.autoSync, [integrationId]: { enabled } };
  writeCredentials(file);
}

/** Блок защиты API (этап 15); null — PIN ещё не задан, API открыт для первичной настройки. */
export function readAuthBlock(): AuthBlock | null {
  return readCredentials().auth ?? null;
}

/**
 * Блок настроек LLM-провайдера (этап 16); null — провайдер не настроен, маршруты /api/ai/*
 * отвечают scripted-fallback с пометкой «демо-ответ». Ключ никогда не уходит в браузер целиком.
 */
export function readAiBlock(): AiBlock | null {
  return readCredentials().ai ?? null;
}

/** Блок уведомлений (этап 20): SMTP-сервер, тумблеры событий, последняя ошибка отправки. */
export function readNotificationsBlock(): NotificationsBlock | null {
  return readCredentials().notifications ?? null;
}

/** Атомарно сохраняет блок уведомлений целиком (маршруты /api/notifications, движок событий). */
export function writeNotificationsBlock(notifications: NotificationsBlock): void {
  const file = readCredentials();
  file.notifications = notifications;
  writeCredentials(file);
}

/** Атомарно сохраняет блок защиты (PIN-хэш и сессии) в secrets.json. */
export function writeAuthBlock(auth: AuthBlock): void {
  const file = readCredentials();
  file.auth = auth;
  writeCredentials(file);
}

/**
 * Маска для показа в браузере: короткие значения полностью закрываются, у длинных виден
 * только хвост. Полное значение с сервера не уходит никогда.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `••••${value.slice(-4)}`;
}
