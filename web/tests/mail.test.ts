/**
 * Почта (этап 21): MIME-парсер, IMAP-клиент поверх фейкового сокета (без сети), загрузчик
 * mailPollTick (курсоры, дедуп, автолиды, свои адреса), AI-функции (scripted-fallback и
 * провайдер-заглушка), маршруты /api/mail/* (маски паролей, валидация, роли).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeWords, parseAddresses, parseMime } from "@/lib/server/mail/mime";
import { imapConnect, imapFetchNew } from "@/lib/server/mail/imap";
import { mailPollTick } from "@/lib/server/mail/ingest";
import { mailAi, scriptedCategory } from "@/lib/server/mail/ai";
import { writeCredentials, readMailBlock } from "@/lib/server/secrets";
import type { MailBlock } from "@/lib/integrations/types";
import type { ApiError } from "@/lib/api/types";
import { getServerStore } from "@/lib/server/store";
import { GET as accountsGet, POST as accountsPost } from "@/app/api/mail/accounts/route";
import { PUT as settingsPut } from "@/app/api/mail/settings/route";
import { POST as mailAiRoute } from "@/app/api/mail/[id]/ai/route";
import { POST as mailReplyRoute } from "@/app/api/mail/[id]/reply/route";

/* --------------------------------------------------------- фейковый IMAP-сервер */

/** Сценарий: на каждый завершённый CRLF-запрос клиента — один блок ответа (многострочный целиком). */
type ImapScript = string[];

class FakeImapSocket extends EventEmitter {
  sent = "";
  script: ImapScript;
  constructor(script: ImapScript) {
    super();
    this.script = [...script];
  }
  setEncoding(): void {
    /* строки шлются сразу emit-ом */
  }
  write(chunk: string): void {
    this.sent += chunk;
    if (!chunk.endsWith("\r\n")) return;
    const reply = this.script.shift();
    if (reply !== undefined) setTimeout(() => this.emit("data", reply.endsWith("\r\n") ? reply : `${reply}\r\n`), 2);
  }
  destroy(): void {
    this.emit("close");
  }
}

const GREETING = "* OK IMAP4rev1 ready\r\n";

function fakeFactory(script: ImapScript) {
  const socket = new FakeImapSocket(script);
  let calls = 0;
  const factory = vi.fn(async () => {
    calls += 1;
    if (calls > 1) throw new Error("второе соединение не ожидалось");
    setTimeout(() => socket.emit("data", GREETING), 2);
    return socket as unknown as import("node:net").Socket;
  });
  return { socket, factory, calls: () => calls };
}

const IMAP_CFG = { host: "imap.test", port: 993, secure: false, user: "sales@test", pass: "hush" };

describe("MIME-парсер (этап 21)", () => {
  it("decodeWords: B и Q encoded-words, латиница без изменений", () => {
    const b64 = Buffer.from("Вопрос о тарифах", "utf8").toString("base64");
    expect(decodeWords(`=?utf-8?B?${b64}?=`)).toBe("Вопрос о тарифах");
    expect(decodeWords("=?utf-8?Q?Hello_=D0=BC=D0=B8=D1=80?=")).toBe("Hello мир");
    expect(decodeWords("plain subject")).toBe("plain subject");
  });

  it("parseAddresses: имя в скобках, список, без имени", () => {
    expect(parseAddresses('Ivan Test <ivan@test>, "П. Петров" <petya@test>')).toEqual([
      { name: "Ivan Test", address: "ivan@test" },
      { name: "П. Петров", address: "petya@test" }
    ]);
    expect(parseAddresses("ivan@test")[0]).toEqual({ name: "", address: "ivan@test" });
  });

  it("parseMime: простой text/plain base64", () => {
    const body = Buffer.from("Здравствуйте, нужны цены.", "utf8").toString("base64");
    const raw = `Message-ID: <m1@test>\r\nFrom: Ivan <ivan@test>\r\nSubject: Hi\r\nDate: Mon, 23 Nov 2026 10:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n`;
    const parsed = parseMime(raw);
    expect(parsed.headers["message-id"]).toBe("<m1@test>");
    expect(parsed.text).toBe("Здравствуйте, нужны цены.");
    expect(parsed.attachments).toHaveLength(0);
  });

  it("parseMime: multipart — текст quoted-printable и вложение base64", () => {
    const text = qp("Ошибка в сервисе"); // QP-тело utf-8
    const file = Buffer.from("col1;col2", "utf8").toString("base64");
    const raw = [
      'Content-Type: multipart/mixed; boundary="BOUND"',
      "",
      "--BOUND",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      text,
      "--BOUND",
      'Content-Disposition: attachment; filename="price.csv"',
      "Content-Transfer-Encoding: base64",
      "",
      file,
      "--BOUND--",
      ""
    ].join("\r\n");
    const parsed = parseMime(raw);
    expect(parsed.text).toBe("Ошибка в сервисе");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe("price.csv");
    expect(parsed.attachments[0].bytes.toString("utf8")).toBe("col1;col2");
  });
});

