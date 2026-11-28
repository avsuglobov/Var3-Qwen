import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

/**
 * Минимальный IMAP-клиент (этап 21): greeting → LOGIN → SELECT → UID SEARCH → UID FETCH BODY[]
 * → LOGOUT. Тот же подход, что у SMTP-клиента этапа 20: соединение создаётся фабрикой — в
 * unit-тестах подставляется фейковый сокет, сети нет. Поддержаны многострочные ответы и
 * литералы RFC 3501 («{N}» в конце строки — далее N байт тела). Файл читается целиком
 * (BODY.PEEK[]) и разбирается mime.ts. Ограничения честно задокументированы в README этапа:
 * имена папок — латиница (без UTF-7), IDLE/LIST не поддержаны, инкремент — по UID.
 */

export type ImapSocketFactory = (host: string, port: number) => Promise<Socket>;

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

/** Таймаут ожидания ответа сервера, мс. */
const RESPONSE_TIMEOUT_MS = 15_000;

const defaultSocketFactory: ImapSocketFactory = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = port === 993 ? tlsConnect({ host, port, servername: host }) : netConnect({ host, port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });

interface ReaderItem {
  /** Строка ответа (уже без CRLF). */
  line: string;
  /** Литерал RFC 3501, если строка заканчивалась «{N}»; иначе null. */
  literal: Buffer | null;
}

interface Reader {
  next(): Promise<ReaderItem>;
  nextBytes(n: number): Promise<Buffer>;
}

/**
 * Читает сокет: строки (по CRLF) и литералы (фиксированное число байт) вперемешку.
 * Литерал привязан к своей строке и не разбирается построчно — иначе его байты
 * потеряли бы границы (первая версия этого читателя ошибалась именно так).
 */
function imapReader(socket: Socket): Reader {
  let buffer = Buffer.alloc(0);
  const itemQueue: ReaderItem[] = [];
  const itemWaiters: Array<(item: ReaderItem) => void> = [];
  const byteWaiters: Array<{ need: number; resolve: (b: Buffer) => void }> = [];
  let closed: Error | null = null;
  let pendingLine: string | null = null; // строка, у которой литерал ещё не докачался
  let pendingNeed = 0;

  function pump(): void {
    for (;;) {
      const w = byteWaiters[0];
      if (w) {
        if (buffer.length < w.need) return;
        byteWaiters.shift();
        const out = buffer.subarray(0, w.need);
        buffer = buffer.subarray(w.need);
        w.resolve(out);
        continue;
      }
      if (pendingLine !== null) {
        if (buffer.length < pendingNeed) return;
        const literal = buffer.subarray(0, pendingNeed);
        buffer = buffer.subarray(pendingNeed);
        const item: ReaderItem = { line: pendingLine, literal };
        pendingLine = null;
        pendingNeed = 0;
        const waiter = itemWaiters.shift();
        if (waiter) waiter(item);
        else itemQueue.push(item);
        continue;
      }
      const idx = buffer.indexOf(0x0a);
      if (idx < 0) return;
      let lineBuf = buffer.subarray(0, idx);
      buffer = buffer.subarray(idx + 1);
      if (lineBuf.length > 0 && lineBuf[lineBuf.length - 1] === 0x0d) lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
      const line = lineBuf.toString("utf8");
      const m = /\{(\d+)\}$/.exec(line);
      if (m) {
        pendingLine = line;
        pendingNeed = Number(m[1]);
        continue;
      }
      const waiter = itemWaiters.shift();
      const item: ReaderItem = { line, literal: null };
      if (waiter) waiter(item);
      else itemQueue.push(item);
    }
  }

  socket.setEncoding("binary");
  socket.on("data", (chunk: string) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk, "binary")]);
    pump();
  });
  socket.on("error", (e) => {
    closed = new Error(`Сеть недоступна: ${e.message.slice(0, 200)}`);
    itemWaiters.splice(0).forEach((w) => w({ line: "", literal: null }));
    byteWaiters.splice(0).forEach((w) => w.resolve(Buffer.alloc(0)));
  });
  socket.on("close", () => {
    closed ??= new Error("Соединение закрыто сервером до завершения сеанса");
    itemWaiters.splice(0).forEach((w) => w({ line: "", literal: null }));
    byteWaiters.splice(0).forEach((w) => w.resolve(Buffer.alloc(0)));
  });

  const withTimeout = <T>(p: (resolve: (v: T) => void, reject: (e: Error) => void) => void): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`IMAP-сервер не ответил за ${RESPONSE_TIMEOUT_MS / 1000} с`)), RESPONSE_TIMEOUT_MS);
      p(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });

  return {
    next: () =>
      withTimeout<ReaderItem>((resolve, reject) => {
        const queued = itemQueue.shift();
        if (queued !== undefined) return resolve(queued);
        if (closed) return reject(closed);
        itemWaiters.push((item) => {
          if (closed && item.line === "") reject(closed);
          else resolve(item);
        });
      }),
    nextBytes: (n: number) =>
      withTimeout<Buffer>((resolve, reject) => {
        if (buffer.length >= n) {
          const out = buffer.subarray(0, n);
          buffer = buffer.subarray(n);
          return resolve(out);
        }
        if (closed) return reject(closed);
        byteWaiters.push({ need: n, resolve });
      })
  };
}

