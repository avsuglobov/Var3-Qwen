import { errorResponse, readJsonBody } from "@/lib/server/store";
import { APP_NAME } from "@/lib/config";
import { readNotificationsBlock } from "@/lib/server/secrets";
import { guardApi } from "@/lib/server/auth";
import { smtpSend } from "@/lib/server/notify/smtp";
import { clearNotifyError, saveNotifyError } from "@/lib/server/notify";

/**
 * Тестовая отправка уведомлений (этап 20): админ проверяет, что SMTP-ключи рабочие,
 * не дожидаясь реального события. Письмо с пометкой «тестовое» уходит на тот же адрес,
 * что и события; результат — честный: сбой соединения или отказа сервера возвращается
 * с HTTP 200 (ok:false) — проверка не должна выглядеть как ошибка приложения.
 */

/** POST /api/notifications/test — тестовое письмо на адрес из конфигурации. */
export async function POST(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    await readJsonBody(req).catch(() => ({}));
    const smtp = readNotificationsBlock()?.smtp;
    if (!smtp) return Response.json({ ok: false, message: "SMTP не настроен — заполните сервер и получателей" });
    try {
      await smtpSend(smtp, {
        subject: `${APP_NAME}: тестовое письмо уведомлений`,
        lines: ["Это тестовое письмо из раздела Настройки → Уведомления.", "Если вы его видите — SMTP настроен верно, события будут доставляться."]
      });
      clearNotifyError();
      return Response.json({ ok: true, message: "Тестовое письмо отправлено — проверьте почту" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "неизвестная ошибка отправки";
      saveNotifyError(message);
      return Response.json({ ok: false, message: `Письмо не отправлено: ${message.slice(0, 250)}` });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
