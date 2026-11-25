import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { ACTOR_META, MODE_META, addMessagePatch, contextStatus, fmtBytes, messagePreview, nowHM } from "@/lib/selectors/dialogs";

describe("селекторы «Диалогов»: режимы и авторы", () => {
  it("режимы: подписи соответствуют прототипу (секции.js chips)", () => {
    expect(MODE_META.ai.label).toBe("ИИ отвечает");
    expect(MODE_META.human.label).toBe("Менеджер отвечает");
    expect(MODE_META.reading.label).toBe("ИИ в режиме чтения");
  });
  it("информация о режиме не только цветом: у чипа всегда текст, точка есть у ai/reading", () => {
    expect(MODE_META.ai.dotClass).not.toBeNull();
    expect(MODE_META.reading.dotClass).not.toBeNull();
    expect(MODE_META.human.dotClass).toBeNull();
  });
  it("авторы сообщений: Клиент / ИИ / Менеджер", () => {
    expect(ACTOR_META.client).toBe("Клиент");
    expect(ACTOR_META.ai).toBe("ИИ");
    expect(ACTOR_META.human).toBe("Менеджер");
  });
  it("контекст: «С ИИ» только в режиме ai (как в прототипе)", () => {
    expect(contextStatus("ai")).toBe("С ИИ");
    expect(contextStatus("human")).toBe("С менеджером");
    expect(contextStatus("reading")).toBe("С менеджером");
  });
});

describe("отправка сообщения менеджером (addMessagePatch)", () => {
  const conv = SEED_DATA.CONVERSATIONS[0];

  it("дописывает сообщение в конец, обновляет превью и время, переводит в «ИИ в режиме чтения»", () => {
    const msg = { from: "human" as const, text: "Передаю обращение на оформление возврата.", time: "14:05" };
    const patch = addMessagePatch(conv, msg, "reading");
    expect(patch.messages?.length).toBe(conv.messages.length + 1);
    expect(patch.messages?.at(-1)).toEqual(msg);
    expect(patch.lastPreview).toBe("Передаю обращение на оформление возврата.");
    expect(patch.lastTime).toBe("14:05");
    expect(patch.mode).toBe("reading");
  });
  it("вход не мутируется: исходные сообщения диалога не изменились", () => {
    const before = conv.messages.length;
    addMessagePatch(conv, { from: "human", text: "x", time: "10:00" });
    expect(conv.messages.length).toBe(before);
  });
  it("без явного режима патч не меняет режим диалога", () => {
    const patch = addMessagePatch(conv, { from: "human", text: "x", time: "10:00" });
    expect(patch.mode).toBeUndefined();
    expect(patch.lastPreview).toBe("x");
  });
});

describe("время сообщений", () => {
  it("nowHM — UTC ЧЧ:ММ (как db.nowHM прототипа и часы в шапке)", () => {
    expect(nowHM()).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("демо-данные «Диалогов»", () => {
  it("три демо-диалога покрывают все три режима", () => {
    const modes = SEED_DATA.CONVERSATIONS.map((c) => c.mode).sort();
    expect(modes).toEqual(["ai", "human", "reading"]);
  });
  it("у каждого диалога есть контекст клиента (кто, канал, история, следующий шаг)", () => {
    for (const c of SEED_DATA.CONVERSATIONS) {
      expect(c.context.who, c.id).not.toBe("");
      expect(c.context.channel, c.id).not.toBe("");
      expect(c.context.history, c.id).not.toBe("");
      expect(c.context.nextStep, c.id).not.toBe("");
    }
  });
});

describe("вложения в диалоге (этап 6)", () => {
  const conv = SEED_DATA.CONVERSATIONS[0];
  const att = { name: "бриф.txt", size: 33, mime: "text/plain", data: "0KLg" };
  it("fmtBytes: байты, целые и дробные КБ, МБ без хвостового нуля", () => {
    expect(fmtBytes(512)).toBe("512 Б");
    expect(fmtBytes(2048)).toBe("2 КБ");
    expect(fmtBytes(1536)).toBe("1,5 КБ");
    expect(fmtBytes(1024 * 1024)).toBe("1 МБ");
    expect(fmtBytes(1572864)).toBe("1,5 МБ");
  });
  it("превью сообщения с текстом — текст", () => {
    expect(messagePreview({ from: "human", text: "Привет", time: "12:00" })).toBe("Привет");
  });
  it("превью сообщения без текста, но с вложениями — «📎 имена»; пустое — пустая строка", () => {
    expect(messagePreview({ from: "human", text: "", attachments: [att, { ...att, name: "смета.pdf" }] })).toBe("📎 бриф.txt, смета.pdf");
    expect(messagePreview({ from: "human", text: "" })).toBe("");
  });
  it("addMessagePatch: вложения уходят в сообщение; превью без текста — «📎 имена»", () => {
    const patch = addMessagePatch(conv, { from: "human", text: "", time: "12:00", attachments: [att] }, "reading");
    expect(patch.messages?.at(-1)?.attachments).toEqual([att]);
    expect(patch.lastPreview).toBe("📎 бриф.txt");
    expect(patch.mode).toBe("reading");
  });
  it("addMessagePatch: у текстового сообщения превью-поведение прежнее", () => {
    const patch = addMessagePatch(conv, { from: "human", text: "Проверка отправки", time: "12:01" });
    expect(patch.lastPreview).toBe("Проверка отправки");
  });
});
