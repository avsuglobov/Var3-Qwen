import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import { mailAccountSchema } from "@/lib/integrations/types";
import { guardApi } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { maskSecret, readMailBlock, writeMailBlock } from "@/lib/server/secrets";

/**
 * Учётные записи почтового канала (этап 21). GET — список с маской пароля (пароль никогда
 * не покидает сервер). POST — создание аккаунта (только админ: ключи почтового ящика —
 * секрет уровня интеграционных токенов). Папки: INBOX добавляется первой автоматически
 * (решение этапа 21), остальные — настраиваемые, до 10, латиница (без UTF-7).
 */

function strField(body: Record<string, unknown>, key: string, max: number, required: boolean): string | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim().length === 0)) {
    if (required) throw new ApiError("validation", `Не заполнено поле «${key}»`);
    return undefined;
  }
  if (typeof raw !== "string") throw new ApiError("validation", `Поле «${key}» должно быть строкой`);
  const value = raw.trim();
  if (value.length > max) throw new ApiError("validation", `Поле «${key}» длиннее ${max} знаков`);
  return value;
}

function portField(body: Record<string, unknown>, key: string, def: number): number {
  const raw = body[key];
  const port = raw === undefined || raw === "" ? def : typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError("validation", `Поле «${key}» должно быть целым числом от 1 до 65535`);
  return port;
}

/** Аккаунт для клиента: пароль заменён маской. */
function maskedAccount(account: { id: string; name: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; user: string; pass: string; from: string; folders: string[] }) {
  const { pass, ...rest } = account;
  return { ...rest, passMask: maskSecret(pass) };
}

/** GET /api/mail/accounts — список аккаунтов (маски) и настройки опроса. */
export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  const block = readMailBlock();
  return Response.json({
    accounts: (block?.accounts ?? []).map(maskedAccount),
    pollIntervalSec: block?.pollIntervalSec ?? 120,
    lastError: block?.lastError ?? {}
  });
}

/** POST /api/mail/accounts — добавление аккаунта (админ): поля mailAccountSchema, пароль — на сервер. */
export async function POST(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const name = strField(body, "name", 120, true);
    const imapHost = strField(body, "imapHost", 200, true);
    const smtpHost = strField(body, "smtpHost", 200, true);
    const user = strField(body, "user", 200, true);
    const pass = strField(body, "pass", 200, true);
    const from = strField(body, "from", 200, false) ?? user;
    const foldersRaw = body["folders"];
    const foldersParsed = Array.isArray(foldersRaw)
      ? foldersRaw.map((f) => String(f).trim()).filter((f) => f.length > 0 && f.length <= 200)
      : [];
    const folders = Array.from(new Set(["INBOX", ...foldersParsed])).slice(0, 10);
    const parsed = mailAccountSchema.safeParse({
      id: `ml-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      name: name ?? "",
      imapHost: imapHost ?? "",
      imapPort: portField(body, "imapPort", accountDefaultPort(body["imapSecure"], 993, 143)),
      imapSecure: body["imapSecure"] === true,
      smtpHost: smtpHost ?? "",
      smtpPort: portField(body, "smtpPort", accountDefaultPort(body["smtpSecure"], 465, 587)),
      smtpSecure: body["smtpSecure"] === true,
      user: user ?? "",
      pass: pass ?? "",
      from,
      folders
    });
    if (!parsed.success) throw new ApiError("validation", `Некорректные данные аккаунта: ${parsed.error.issues[0]?.message ?? "проверьте поля"}`);
    const account = parsed.data;
    const block = readMailBlock();
    if ((block?.accounts.length ?? 0) >= 5) throw new ApiError("validation", "Максимум 5 учётных записей (блок mail в secrets.json)");
    writeMailBlock({ accounts: [...(block?.accounts ?? []), account], pollIntervalSec: block?.pollIntervalSec ?? 120, cursors: block?.cursors, lastError: block?.lastError });
    return Response.json({ ok: true, account: maskedAccount(account) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Дефолтный порт по флагу TLS (поле порта может быть не задано). */
function accountDefaultPort(secure: unknown, securePort: number, plainPort: number): number {
  return secure === true ? securePort : plainPort;
}
