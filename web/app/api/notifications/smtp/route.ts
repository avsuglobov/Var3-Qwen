import { ApiError } from "@/lib/api/types";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readNotificationsBlock, writeNotificationsBlock } from "@/lib/server/secrets";
import { guardApi } from "@/lib/server/auth";

/**
 * SMTP-ключи уведомлений (этап 20). Секреты хранятся в блоке `notifications` файла
 * .data/secrets.json — вне снимка, экспорта и клиента. PUT доступен только админу
 * (ключи почтового сервера — секрет уровня интеграционных токенов): пустое поле pass
 * означает «оставить сохранённый пароль», чтобы форма не требовала перепечатывать секрет.
 */

/** PUT /api/notifications/smtp — сохраняет конфигурацию SMTP: { host, port, secure, user, pass, from, to }. */
export async function PUT(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const str = (key: string, min: number, max: number, required: boolean): string => {
      const raw = body[key];
      if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim().length === 0)) {
        if (required) throw new ApiError("validation", `Не заполнено поле «${key}»`);
        return "";
      }
      if (typeof raw !== "string") throw new ApiError("validation", `Поле «${key}» должно быть строкой`);
      if (raw.trim().length < min || raw.trim().length > max) throw new ApiError("validation", `Поле «${key}» должно быть от ${min} до ${max} знаков`);
      return raw.trim();
    };
    const host = str("host", 1, 200, true);
    const portRaw = body.port;
    const port = typeof portRaw === "number" ? portRaw : typeof portRaw === "string" && portRaw.trim() ? Number(portRaw) : NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError("validation", "Поле «port» должно быть целым числом от 1 до 65535");
    const secure = body.secure === true;
    const user = str("user", 1, 200, false);
    const from = str("from", 3, 200, true);
    const to = str("to", 3, 500, true);
    const block = readNotificationsBlock();
    // Пустой pass = оставить сохранённый (форма шлёт маску как «unchanged» — пустоту).
    const passRaw = body.pass;
    const pass = typeof passRaw === "string" && passRaw.trim().length > 0 ? passRaw.trim() : block?.smtp?.pass ?? "";
    if (!pass && (user || block?.smtp?.user)) throw new ApiError("validation", "Не заполнено поле «pass»");
    writeNotificationsBlock({ ...block, lastError: undefined, smtp: { host, port, secure, user: user || undefined, pass: pass || undefined, from, to } });
    return Response.json({ ok: true, configured: true });
  } catch (e) {
    return errorResponse(e);
  }
}
