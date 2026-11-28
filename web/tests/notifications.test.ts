/**
 * Уведомления (этап 20): SMTP-клиент поверх фейкового сокета (без сети), движок событий
 * notifyEvent (тумблеры, отсутствие конфигурации, lastError), маршруты /api/notifications*.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smtpSend, type SmtpSendConfig } from "@/lib/server/notify/smtp";
import { notifyEvent, saveNotifyError, clearNotifyError } from "@/lib/server/notify";
import { writeCredentials, writeNotificationsBlock } from "@/lib/server/secrets";
import { GET as notifGet, PUT as notifPut } from "@/app/api/notifications/route";
import { PUT as smtpPut } from "@/app/api/notifications/smtp/route";
import { POST as testPost } from "@/app/api/notifications/test/route";
import { getServerStore } from "@/lib/server/store";

/* --------------------------------------------------------- фейковый SMTP-сервер */

/** Сценарий фейкового сервера: на каждый завершённый CRLF-запрос клиента — один блок ответа
    (блок может быть многострочным, как EHLO-объявления: "250-x\r\n250 OK"). */
type Script = string[];

class FakeSocket extends EventEmitter {
  sent: string = "";
  script: Script;
  constructor(script: Script) {
    super();
    this.script = [...script];
  }
  setEncoding(): void {
    /* настоящий сокет стримит строки; фейковый шлёт их прямо emit-ом */
  }
  write(chunk: string): void {
    this.sent += chunk;
    if (!chunk.endsWith("\r\n")) return; // незавершённый запрос ответа не получает
    const reply = this.script.shift();
    // завершающий CRLF обязателен: без него последняя строка блока остаётся в буфере reader'а
    if (reply !== undefined) setTimeout(() => this.emit("data", reply.endsWith("\r\n") ? reply : `${reply}\r\n`), 2);
  }
  destroy(): void {
    this.emit("close");
  }
}

function factoryFor(script: Script) {
  const socket = new FakeSocket(script);
  const factory = vi.fn(async () => {
    // greeting — макротаймером: к моменту его срабатывания lineReader уже подписан на data
    setTimeout(() => socket.emit("data", "220 mail.test ESMTP ready\r\n"), 5);
    return socket as unknown as import("node:net").Socket;
  });
  return { socket, factory };
}

const CONFIG: SmtpSendConfig = { host: "mail.test", port: 587, secure: false, user: "robot", pass: "s3cret", from: "ai@test", to: "boss@test, second@test" };

/** EHLO-ответ сервера, объявляющего STARTTLS (многострочный блок одним чанком). */
const HAPPY: Script = ["250-mail.test greets you\r\n250-SIZE 35882577\r\n250 OK"];

/* --------------------------------------------------------------- SMTP-клиент */

describe("SMTP-клиент (этап 20)", () => {
  it("успешная сессия: EHLO, AUTH LOGIN, MAIL, RCPT на каждого получателя, DATA, QUIT", async () => {
    const { socket, factory } = factoryFor([
      ...HAPPY,
      "334 VXNlcm5hbWU6", // AUTH LOGIN
      "334 UGFzc3dvcmQ6", // логин
      "235 2.7.0 accepted", // пароль
      "250 2.1.0 OK", // MAIL FROM
      "250 2.1.5 OK", // RCPT boss
      "250 2.1.5 OK", // RCPT second
      "354 End data with <CR><LF>.<CR><LF>", // DATA
      "250 2.0.0 OK: queued" // точка
    ]);
    await smtpSend(CONFIG, { subject: "Проверка", lines: ["строка 1", ".внимание"] }, factory);
    expect(socket.sent).toContain("EHLO ai-workspace");
    expect(socket.sent).toContain("AUTH LOGIN");
    expect(socket.sent).toContain(Buffer.from("robot").toString("base64"));
    expect(socket.sent).toContain(Buffer.from("s3cret").toString("base64"));
    expect(socket.sent).toContain("MAIL FROM:<ai@test>");
    expect(socket.sent).toContain("RCPT TO:<boss@test>");
    expect(socket.sent).toContain("RCPT TO:<second@test>");
    expect(socket.sent).toContain("DATA");
    expect(socket.sent).toContain("Subject: =?utf-8?B?");
    expect(socket.sent).toContain("..внимание"); // точка-эскейп строки, начинающейся с точки
    expect(socket.sent).toContain("QUIT");
  });

  it("отказ сервера на MAIL FROM — ошибка с ответом сервера, RCPT не отправляется", async () => {
    const { socket, factory } = factoryFor([...HAPPY, "334 VXNlcm5hbWU6", "334 UGFzc3dvcmQ6", "235 2.7.0 accepted", "550 5.7.1 sender denied"]);
    await expect(smtpSend(CONFIG, { subject: "x", lines: ["y"] }, factory)).rejects.toThrow("MAIL FROM: сервер ответил 550 5.7.1 sender denied");
    expect(socket.sent).not.toContain("RCPT TO:");
  });

  it("отказ AUTH (неверный пароль) — 535 превращается в ошибку", async () => {
    const { factory } = factoryFor([...HAPPY, "334 VXNlcm5hbWU6", "334 UGFzc3dvcmQ6", "535 5.7.8 bad credentials"]);
    await expect(smtpSend(CONFIG, { subject: "x", lines: ["y"] }, factory)).rejects.toThrow("AUTH LOGIN (пароль): сервер ответил 535");
  });

  it("без логина и пароля AUTH не выполняется; secure=true без STARTTLS у сервера — честное объяснение", async () => {
    const { factory } = factoryFor(["250-mail.test greets you\r\n250 OK"]); // EHLO без объявления STARTTLS
    await expect(smtpSend({ ...CONFIG, user: undefined, pass: undefined, secure: true }, { subject: "x", lines: [] }, factory)).rejects.toThrow("STARTTLS");
  });

  it("обрыв соединения до приветствия — ошибка «Сеть недоступна»", async () => {
    const { socket, factory } = factoryFor([]);
    process.nextTick(() => socket.emit("error", new Error("ECONNREFUSED")));
    await expect(smtpSend(CONFIG, { subject: "x", lines: [] }, factory)).rejects.toThrow("Сеть недоступна");
  });
});

