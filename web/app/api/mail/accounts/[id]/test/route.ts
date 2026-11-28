import { APP_NAME } from "@/lib/config";
import { ApiError } from "@/lib/api/types";
import { guardApi } from "@/lib/server/auth";
import { imapVerify } from "@/lib/server/mail/imap";
import { emailSendReply } from "@/lib/server/mail/channel";
import { errorResponse } from "@/lib/server/store";
import { readMailBlock } from "@/lib/server/secrets";

/**
 * «Проверить соединение» учётной записи почты (этап 21, админ): IMAP — LOGIN + SELECT первой
 * папки + LOGOUT; SMTP — контрольное письмо на собственный адрес аккаунта (subject
 * «Проверка соединения»). Честный результат: сбои соединения возвращаются в ответе маршрута,
 * а не маскируются успехом; последнее письмо не становится лидом (свой адрес, ingest.ts).
 */

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const block = readMailBlock();
    const account = block?.accounts.find((a) => a.id === id);
    if (!account) throw new ApiError("not_found", `Учётная запись ${id} не найдена`);
    const imap: { ok: boolean; message: string } = { ok: false, message: "" };
    try {
      await imapVerify({ host: account.imapHost, port: account.imapPort, secure: account.imapSecure, user: account.user, pass: account.pass }, account.folders[0] ?? "INBOX");
      imap.ok = true;
      imap.message = `IMAP ${account.imapHost}:${account.imapPort} — вход и папка «${account.folders[0] ?? "INBOX"}» доступны`;
    } catch (e) {
      imap.message = e instanceof Error ? e.message.slice(0, 300) : "неизвестная ошибка IMAP";
    }
    const smtp: { ok: boolean; message: string } = { ok: false, message: "" };
    try {
      await emailSendReply(account, account.user, `Проверка соединения ${APP_NAME}`, "Контрольное письмо проверки соединения SMTP (этап 21). Можно удалить.");
      smtp.ok = true;
      smtp.message = `SMTP ${account.smtpHost}:${account.smtpPort} — контрольное письмо отправлено на ${account.user}`;
    } catch (e) {
      smtp.message = e instanceof Error ? e.message.slice(0, 300) : "неизвестная ошибка SMTP";
    }
    return Response.json({ ok: imap.ok && smtp.ok, imap, smtp });
  } catch (e) {
    return errorResponse(e);
  }
}