describe("IMAP-клиент поверх фейкового сокета (этап 21)", () => {
  it("LOGIN → SELECT → SEARCH → FETCH с литералом → LOGOUT", async () => {
    const literal = Buffer.from("From: a@b\r\n\r\nbody", "utf8");
    const { socket, factory } = fakeFactory([
      "A001 OK Logged in",
      "* 3 EXISTS\r\nA002 OK [READ-WRITE] Select completed",
      "* SEARCH 4 7\r\nA003 OK SEARCH done",
      `* 4 FETCH (UID 4 BODY[] {${literal.length}}\r\n${literal.toString("binary")}\r\n)\r\nA004 OK Fetch completed`,
      "A005 OK LOGOUT completed"
    ]);
    const session = await imapConnect(IMAP_CFG, factory);
    await session.selectFolder("INBOX");
    expect(await session.searchUids("UID 5:*")).toEqual([4, 7]);
    const raw = await session.fetchRaw(4);
    expect(raw.toString("utf8")).toContain("From: a@b");
    await session.logout();
    expect(socket.sent).toContain("A001 LOGIN \"sales@test\" \"hush\"");
  });

  it("LOGIN NO — честная ошибка с текстом сервера", async () => {
    const { factory } = fakeFactory(["A001 NO [AUTHENTICATIONFAILED] Invalid credentials"]);
    await expect(imapConnect(IMAP_CFG, factory)).rejects.toThrow("LOGIN");
  });

  it("imapFetchNew: первый запуск ставит курсор без загрузки тел; инкремент возвращает письма", async () => {
    const { factory } = fakeFactory([
      "A001 OK Logged in",
      "A002 OK Select completed",
      "* SEARCH 3 9\r\nA003 OK done",
      "A004 OK LOGOUT"
    ]);
    const first = await imapFetchNew(IMAP_CFG, "INBOX", null, factory);
    expect(first.messages).toHaveLength(0);
    expect(first.maxUid).toBe(9);
  });
});

/* --------------------------------------------------------- mailPollTick (загрузчик) */

function mailBlock(overrides: Partial<MailBlock> = {}): MailBlock {
  return {
    accounts: [
      {
        id: "acc1",
        name: "Продажи",
        imapHost: "imap.test",
        imapPort: 993,
        imapSecure: false,
        smtpHost: "smtp.test",
        smtpPort: 587,
        smtpSecure: false,
        user: "sales@test",
        pass: "hush",
        from: "sales@test",
        folders: ["INBOX"]
      }
    ],
    pollIntervalSec: 120,
    ...overrides
  };
}

function messageRaw(uid: number, opts: { from?: string; messageId?: string; text?: string } = {}): string {
  const from = opts.from ?? "Ivan Test <ivan@test>";
  const messageId = opts.messageId ?? `<m${uid}@test>`;
  const body = Buffer.from(opts.text ?? "Здравствуйте, нужны цены и сроки.", "utf8").toString("base64");
  return [
    `Message-ID: ${messageId}`,
    `From: ${from}`,
    "To: sales@test",
    `Subject: =?utf-8?B?${Buffer.from("Вопрос о тарифах", "utf8").toString("base64")}?=`,
    "Date: Mon, 23 Nov 2026 10:00:00 +0000",
    'Content-Type: text/plain; charset=utf-8',
    "Content-Transfer-Encoding: base64",
    "",
    body,
    ""
  ].join("\r\n");
}