/** Экранирование строки в кавычках IMAP. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface ImapSession {
  /** SELECT папки; NO/BAD-ответ сервера — ошибка с текстом. */
  selectFolder(folder: string): Promise<void>;
  /** UID SEARCH по строке критерия (например, «UID 5:*» или «ALL»); список UID из untagged-ответа. */
  searchUids(criteria: string): Promise<number[]>;
  /** UID FETCH сырого письма целиком (BODY.PEEK[]); Buffer — как вернул сервер. */
  fetchRaw(uid: number): Promise<Buffer>;
  logout(): Promise<void>;
}

/** Подключается и входит: greeting `* OK`, LOGIN; NO/BAD — ошибка с текстом сервера (честная причина). */
export async function imapConnect(cfg: ImapConfig, socketFactory: ImapSocketFactory = defaultSocketFactory): Promise<ImapSession> {
  const socket = await socketFactory(cfg.host, cfg.port);
  const reader = imapReader(socket);
  let tag = 0;
  const tagNext = (): string => `A${String(++tag).padStart(3, "0")}`;

  const expectOk = async (command: string, step: string, onUntagged?: (line: string, literal: Buffer | null) => void): Promise<string> => {
    const t = tagNext();
    socket.write(`${t} ${command}\r\n`);
    let status = "";
    let last = "";
    for (;;) {
      const { line, literal } = await reader.next();
      if (line.startsWith(`${t} `)) {
        status = line.slice(t.length + 1).split(" ")[0];
        last = line;
        break;
      }
      onUntagged?.(line, literal);
    }
    if (status !== "OK") throw new Error(`${step}: сервер ответил ${last.slice(0, 200)}`);
    return last;
  };

  try {
    const greeting = (await reader.next()).line;
    if (!/^\*\s+(OK|PREAUTH)/.test(greeting)) throw new Error(`Подключение: сервер ответил ${greeting.slice(0, 120)}`);
    await expectOk(`LOGIN ${quote(cfg.user)} ${quote(cfg.pass)}`, "LOGIN");
  } catch (e) {
    socket.destroy();
    throw e;
  }

  return {
    async selectFolder(folder) {
      await expectOk(`SELECT ${quote(folder)}`, `SELECT ${folder}`);
    },
    async searchUids(criteria) {
      const uids: number[] = [];
      await expectOk(`UID SEARCH ${criteria}`, "UID SEARCH", (line) => {
        const m = /^\*\s+SEARCH\b(.*)$/.exec(line);
        if (m) for (const tok of m[1].trim().split(/\s+/)) {
          if (/^\d+$/.test(tok)) uids.push(Number(tok));
        }
      });
      return uids;
    },
    async fetchRaw(uid) {
      let raw: Buffer | null = null;
      await expectOk(`UID FETCH ${uid} (BODY.PEEK[])`, `UID FETCH ${uid}`, (line, literal) => {
        if (literal && /\bFETCH\b/i.test(line)) raw = literal;
      });
      if (!raw) throw new Error(`UID FETCH ${uid}: сервер не вернул тело письма`);
      return raw;
    },
    async logout() {
      try {
        await expectOk("LOGOUT", "LOGOUT");
      } finally {
        socket.destroy();
      }
    }
  };
}

export interface FetchedMessage {
  uid: number;
  /** Сырое письмо (RFC 822) — парсится mime.ts. */
  raw: Buffer;
}

export interface FetchNewResult {
  messages: FetchedMessage[];
  /** Наибольший UID среди найденных на сервере — новый курсор папки. */
  maxUid: number;
}

/**
 * Инкрементальная загрузка папки: UID > lastUid. Первый запуск (lastUid null) тело писем
 * не загружает — курсор ставится на наибольший UID на сервере (без обратной заливки старой
 * почты и без автосоздания лидов по истории — решение этапа 21, задокументировано).
 */
export async function imapFetchNew(cfg: ImapConfig, folder: string, lastUid: number | null, socketFactory: ImapSocketFactory = defaultSocketFactory): Promise<FetchNewResult> {
  const session = await imapConnect(cfg, socketFactory);
  try {
    await session.selectFolder(folder);
    if (lastUid === null) {
      const all = await session.searchUids("ALL");
      const maxUid = all.reduce((m, u) => Math.max(m, u), 0);
      return { messages: [], maxUid };
    }
    const uids = (await session.searchUids(`UID ${lastUid + 1}:*`)).filter((u) => u > lastUid);
    const messages: FetchedMessage[] = [];
    for (const uid of uids) {
      messages.push({ uid, raw: await session.fetchRaw(uid) });
    }
    const maxUid = Math.max(lastUid, ...uids, 0);
    return { messages, maxUid };
  } finally {
    await session.logout().catch(() => undefined);
  }
}

/** Проверка соединения: LOGIN + SELECT + LOGOUT — «Проверить соединение» в Настройках. */
export async function imapVerify(cfg: ImapConfig, folder: string, socketFactory: ImapSocketFactory = defaultSocketFactory): Promise<void> {
  const session = await imapConnect(cfg, socketFactory);
  try {
    await session.selectFolder(folder);
  } finally {
    await session.logout().catch(() => undefined);
  }
}
