import { ApiError } from "@/lib/api/types";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { maskSecret, readNotificationsBlock, writeNotificationsBlock } from "@/lib/server/secrets";
import { guardApi } from "@/lib/server/auth";

/**
 * Уведомления (этап 20). GET — состояние: настроен ли SMTP (секреты маской), серверные
 * тумблеры событий и последняя ошибка отправки. PUT — только тумблеры (менеджер и выше);
 * SMTP-ключи и тестовая отправка — отдельные маршруты, доступные админу.
 */

/** GET /api/notifications — состояние уведомлений для вкладки Настроек. */
export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  const block = readNotificationsBlock();
  return Response.json({
    configured: Boolean(block?.smtp),
    smtp: block?.smtp
      ? {
          host: block.smtp.host,
          port: block.smtp.port,
          secure: block.smtp.secure,
          /** Логин видно целиком (не секрет уровня токена), пароль — только маска. */
          user: block.smtp.user ?? "",
          pass: block.smtp.pass ? maskSecret(block.smtp.pass) : "",
          from: block.smtp.from,
          to: block.smtp.to
        }
      : null,
    toggles: block?.toggles ?? {},
    lastError: block?.lastError ?? null
  });
}

/** PUT /api/notifications — переключение тумблеров: { toggles: { "Новый лид": true, … } }. */
export async function PUT(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as { toggles?: unknown };
    if (typeof body.toggles !== "object" || body.toggles === null || Array.isArray(body.toggles)) {
      throw new ApiError("validation", "Поле toggles должно быть объектом");
    }
    const incoming = body.toggles as Record<string, unknown>;
    const toggles: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (key.length > 60) throw new ApiError("validation", `Ключ тумблера длиннее 60 знаков: ${key}`);
      if (typeof value !== "boolean") throw new ApiError("validation", `Тумблер «${key}» должен быть true или false`);
      toggles[key] = value;
    }
    const block = readNotificationsBlock();
    writeNotificationsBlock({ ...block, toggles: { ...block?.toggles, ...toggles } });
    return Response.json({ ok: true, toggles: readNotificationsBlock()?.toggles ?? {} });
  } catch (e) {
    return errorResponse(e);
  }
}