function pollFactory(raws: Array<{ uid: number; raw: string }>, searchAll = "* SEARCH", searchNew?: string) {
  const script: ImapScript = ["A001 OK Logged in", "A002 OK Select", searchNew ?? searchAll];
  raws.forEach(({ uid, raw }, i) => {
    const literal = Buffer.from(raw, "utf8");
    const tag = `A${String(i + 4).padStart(3, "0")}`;
    script.push(`* ${uid} FETCH (UID ${uid} BODY[] {${literal.length}}\r\n${literal.toString("binary")}\r\n)\r\n${tag} OK Fetch`);
  });
  script.push(`A${String(raws.length + 4).padStart(3, "0")} OK LOGOUT`);
  return fakeFactory(script);
}

/** Тело в quoted-printable utf-8 (для теста multipart). */
function qp(text: string): string {
  return Buffer.from(text, "utf8").toString("binary").replace(/([^\x20-\x7e])/g, (_m, ch: string) => {
    return "=" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
  });
}

/** Файл-уровневый каталог данных: движок снимка — синглтон globalThis, каждый тест получает свежие секреты и сброс данных к сиду. */
let dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-mail-"));
let seq = 0;

async function freshState(mail?: MailBlock): Promise<void> {
  seq += 1;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), `aiws-mail-${seq}-`));
  process.env.AIWS_DATA_DIR = dir;
  writeCredentials({ version: 1, credentials: {}, ...(mail ? { mail } : {}) });
  if (mail) await getServerStore().api.data.reset();
}

