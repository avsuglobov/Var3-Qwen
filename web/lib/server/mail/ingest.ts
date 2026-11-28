import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import { MAX_MAIL_ATTACHMENTS, MAX_MAIL_ATTACHMENT_BYTES, MAX_MAIL_BODY } from "@/lib/schemas";
import type { Email } from "@/lib/schemas";
import type { IncomingChannelMessage } from "@/lib/server/channels/types";
import { emailFetchIncoming } from "@/lib/server/mail/channel";
import { readMailBlock, writeMailBlock } from "@/lib/server/secrets";
import { notifyEvent } from "@/lib/server/notify";
import { getServerStore } from "@/lib/server/store";

/**
 * Загрузка входящих писем в хранилище (этап 21). Каждая папка каждой учётной записи читается
 * инкрементально по UID-курсору (блок mail в secrets.json); первое чтение папки курсор только
 * ставит — история ящика в CRM не заливается (без спама лидами старой почтой; решение этапа 21).
 * Письмо: дедуп по Message-ID, статусы «Новое», вложения ≤10 МБ в blob (этап 17), привязка к
 * лиду по адресу (новое поле email лида) или автосоздание лида (канал «email», решение этапа 21)
 * с уведомлением «Новый лид». Ошибка папки не останавливает остальные — причина в lastError
 * блока mail и логе сервера.
 */

export interface MailPollResult {
  accounts: number;
  /** Новых писем записано в хранилище. */
  fetched: number;
  /** Лидов создано автоматически. */
  leadsCreated: number;
  /** Аккаунты с ошибкой: адрес аккаунта → причина (кратко). */
  errors: Record<string, string>;
}

