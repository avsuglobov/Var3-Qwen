/**
 * Единая модель входящих сообщений каналов (этап 21, задел под этап 22): email и будущие
 * мессенджеры (telegram и далее) приводят свои сообщения к одному виду — тогда единый
 * инбокс, статусы и привязка к лидам не зависят от канала. Каждый канал приносит
 * `externalId` (стабильный ид на своей стороне) и служебные `meta` (адрес/папка/UID и т.п.).
 */

export interface ChannelAttachment {
  filename: string;
  contentType: string | null;
  bytes: Buffer;
}

export interface IncomingChannelMessage {
  /** Стабильный идентификатор на стороне канала (email: Message-ID; telegram: message_id); null — канал не даёт. */
  externalId: string | null;
  /** Адрес или идентификатор отправителя (email: адрес; telegram: chat id). */
  from: string;
  /** Отображаемое имя отправителя; null — канал не даёт. */
  fromName: string | null;
  subject: string | null;
  /** Момент сообщения, мс с эпохи. */
  date: number;
  text: string | null;
  attachments: ChannelAttachment[];
  /** Служебные поля канала (email: accountId, folder, uid). */
  meta: Record<string, string | number>;
}

/** Канал = источник входящих сообщений с инкрементальным курсором (этап 22 добавит telegram). */
export interface ChannelIncoming {
  messages: IncomingChannelMessage[];
  /** Новый курсор (email: наибольший UID папки; null — первый запуск, тела не читались). */
  cursor: number | null;
}
