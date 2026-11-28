import crypto from "node:crypto";

/**
 * Перенос вложений между снимком и blob-хранилищем (этап 17).
 *
 * В снимке (формат `aiws-db-v2`) содержимое вложения — строка base64 до ~1,37 млн знаков на 1 МБ файла;
 * запись снимка целиком на каждом изменении раздувала JSON-файл. Вместо этого драйвер при сохранении
 * заменяет base64 ссылкой `blob:<sha256>` и кладёт байты в blob-хранилище, а при чтении возвращает
 * base64 обратно — для движка снимка и REST-маршрутов всё выглядит как прежде.
 *
 * Ссылка не спутается с настоящим base64: символ `:` не входит в алфавит base64.
 * Байты адресуются хэшем содержимого: одинаковые файлы хранятся один раз (идемпотентная upsert).
 */

const BLOB_PREFIX = "blob:";

/** Идентификатор blob — sha256 содержимого (hex, 64 знака). */
export function blobId(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function isBlobRef(data: string): boolean {
  return data.startsWith(BLOB_PREFIX);
}

export function blobRefId(data: string): string {
  return data.slice(BLOB_PREFIX.length);
}

type ConversationLike = { messages?: Array<{ attachments?: Array<{ data?: string }> | null }> };
type EmailLike = { attachments?: Array<{ data?: string }> | null };
type SnapshotLike = { CONVERSATIONS?: unknown; EMAILS?: unknown };

export interface ExtractResult {
  /** Снимок с заменёнными ссылками (та же строка, если вложений нет). */
  snapshot: string;
  /** Идентификаторы всех вложений, на которые ссылается этот снимок (для сборки мусора в драйвере). */
  refs: Set<string>;
}

/**
 * Внутрь: base64 → `blob:<id>`, байты через putBlob. Некорректный base64 или уже-ссылка остаются как есть.
 * Строка без "CONVERSATIONS" и "EMAILS" (fault-флаги, прочие ключи) возвращается без изменений.
 * Этап 21: обрабатываются и вложения диалогов (messages[].attachments), и вложения писем (attachments).
 */
export function extractBlobs(snapshot: string, putBlob: (id: string, bytes: Buffer) => void): ExtractResult {
  const refs = new Set<string>();
  if (!snapshot.includes('"CONVERSATIONS"') && !snapshot.includes('"EMAILS"')) return { snapshot, refs };
  let parsed: SnapshotLike;
  try {
    parsed = JSON.parse(snapshot) as SnapshotLike;
  } catch {
    return { snapshot, refs };
  }
  let changed = false;
  const put = (att: { data?: string } | null | undefined): void => {
    const data = att?.data;
    if (!data) return;
    if (isBlobRef(data)) {
      refs.add(blobRefId(data));
      return;
    }
    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0) return;
    const id = blobId(bytes);
    putBlob(id, bytes);
    att.data = BLOB_PREFIX + id;
    refs.add(id);
    changed = true;
  };
  if (Array.isArray(parsed.CONVERSATIONS)) {
    for (const conv of parsed.CONVERSATIONS as ConversationLike[]) {
      for (const msg of conv?.messages ?? []) {
        for (const att of msg?.attachments ?? []) put(att);
      }
    }
  }
  if (Array.isArray(parsed.EMAILS)) {
    for (const mail of parsed.EMAILS as EmailLike[]) {
      for (const att of mail?.attachments ?? []) put(att);
    }
  }
  return { snapshot: changed ? JSON.stringify(parsed) : snapshot, refs };
}

/** Наружу: `blob:<id>` → base64 (через getBlob); blob недоступен — поле data убирается. Этап 21: письма обрабатываются наравне с диалогами. */
export function hydrateBlobs(stored: string, getBlob: (id: string) => Buffer | null): string {
  if (!stored.includes(BLOB_PREFIX)) return stored;
  let parsed: SnapshotLike;
  try {
    parsed = JSON.parse(stored) as SnapshotLike;
  } catch {
    return stored;
  }
  let changed = false;
  const hydrate = (att: { data?: string } | null | undefined): void => {
    const data = att?.data;
    if (!data || !isBlobRef(data)) return;
    const bytes = getBlob(blobRefId(data));
    if (bytes) {
      att.data = bytes.toString("base64");
    } else {
      delete att.data; // повреждённое blob-хранилище не должно ломать всю переписку
    }
    changed = true;
  };
  if (Array.isArray(parsed.CONVERSATIONS)) {
    for (const conv of parsed.CONVERSATIONS as ConversationLike[]) {
      for (const msg of conv?.messages ?? []) {
        for (const att of msg?.attachments ?? []) hydrate(att);
      }
    }
  }
  if (Array.isArray(parsed.EMAILS)) {
    for (const mail of parsed.EMAILS as EmailLike[]) {
      for (const att of mail?.attachments ?? []) hydrate(att);
    }
  }
  return changed ? JSON.stringify(parsed) : stored;
}
