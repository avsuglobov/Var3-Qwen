import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { APP_NAME } from "@/lib/config";

/**
 * Минимальный SMTP-клиент (этап 20): EHLO → при secure — STARTTLS → при user/pass — AUTH LOGIN
 * → MAIL FROM → RCPT TO → DATA → QUIT. Письмо — plain text, тема в заголовке с кодировкой
 * base64 (Subject с не-ASCII по RFC 2047), строки длиннее 998 байт режутся (лимит SMTP).
 * Соединение создаётся фабрикой — в тестах подставляется фейковый сокет, сети нет;
 * каждый шаг ждёт ответ сервера, любой 4xx/5xx или обрыв — ошибка с ответом сервера в тексте.
 */

/** Фабрика соединения: стандартно TCP (или неявный TLS для порта 465), в тестах — подстава. */
export type SocketFactory = (host: string, port: number) => Promise<Socket>;

export interface SmtpSendConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}

export interface SmtpMail {
  subject: string;
  lines: string[];
}

/** Таймаут ожидания ответа сервера, мс (медленный релей не подвешивает вызывавший поток). */
const RESPONSE_TIMEOUT_MS = 10_000;

const defaultSocketFactory: SocketFactory = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = port === 465 ? tlsConnect({ host, port, servername: host }) : netConnect({ host, port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });

interface LineReader {
  next(): Promise<string>;
}

/** Читает сокет построчно; 0-байт в конце строки SMTP отбрасывает (RFC 5321: CRLF.CRLF). */
function lineReader(socket: Socket): LineReader {
  const queue: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  let buffer = "";
  let closed: Error | null = null;
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const idx = buffer.indexOf("\n");
      if (idx < 0) break;
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length === 0) continue; // пустые строки между ответами не несут кода
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else queue.push(line);
    }
  });
  socket.on("error", (e) => {
    closed = new Error(`Сеть недоступна: ${e.message.slice(0, 200)}`);
    waiters.splice(0).forEach((w) => w(""));
  });
  socket.on("close", () => {
    closed ??= new Error("Соединение закрыто сервером до завершения сеанса");
    waiters.splice(0).forEach((w) => w(""));
  });
  return {
    next: () =>
      new Promise<string>((resolve, reject) => {
        const queued = queue.shift();
        if (queued !== undefined) return resolve(queued);
        if (closed) return reject(closed);
        const timer = setTimeout(() => reject(new Error(`Сервер не ответил за ${RESPONSE_TIMEOUT_MS / 1000} с`)), RESPONSE_TIMEOUT_MS);
        waiters.push((line) => {
          clearTimeout(timer);
          if (closed && line === "") reject(closed);
          else resolve(line);
        });
      })
  };
}

/** Ждёт ответ с кодом 2xx/3xx (3xx допустим только для DATA); 4xx/5xx — ошибка с текстом сервера. */
async function expectCode(reader: LineReader, codes: string[], step: string): Promise<void> {
  const line = await reader.next();
  const code = line.slice(0, 3);
  if (!codes.includes(code)) throw new Error(`${step}: сервер ответил ${line.slice(0, 200)}`);
}

/** Подключается и выполняет EHLO (+STARTTLS при secure); возвращает reader того же сокета —
    второй листенер на сокете развёл бы чтение ответов. */
async function handshake(socket: Socket, cfg: SmtpSendConfig): Promise<LineReader> {
  const reader = lineReader(socket);
  await expectCode(reader, ["220"], "Подключение");
  socket.write("EHLO ai-workspace\r\n");
  let supportsStarttls = false;
  for (;;) {
    const line = await reader.next();
    if (/^\d{3}(?: |$)/.test(line)) break; // терминальная строка ответа: «250 OK» (4-й символ — пробел), «250-…» продолжает
    if (line.slice(4).toUpperCase().startsWith("STARTTLS")) supportsStarttls = true;
  }
  if (cfg.secure) {
    if (!supportsStarttls) throw new Error("STARTTLS: сервер не объявил поддержку — включите неявный TLS (порт 465) или выключите secure");
    socket.write("STARTTLS\r\n");
    await expectCode(reader, ["220"], "STARTTLS");
    // После перехода в TLS EHLO повторяют (RFC 3207); тот же reader — новых листенеров нет.
    socket.write("EHLO ai-workspace\r\n");
    for (;;) {
      const line = await reader.next();
      if (/^\d{3}(?: |$)/.test(line)) break;
    }
  }
  return reader;
}

/** Тема с не-ASCII по RFC 2047: =?utf-8?B?<base64>?=. */
function subjectHeader(subject: string): string {
  return `Subject: =?utf-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** Отправляет одно письмо; при ошибке текст ответа сервера попадает в исключение. */
export async function smtpSend(cfg: SmtpSendConfig, mail: SmtpMail, socketFactory: SocketFactory = defaultSocketFactory): Promise<void> {
  const socket = await socketFactory(cfg.host, cfg.port);
  try {
    const reader = await handshake(socket, cfg);
    if (cfg.user && cfg.pass) {
      socket.write("AUTH LOGIN\r\n");
      await expectCode(reader, ["334"], "AUTH LOGIN");
      socket.write(`${Buffer.from(cfg.user, "utf8").toString("base64")}\r\n`);
      await expectCode(reader, ["334"], "AUTH LOGIN (логин)");
      socket.write(`${Buffer.from(cfg.pass, "utf8").toString("base64")}\r\n`);
      await expectCode(reader, ["235"], "AUTH LOGIN (пароль)");
    }
    socket.write(`MAIL FROM:<${cfg.from}>\r\n`);
    await expectCode(reader, ["250"], "MAIL FROM");
    for (const rcpt of cfg.to.split(",").map((s) => s.trim()).filter(Boolean)) {
      socket.write(`RCPT TO:<${rcpt}>\r\n`);
      await expectCode(reader, ["250", "251"], `RCPT TO:<${rcpt}>`);
    }
    socket.write("DATA\r\n");
    await expectCode(reader, ["354"], "DATA");
    const body = [
      subjectHeader(mail.subject),
      `From: ${APP_NAME} <${cfg.from}>`,
      `To: ${cfg.to}`,
      `Date: ${new Date().toUTCString()}`,
      "",
      ...mail.lines
    ]
      .map((l) => (l.length > 998 ? `${l.slice(0, 995)}...` : l).replace(/^\./, "..")) // точка-эскейп: строка, начинающаяся с «.», дублирует точку (RFC 5321)
      .join("\r\n");
    socket.write(`${body}\r\n.\r\n`);
    await expectCode(reader, ["250"], "Передача письма");
    socket.write("QUIT\r\n");
  } finally {
    socket.destroy();
  }
}
