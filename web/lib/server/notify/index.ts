import type { SmtpConfig } from "@/lib/integrations/types";
import { readNotificationsBlock, writeNotificationsBlock } from "@/lib/server/secrets";
import { smtpSend, type SocketFactory } from "@/lib/server/notify/smtp";

/**
 * Движок уведомлений (этап 20): события приложения превращаются в письма через SMTP-адаптер.
 * Ключи SMTP и тумблеры событий лежат в блоке `notifications` файла .data/secrets.json — вне
 * снимка, экспорта и клиента (в браузер уходит маска). Тумблер события выключен или SMTP не
 * настроен — письмо не создаётся, соединение не открывается. Отправка асинхронная и никогда
 * не роняет вызвавший поток: ошибка пишется в лог сервера и в `lastError` блока (показывается
 * в Настройках → Уведомления). Фабрика сокета инъекцируется — юнит-тесты работают без сети.
 */

/** События уведомлений: ключ совпадает с ключом тумблера в NOTIFICATION_TOGGLES. */
export type NotifyEvent = "Передача менеджеру" | "Новый лид" | "Ошибка агента (КРИТИЧНО)" | "Итог синхронизации";

/** Дефолты тумблеров (этап 7, прототип); записи в secrets.json нет — действует дефолт. */
const TOGGLE_DEFAULTS: Record<NotifyEvent, boolean> = {
  "Передача менеджеру": true,
  "Новый лид": true,
  "Ошибка агента (КРИТИЧНО)": false,
  "Итог синхронизации": false
};

export interface NotifyPayload {
  subject: string;
  lines: string[];
}

/** Тумблер события: серверное значение из secrets.json перекрывает дефолт прототипа. */
export function notificationEnabled(event: NotifyEvent): boolean {
  const block = readNotificationsBlock();
  return block?.toggles?.[event] ?? TOGGLE_DEFAULTS[event];
}

/** Фиксирует последнюю ошибку отправки (Настройки → Уведомления показывают её пользователю). */
export function saveNotifyError(message: string): void {
  const block = readNotificationsBlock();
  writeNotificationsBlock({ ...block, lastError: { message: message.slice(0, 300), at: Date.now() } });
}

/** Успешная отправка гасит прошлую ошибку. */
export function clearNotifyError(): void {
  const block = readNotificationsBlock();
  if (block?.lastError) writeNotificationsBlock({ ...block, lastError: undefined });
}

/**
 * Отправляет уведомление о событии. Возвращает true, если письмо ушло; false — событие
 * выключено тумблером, SMTP не настроен или отправка не удалась (причина — в lastError и логе).
 * Вызывавшие точки (маршруты, планировщик) не ждут результата: fire-and-forget.
 */
export async function notifyEvent(event: NotifyEvent, payload: NotifyPayload, socketFactory?: SocketFactory): Promise<boolean> {
  try {
    if (!notificationEnabled(event)) return false;
    const block = readNotificationsBlock();
    const smtp: SmtpConfig | undefined = block?.smtp;
    if (!smtp) return false; // не настроено — не считаем ошибкой, тишина ожидаема
    await smtpSend(smtp, payload, socketFactory);
    clearNotifyError();
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : "неизвестная ошибка отправки";
    console.warn(`[notify] ${event}: письмо не отправлено: ${message.slice(0, 200)}`);
    try {
      saveNotifyError(message);
    } catch {
      /* secrets-файл недоступен — уже залогировано, тише быть нельзя/не нужно */
    }
    return false;
  }
}
