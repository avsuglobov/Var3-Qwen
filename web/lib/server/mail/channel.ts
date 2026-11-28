import { decodeWords, parseAddresses, parseMime } from "@/lib/server/mail/mime";
import { imapFetchNew, type ImapConfig, type ImapSocketFactory } from "@/lib/server/mail/imap";
import type { MailAccount } from "@/lib/integrations/types";
import type { ChannelIncoming, IncomingChannelMessage } from "@/lib/server/channels/types";
import { smtpSend, type SocketFactory } from "@/lib/server/notify/smtp";

/**
 * Почтовый канал (этап 21): приводит IMAP-письма к единой модели IncomingChannelMessage
 * (интерфейс каналов — задел под этап 22) и отправляет ответы через SMTP-клиент этапа 20.
 * Учётные записи — блок mail в secrets.json; пароль из аккаунта никогда не попадает в клиент.
 */

/** IMAP-конфигурация из учётной записи. */
export function imapConfigOf(account: MailAccount): ImapConfig {
  return { host: account.imapHost, port: account.imapPort, secure: account.imapSecure, user: account.user, pass: account.pass };
}

/** Загрузка новых писем одной папки аккаунта по курсору (наибольший UID). */
export async function emailFetchIncoming(account: MailAccount, folder: string, lastUid: number | null, socketFactory?: ImapSocketFactory): Promise<ChannelIncoming> {
  const result = await imapFetchNew(imapConfigOf(account), folder, lastUid, socketFactory);
  const messages: IncomingChannelMessage[] = result.messages.map((m) => {
    const parsed = parseMime(m.raw.toString("latin1"));
    const from = parseAddresses(parsed.headers["from"]);
    const to = parseAddresses(parsed.headers["to"]);
    const dateHeader = parsed.headers["date"];
    const parsedDate = dateHeader ? Date.parse(dateHeader) : NaN;
    return {
      externalId: parsed.headers["message-id"] ?? null,
      from: from[0]?.address ?? "(неизвестный отправитель)",
      fromName: from[0]?.name || null,
      subject: parsed.headers["subject"] ? decodeWords(parsed.headers["subject"]) : null,
      date: Number.isFinite(parsedDate) ? parsedDate : Date.now(),
      text: parsed.text,
      attachments: parsed.attachments,
      meta: { accountId: account.id, folder, uid: m.uid, to: to.map((a) => a.address).join(", ") }
    };
  });
  return { messages, cursor: result.maxUid };
}

/** Отправка ответа из карточки письма: SMTP-клиент этапа 20, учётная запись аккаунта. */
export async function emailSendReply(account: MailAccount, to: string, subject: string, text: string, socketFactory?: SocketFactory): Promise<void> {
  await smtpSend(
    {
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      ...(account.user ? { user: account.user } : {}),
      pass: account.pass,
      from: account.from,
      to
    },
    { subject, lines: text.split(/\r?\n/) },
    socketFactory
  );
}