/* ---------------------------------------------------------- движок уведомлений */

describe("notifyEvent (этап 20)", () => {
  beforeEach(() => {
    writeCredentials({ version: 1, credentials: {}, notifications: { toggles: {} } });
  });

  it("SMTP не настроен — письмо не создаётся, это не ошибка (lastError не пишется)", async () => {
    const result = await notifyEvent("Передача менеджеру", { subject: "x", lines: [] }, factoryFor(HAPPY).factory);
    expect(result).toBe(false);
    expect(readSecrets().notifications?.lastError).toBeUndefined();
  });

  it("тумблер выключен — соединение даже не открывается", async () => {
    writeNotificationsBlock({ toggles: { "Ошибка агента (КРИТИЧНО)": false }, smtp: { host: "mail.test", port: 587, secure: false, from: "ai@test", to: "boss@test" } });
    const { factory } = factoryFor(HAPPY);
    const result = await notifyEvent("Ошибка агента (КРИТИЧНО)", { subject: "x", lines: [] }, factory);
    expect(result).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it("тумблер включён и сервер ответил 250 — событие доставлено, lastError погашен", async () => {
    writeNotificationsBlock({
      toggles: { "Новый лид": true },
      lastError: { message: "прошлая ошибка", at: 1 },
      smtp: { host: "mail.test", port: 587, secure: false, user: "robot", pass: "p", from: "ai@test", to: "boss@test" }
    });
    const { socket, factory } = factoryFor([...HAPPY, "334 a", "334 b", "235 ok", "250 OK", "250 OK", "354 go", "250 queued"]);
    const result = await notifyEvent("Новый лид", { subject: "Лид LD-1", lines: ["новый лид"] }, factory);
    expect(result).toBe(true);
    expect(socket.sent).toContain("RCPT TO:<boss@test>");
    expect(readSecrets().notifications?.lastError).toBeUndefined(); // успех гасит прошлую ошибку
  });

  it("сбой соединения при событии — false, lastError записан, вызвавший поток не падает", async () => {
    writeNotificationsBlock({ toggles: { "Передача менеджеру": true }, smtp: { host: "mail.test", port: 587, secure: false, from: "ai@test", to: "boss@test" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { socket, factory } = factoryFor([]);
    process.nextTick(() => socket.emit("error", new Error("ECONNREFUSED")));
    const result = await notifyEvent("Передача менеджеру", { subject: "x", lines: [] }, factory);
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(readSecrets().notifications?.lastError?.message).toContain("Сеть недоступна");
  });

  it("saveNotifyError обрезает сообщение до 300 знаков; clearNotifyError удаляет запись", () => {
    saveNotifyError("x".repeat(400));
    expect((readSecrets().notifications?.lastError?.message ?? "").length).toBeLessThanOrEqual(300);
    clearNotifyError();
    expect(readSecrets().notifications?.lastError).toBeUndefined();
  });
});

/* --------------------------------------------------------------- маршруты API */

describe("маршруты /api/notifications* (этап 20)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-notify-"));

  beforeEach(async () => {
    // Каталог и драйвер задаются до пересоздания синглтона хранилища (env читается в createStore).
    process.env.AIWS_DATA_DIR = dir;
    process.env.AIWS_DB_DRIVER = "file";
    delete (globalThis as unknown as { __aiwsServerStore?: unknown }).__aiwsServerStore;
    getServerStore().setFaults({ fail: false, latencyMs: 0 });
    await getServerStore().api.data.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET: не настроено — configured:false, smtp:null; после сохранения секреты маской", async () => {
    writeCredentials({ version: 1, credentials: {} });
    const before = await notifGet(new Request("http://x/api/notifications"));
    const beforeBody = (await before.json()) as { configured: boolean; smtp: unknown };
    expect(beforeBody.configured).toBe(false);
    expect(beforeBody.smtp).toBeNull();
    writeNotificationsBlock({ smtp: { host: "mail.test", port: 465, secure: false, user: "robot@x", pass: "long-secret-value", from: "ai@test", to: "boss@test" } });
    const res = await notifGet(new Request("http://x/api/notifications"));
    const body = (await res.json()) as { configured: boolean; smtp: { pass: string; user: string } };
    expect(body.configured).toBe(true);
    expect(body.smtp.pass.startsWith("••••")).toBe(true);
    expect(body.smtp.pass).not.toContain("long-secret-value");
    expect(body.smtp.user).toBe("robot@x"); // логин не маскируется
  });

  it("PUT toggles: сохраняет булевы значения, мержит с существующими; не-булево и не-объект — 400", async () => {
    writeCredentials({ version: 1, credentials: {} });
    expect((await notifPut(jsonRequest({ toggles: { "Новый лид": false, "Передача менеджеру": true } }))).status).toBe(200);
    const saved = readSecrets().notifications?.toggles ?? {};
    expect(saved["Новый лид"]).toBe(false);
    expect(saved["Передача менеджеру"]).toBe(true);
    expect((await notifPut(jsonRequest({ toggles: { "Новый лид": "да" } }))).status).toBe(400);
    expect((await notifPut(jsonRequest({ toggles: [true] }))).status).toBe(400);
  });

  it("PUT smtp: пароль пуст — сохранённый остаётся; битый порт и отсутствие поля — 400", async () => {
    writeCredentials({ version: 1, credentials: {} });
    expect((await smtpPut(jsonRequest({ host: "mail.test", port: "587", secure: false, user: "robot", pass: "orig-pass", from: "ai@test", to: "boss@test" }))).status).toBe(200);
    expect((await smtpPut(jsonRequest({ host: "mail2.test", port: 587, secure: true, user: "robot", pass: "", from: "ai@test", to: "boss@test" }))).status).toBe(200);
    const smtp = readSecrets().notifications?.smtp;
    expect(smtp?.host).toBe("mail2.test");
    expect(smtp?.pass).toBe("orig-pass"); // пустой pass = оставить сохранённый
    expect(smtp?.secure).toBe(true);
    expect((await smtpPut(jsonRequest({ host: "mail.test", port: "99999", secure: false, from: "ai@test", to: "boss@test" }))).status).toBe(400);
    expect((await smtpPut(jsonRequest({ port: 587, secure: false, from: "ai@test", to: "boss@test" }))).status).toBe(400);
  });

  it("POST test без SMTP — 200 с ok:false; с настроенным SMTP и отказом соединения — 200, ok:false, lastError", async () => {
    writeCredentials({ version: 1, credentials: {} });
    const none = await testPost(new Request("http://x/api/notifications/test", { method: "POST" }));
    expect(none.status).toBe(200);
    expect(((await none.json()) as { ok: boolean }).ok).toBe(false);
    writeNotificationsBlock({ smtp: { host: "mail.test", port: 1, secure: false, from: "ai@test", to: "boss@test" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fail = await testPost(new Request("http://x/api/notifications/test", { method: "POST" }));
    expect(fail.status).toBe(200); // проверка не выглядит ошибкой приложения (инвариант e2e: без 4xx)
    const body = (await fail.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(readSecrets().notifications?.lastError).toBeDefined();
  });
});

/** Содержимое secrets.json тестового каталога (сырое — без кеша, как его читает сервер). */
function readSecrets(): { notifications?: { smtp?: { host?: string; pass?: string; secure?: boolean }; toggles?: Record<string, boolean>; lastError?: { message: string; at: number } } } {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.env.AIWS_DATA_DIR ?? ".data", "secrets.json"), "utf8"));
  } catch {
    return {};
  }
}

function jsonRequest(body: unknown): Request {
  return new Request("http://x/api/notifications", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
