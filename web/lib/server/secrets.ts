import fs from "node:fs";
import path from "node:path";
import { credentialsFileSchema, type CredentialsFile } from "@/lib/integrations/types";

/**
 * Хранилище ключей внешних сервисов (этап 8): файл `.data/secrets.json` рядом со снимком,
 * но вне его — ключи не попадают в экспорт данных, в снимок и в клиент. Запись атомарная
 * (tmp + rename, права 0600); чтение — каждый раз с диска без кеша: e2e удаляет файл между
 * шагами, а dev-сервер переживает ручные правки.
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

/**
 * Маска для показа в браузере: короткие значения полностью закрываются, у длинных виден
 * только хвост. Полное значение с сервера не уходит никогда.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `••••${value.slice(-4)}`;
}