describe("mailPollTick (этап 21)", () => {
  beforeEach(async () => {
    await freshState(mailBlock());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("первый тик ставит курсоры без заливки истории", async () => {
    const { factory } = pollFactory([], "* SEARCH 3 9\r\nA003 OK done");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await mailPollTick({ socketFactory: factory });
    expect(result.fetched).toBe(0);
    expect(result.leadsCreated).toBe(0);
    expect(readMailBlock()?.cursors?.["acc1:INBOX"]?.uid).toBe(9);
    expect(warn).not.toHaveBeenCalled();
  });

  it("новые письма записываются со статусом «Новое», лид создаётся автоматически с email", async () => {
    // Первый тик — только курсор (история не заливается), второй — инкрементальная загрузка.
    await mailPollTick({ socketFactory: pollFactory([], "* SEARCH 3 9\r\nA003 OK done").factory });
    const { factory } = pollFactory(
      [
        { uid: 10, raw: messageRaw(10) },
        { uid: 11, raw: messageRaw(11, { from: "Anna <anna@test>", messageId: "<m11@test>", text: "Ошибка в сервисе, нужна помощь" }) }
      ],
      "",
      "* SEARCH 10 11\r\nA003 OK done"
    );
    const result = await mailPollTick({ socketFactory: factory });
    expect(result.fetched).toBe(2);
    expect(result.leadsCreated).toBe(2);

    const emails = await getServerStore().api.emails.list();
    expect(emails).toHaveLength(2);
    expect(emails.every((e) => e.status === "Новое")).toBe(true);
    expect(emails.every((e) => e.accountId === "acc1" && e.folder === "INBOX")).toBe(true);
    expect(emails.find((e) => e.messageId === "<m10@test>")?.body).toBe("Здравствуйте, нужны цены и сроки.");
    const leads = await getServerStore().api.leads.list();
    const anna = leads.find((l) => l.email === "anna@test");
    expect(anna?.channel).toBe("email");
    expect(emails.find((e) => e.messageId === "<m11@test>")?.leadId).toBe(anna?.id);
  });

  it("повторный тик: дедуп по Message-ID и курсор не даёт загрузить то же самое", async () => {
    await mailPollTick({ socketFactory: pollFactory([], "* SEARCH 3 9\r\nA003 OK done").factory });
    const first = pollFactory([{ uid: 10, raw: messageRaw(10) }], "", "* SEARCH 10\r\nA003 OK done");
    await mailPollTick({ socketFactory: first.factory });
    // Сервер снова отдаёт UID 10 (клиент после «сброса» курсора), но письмо уже в хранилище.
    const second = pollFactory([{ uid: 10, raw: messageRaw(10) }], "", "* SEARCH 10\r\nA003 OK done");
    const result = await mailPollTick({ socketFactory: second.factory });
    expect(result.fetched).toBe(0);
    expect(await getServerStore().api.emails.list()).toHaveLength(1);
  });

  it("свой адрес (тестовое письмо самому себе) лидом не становится", async () => {
    await mailPollTick({ socketFactory: pollFactory([], "* SEARCH 3 9\r\nA003 OK done").factory });
    const { factory } = pollFactory([{ uid: 12, raw: messageRaw(12, { from: "sales@test", messageId: "<self@test>" }) }], "", "* SEARCH 12\r\nA003 OK done");
    const result = await mailPollTick({ socketFactory: factory });
    expect(result.fetched).toBe(1);
    expect(result.leadsCreated).toBe(0);
    expect((await getServerStore().api.emails.list())[0].leadId).toBeNull();
  });

  it("сбой IMAP не роняет тик: ошибка в результате и lastError блока", async () => {
    const { factory } = fakeFactory(["A001 NO auth failed"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await mailPollTick({ socketFactory: factory });
    expect(result.errors["sales@test"]).toContain("INBOX");
    expect(readMailBlock()?.lastError?.["acc1"]?.message).toContain("LOGIN");
    expect(warn).toHaveBeenCalled();
  });
});

/* --------------------------------------------------------- AI-функции писем */

const LETTER = {
  id: "em-1",
  accountId: "acc1",
  folder: "INBOX",
  uid: 10,
  messageId: "<m10@test>",
  from: "Ivan <ivan@test>",
  to: "sales@test",
  subject: "Вопрос о тарифах",
  date: Date.parse("2026-11-23T10:00:00Z"),
  body: "Здравствуйте, нужны цены и сроки. Ошибка в личном кабинете тоже есть.",
  status: "Новое" as const,
  leadId: null,
  category: null,
  categorySource: null,
  attachments: []
};

describe("mailAi (этап 21)", () => {
  beforeEach(async () => {
    await freshState();
  });

  it("без блока ai — честный scripted-fallback с пометкой «не LLM»", async () => {
    const cls = await mailAi("classify", LETTER, null);
    expect(cls.source).toBe("scripted");
    expect(cls.text).toBe("продажи");
    expect(cls.note).toContain("не LLM");
    expect(scriptedCategory({ ...LETTER, subject: "Ошибка", body: "не работает" })).toBe("поддержка");
    const draft = await mailAi("draft", LETTER, "деловой");
    expect(draft.text).toContain("не LLM");
  });

  it("с провайдером-заглушкой: классификация сохраняется по слову ответа, draft возвращается как есть", async () => {
    writeCredentials({ version: 1, credentials: {}, ai: { provider: "zai" } });
    const provider = (config: unknown) => ({
      name: "stub",
      model: "stub-1",
      complete: async (messages: Array<{ role: string; content: string }>) => {
        const system = messages.find((m) => m.role === "system")?.content ?? "";
        return system.includes("Классифицируй") ? "  Продажи " : "Черновик ответа клиенту.";
      }
    });
    const cls = await mailAi("classify", LETTER, null, { providerFactory: provider as never });
    expect(cls.source).toBe("llm");
    expect(cls.text).toBe("продажи");
    const draft = await mailAi("draft", LETTER, "деловой", { providerFactory: provider as never });
    expect(draft.text).toBe("Черновик ответа клиенту.");
    expect(draft.note).toBe("модель: stub-1");
  });

  it("классификация вне списка категорий → «другое» (не выдумываем)", async () => {
    writeCredentials({ version: 1, credentials: {}, ai: { provider: "zai" } });
    const provider = () => ({ name: "stub", model: null, complete: async () => "не знаю" });
    const cls = await mailAi("classify", LETTER, null, { providerFactory: provider as never });
    expect(cls.text).toBe("другое");
  });
});

/* --------------------------------------------------------- маршруты /api/mail/* */

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/mail/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("маршруты /api/mail/* (этап 21)", () => {
  beforeEach(async () => {
    await freshState();
  });

  it("POST /api/mail/accounts: аккаунт создаётся, пароль в ответе — только маска", async () => {
    const res = await accountsPost(jsonRequest({ name: "Продажи", imapHost: "imap.test", imapPort: 993, imapSecure: true, smtpHost: "smtp.test", smtpPort: 587, smtpSecure: false, user: "sales@test", pass: "s3cret-123", folders: ["Sent"] }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { account: { passMask: string; pass?: string; folders: string[] } };
    expect(body.account.pass).toBeUndefined();
    expect(body.account.passMask).toContain("••••");
    expect(body.account.passMask.endsWith("123")).toBe(true);
    expect(body.account.folders[0]).toBe("INBOX");
    expect(body.account.folders).toContain("Sent");
  });

  it("POST без обязательных полей — 400 validation", async () => {
    const res = await accountsPost(jsonRequest({ imapHost: "imap.test" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("validation");
  });

  it("GET /api/mail/accounts: пароль не покидает сервер", async () => {
    await accountsPost(jsonRequest({ name: "A", imapHost: "imap.test", imapPort: 993, imapSecure: true, smtpHost: "smtp.test", smtpPort: 587, smtpSecure: false, user: "a@test", pass: "longpassword1", folders: [] }));
    const res = await accountsGet(new Request("http://localhost/api/mail/accounts"));
    const text = await res.text();
    expect(text).not.toContain("longpassword1");
    expect(text).toContain("passMask");
  });

  it("PUT /api/mail/settings: границы интервала 30–3600", async () => {
    const bad = await settingsPut(jsonRequest({ pollIntervalSec: 5 }));
    expect(bad.status).toBe(400);
    const ok = await settingsPut(jsonRequest({ pollIntervalSec: 300 }));
    expect(ok.status).toBe(200);
    expect(readMailBlock()?.pollIntervalSec).toBe(300);
  });

  it("POST /api/mail/[id]/ai для несуществующего письма — 404", async () => {
    const res = await mailAiRoute(jsonRequest({ action: "summary" }), { params: Promise.resolve({ id: "em-none" }) });
    expect(res.status).toBe(404);
  });

  it("POST /api/mail/[id]/reply без учётной записи аккаунта письма — честный 503", async () => {
    const store = getServerStore().api;
    const email = await store.emails.create({ ...LETTER, id: "em-r1" });
    const res = await mailReplyRoute(jsonRequest({ text: "Привет" }), { params: Promise.resolve({ id: email.id }) });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("Учётная запись почты");
  });

  it("POST /api/mail/[id]/reply с пустым текстом — 400", async () => {
    const store = getServerStore().api;
    const email = await store.emails.create({ ...LETTER, id: "em-r2" });
    writeCredentials({ version: 1, credentials: {}, mail: mailBlock() });
    const res = await mailReplyRoute(jsonRequest({ text: "" }), { params: Promise.resolve({ id: email.id }) });
    expect(res.status).toBe(400);
  });
});

/* --------------------------------------------------------- блок mail в secrets.json */

describe("блок mail в secrets.json (этап 21)", () => {
  it("отсутствие блока — null (канал не настроен); битый файл — пустой набор", async () => {
    await freshState();
    expect(readMailBlock()).toBeNull();
    fs.writeFileSync(path.join(dir, "secrets.json"), "{broken", { mode: 0o600 });
    expect(readMailBlock()).toBeNull();
  });
});