/** Новый id письма: префикс + случайная часть, ID_RE-совместимый. */
function newEmailId(): string {
  return `em-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** Приводит сообщение канала к записи EMAILS: тело ≤100 тыс. знаков, вложения ≤10 МБ (крупнее — только метаданные). */
function toEmailItem(msg: IncomingChannelMessage, accountName: string): Email {
  const attachments = msg.attachments.slice(0, MAX_MAIL_ATTACHMENTS).map((a) => ({
    name: a.filename.slice(0, 300) || "без-имени",
    contentType: a.contentType,
    size: a.bytes.length,
    ...(a.bytes.length > 0 && a.bytes.length <= MAX_MAIL_ATTACHMENT_BYTES ? { data: a.bytes.toString("base64") } : {})
  }));
  const text = (msg.text ?? "").trim();
  return {
    id: newEmailId(),
    accountId: String(msg.meta["accountId"]),
    folder: String(msg.meta["folder"]),
    uid: Number(msg.meta["uid"]),
    messageId: msg.externalId,
    from: msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from,
    to: String(msg.meta["to"] ?? "").slice(0, 2000),
    subject: msg.subject?.slice(0, 2000) ?? null,
    date: msg.date,
    body: text.length > MAX_MAIL_BODY ? `${text.slice(0, MAX_MAIL_BODY - 1)}…` : text || null,
    status: "Новое",
    leadId: null,
    category: null,
    categorySource: null,
    attachments
  };
}

/** Адрес отправителя без имени: «Имя <a@b>» → a@b. */
function addressOf(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** Имя для автолида: имя отправителя или локальная часть адреса. */
function nameForLead(msg: IncomingChannelMessage, address: string): string {
  if (msg.fromName && msg.fromName.trim()) return msg.fromName.trim().slice(0, 300);
  return address.split("@")[0] || address;
}

/**
 * Один тик загрузки почты. deps.socketFactory инъектируется в unit-тестах (без сети).
 * Никогда не роняет вызвавший поток: ошибки папок собираются в результат и lastError.
 */
export async function mailPollTick(deps: { socketFactory?: Parameters<typeof emailFetchIncoming>[3] } = {}): Promise<MailPollResult> {
  const block = readMailBlock();
  const result: MailPollResult = { accounts: block?.accounts.length ?? 0, fetched: 0, leadsCreated: 0, errors: {} };
  if (!block || block.accounts.length === 0) return result;

  const store = getServerStore().api;
  const [existingEmails, leads, funnels, agents] = await Promise.all([
    store.emails.list(),
    store.leads.list(),
    store.reference.funnels(),
    store.agents.list()
  ]);
  const knownMessageIds = new Set(existingEmails.map((e) => e.messageId).filter(Boolean) as string[]);
  // Дефолты воронки/этапа/сотрудника: как у демо-сидов, а если справочник менялся — первые записи.
  const funnelId = funnels.find((f) => f.id === "fn-sales")?.id ?? funnels[0]?.id ?? "fn-sales";
  const agentId = agents.find((a) => a.id === "ag-sales")?.id ?? agents[0]?.id ?? "ag-sales";
  const stages = funnels.find((f) => f.id === funnelId)?.stages ?? [];
  const stageId = stages[0] ?? "new";

  let nextBlock = block;
  const now = Date.now();

  for (const account of block.accounts) {
    for (const folder of account.folders) {
      const key = `${account.id}:${folder}`;
      const cursor = block.cursors?.[key]?.uid ?? null;
      try {
        const incoming = await emailFetchIncoming(account, folder, cursor, deps.socketFactory);
        for (const msg of incoming.messages) {
          if (msg.externalId && knownMessageIds.has(msg.externalId)) continue; // дедуп по Message-ID
          const item = toEmailItem(msg, account.name);
          // Привязка к лиду по адресу; неизвестный отправитель — автосоздание лида (решение этапа 21).
          // Свои адреса учётных записей (например, тестовое письмо «Проверить соединение») лидами не становятся.
          const address = addressOf(item.from);
          const ownAddress = block.accounts.some((a) => a.user.toLowerCase() === address || a.from.toLowerCase() === address);
          const lead = leads.find((l) => (l.email ?? "").toLowerCase() === address);
          if (lead) {
            item.leadId = lead.id;
          } else if (ownAddress) {
            // Свои адреса учётных записей (например, тестовое письмо «Проверить соединение») лидами не становятся.
            item.leadId = null;
          } else {
            const created = await store.leads.create({
              id: `LD-${now.toString(36)}${Math.floor(Math.random() * 900 + 100)}`.slice(0, 40).replace(/[^A-Za-z0-9_-]/g, ""),
              name: nameForLead(msg, address),
              channel: "email",
              stageId,
              funnelId,
              agentId,
              value: null,
              lastActivity: new Date(msg.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
              note: `Создан автоматически из письма (${address})`,
              email: address,
              events: [{ t: new Date(msg.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), ts: msg.date, actor: "ai", text: `Создан из входящего письма: ${item.subject ?? "(без темы)"}` }]
            });
            item.leadId = created.id;
            leads.push(created);
            result.leadsCreated += 1;
            void notifyEvent("Новый лид", {
              subject: `Новый лид из письма: ${created.name}`,
              lines: [`Отправитель: ${address}.`, `Тема: ${item.subject ?? "(без темы)"}.`, "Лид создан автоматически, письмо доступно во вкладке «Почта»."]
            });
          }
          await store.emails.create(item);
          knownMessageIds.add(item.messageId ?? item.id);
          result.fetched += 1;
        }
        nextBlock = {
          ...nextBlock,
          cursors: { ...nextBlock.cursors, [key]: { uid: incoming.cursor ?? 0 } }
        };
      } catch (e) {
        const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "неизвестная ошибка";
        result.errors[account.user] = `${folder}: ${message.slice(0, 200)}`;
        console.warn(`[mail] ${account.user}/${folder}: загрузка не выполнена: ${message.slice(0, 200)}`);
      }
    }
  }

  // Ошибки фиксируются в блоке (Настройки → Почта); успешные папки прошлую ошибку аккаунта гасят.
  const lastError = { ...block.lastError };
  for (const account of block.accounts) {
    const err = Object.entries(result.errors).find(([user]) => user === account.user);
    if (err) lastError[account.id] = { message: err[1], at: now };
    else delete lastError[account.id];
  }
  writeMailBlock({ ...nextBlock, lastError });
  return result;
}
