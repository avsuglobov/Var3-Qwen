import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerStore } from "@/lib/server/store";
import { SEED_DATA } from "@/lib/mock-data/seed";

/**
 * Этап 16: LLM-провайдеры AI-сотрудников и маршрут /api/ai/*. Провайдеры проверяются с
 * инъекциями (fetchImpl и sdkFactory — заглушки, сети и затрат нет): честные ошибки при
 * недоступности, формат вызова OpenAI-совместимой точки, контракт SDK. Сборка ответа —
 * контекст из инструкции и базы знаний сотрудника, scripted-fallback без блока ai,
 * честный отказ при сбое провайдера, маска ключа в /api/ai/status.
 */

// Каталог данных задаётся до первого обращения хранилища (пути вычисляются лениво при каждой операции).
process.env.AIWS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-ai-"));

import { createAiProvider, type AiMessage, type ZaiSdk } from "@/lib/server/ai/provider";
import { aiReply, buildSystemPrompt, scriptedResult } from "@/lib/server/ai/reply";
import { POST as replyRoute } from "@/app/api/ai/reply/route";
import { GET as statusRoute } from "@/app/api/ai/status/route";
import { readCredentials, writeCredentials } from "@/lib/server/secrets";

const json = async (res: Response): Promise<{ status: number; body: unknown }> => {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const post = (body: unknown): Request =>
  new Request("http://x/api/ai/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Блок ai в secrets.json для сценария «провайдер настроен»; без аргумента — блок убирается. */
const setAiBlock = (ai?: { provider: "zai" | "openai"; baseUrl?: string; apiKey?: string; model?: string }): void => {
  const file = readCredentials();
  if (ai) file.ai = ai;
  else delete file.ai;
  writeCredentials(file);
};

const agent = () => ({ ...SEED_DATA.AGENTS[0]!, id: "AG-9001" });

beforeEach(async () => {
  getServerStore().setFaults({ fail: false, latencyMs: 0 });
  await getServerStore().api.data.reset();
  setAiBlock();
  await getServerStore().api.agents.create(agent());
});

describe("адаптер провайдера openai (fetchImpl-заглушка)", () => {
  it("успешный вызов: POST {baseUrl}/chat/completions, Bearer, model и messages в теле; текст обрезан по краям", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = createAiProvider(
      { provider: "openai", baseUrl: "https://api.test/v1/", apiKey: "secret-key", model: "glm-4.6" },
      {
        fetchImpl: async (input, init) => {
          calls.push({ url: String(input), init });
          return new Response(JSON.stringify({ choices: [{ message: { content: "  Ответ LLM  " } }] }), { status: 200 });
        }
      }
    );
    const text = await provider.complete([{ role: "user", content: "вопрос" }]);
    expect(text).toBe("Ответ LLM");
    expect(provider.model).toBe("glm-4.6");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.test/v1/chat/completions");
    const body = JSON.parse(String(calls[0]!.init?.body)) as { model?: string; messages: AiMessage[] };
    expect(body.model).toBe("glm-4.6");
    expect(body.messages).toEqual([{ role: "user", content: "вопрос" }]);
  });

  it.each([
    ["HTTP 401", 401, "ответил ошибкой HTTP 401"],
    ["пустой ответ", 200, "вернул пустой ответ"],
    ["не-JSON ответ", 200, "не в формате JSON"]
  ])("честная ошибка: %s", async (_label, status, messagePart) => {
    const body = status === 200 && messagePart.includes("пустой") ? { choices: [{ message: { content: "" } }] } : status === 200 ? "не json" : { choices: [] };
    const provider = createAiProvider(
      { provider: "openai", baseUrl: "https://api.test/v1", apiKey: "k" },
      { fetchImpl: async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }) }
    );
    await expect(provider.complete([{ role: "user", content: "q" }])).rejects.toMatchObject({ code: "unavailable", message: expect.stringContaining(messagePart) });
  });

  it("сетевой сбой → честная «недоступен», конфигурация без baseUrl → validation до сети", async () => {
    const netProvider = createAiProvider(
      { provider: "openai", baseUrl: "https://api.test/v1", apiKey: "k" },
      { fetchImpl: async () => { throw new Error("boom"); } }
    );
    await expect(netProvider.complete([{ role: "user", content: "q" }])).rejects.toMatchObject({ code: "unavailable", message: expect.stringContaining("недоступен") });
    const noBase = createAiProvider({ provider: "openai", apiKey: "k" }, { fetchImpl: async () => new Response("{}", { status: 200 }) });
    await expect(noBase.complete([{ role: "user", content: "q" }])).rejects.toMatchObject({ code: "validation", message: expect.stringContaining("baseUrl") });
  });
});

describe("адаптер провайдера zai (sdkFactory-заглушка)", () => {
  it("успешный вызов: thinking disabled, model передаётся, текст из choices", async () => {
    const create = vi.fn((args: { messages: AiMessage[]; model?: string; thinking?: { type: string } }) =>
      Promise.resolve({ choices: [{ message: { content: `Ответ SDK (${args.thinking?.type ?? "-"})` } }] })
    );
    const sdk: ZaiSdk = { chat: { completions: { create: create as unknown as ZaiSdk["chat"]["completions"]["create"] } } };
    const provider = createAiProvider({ provider: "zai", model: "glm-4.6" }, { sdkFactory: async () => sdk });
    const text = await provider.complete([{ role: "user", content: "вопрос" }]);
    expect(text).toBe("Ответ SDK (disabled)");
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]![0];
    expect(args.messages).toEqual([{ role: "user", content: "вопрос" }]);
    expect(args.model).toBe("glm-4.6");
    expect(args.thinking).toEqual({ type: "disabled" });
  });

  it("сбой SDK и пустой ответ — честные unavailable, дефолтная фабрика без SDK не роняет типы", async () => {
    const failProvider = createAiProvider({ provider: "zai" }, { sdkFactory: async () => { throw new Error("no sdk"); } });
    await expect(failProvider.complete([{ role: "user", content: "q" }])).rejects.toMatchObject({ code: "unavailable" });
    const emptyProvider = createAiProvider(
      { provider: "zai" },
      { sdkFactory: async () => ({ chat: { completions: { create: async () => ({ choices: [] }) } } }) }
    );
    await expect(emptyProvider.complete([{ role: "user", content: "q" }])).rejects.toMatchObject({ code: "unavailable", message: expect.stringContaining("пустой") });
  });
});

describe("сборка ответа aiReply", () => {
  it("system-промпт: имя, инструкция и нумерованные тезисы базы знаний; у boss — роль AI-РОП", () => {
    const dialog = buildSystemPrompt({ name: "Аня", instruction: "Продаём тарифы.", knowledge: ["Тезис один", "Тезис два"] }, "dialog");
    expect(dialog).toContain("Аня");
    expect(dialog).toContain("Продаём тарифы.");
    expect(dialog).toContain("1. Тезис один");
    expect(dialog).toContain("2. Тезис два");
    expect(buildSystemPrompt({ name: "x", instruction: "", knowledge: [] }, "boss")).toContain("AI-РОП");
  });

  it("без блока ai — scripted-fallback с честной пометкой «демо»", async () => {
    const r = await aiReply({ scope: "boss", message: "какая цена тарифа?" });
    expect(r).toEqual({ ...scriptedResult("какая цена тарифа?"), text: expect.stringContaining("тарифов") });
    expect(r.source).toBe("scripted");
    expect(r.note).toContain("не LLM");
  });

  it("с провайдером — source llm, модель и provider в ответе; в system уходит инструкция и база знаний; история обрезается до 10", async () => {
    setAiBlock({ provider: "zai", model: "glm-4.6" });
    let captured: AiMessage[] = [];
    const r = await aiReply(
      {
        scope: "dialog",
        agentId: agent().id,
        message: "вопрос клиента",
        history: Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `msg-${i}` }))
      },
      { providerFactory: (config) => ({ name: "stub", model: config.model ?? null, complete: async (msgs) => { captured = msgs; return "LLM-ответ"; } }) }
    );
    expect(r).toMatchObject({ text: "LLM-ответ", source: "llm", provider: "stub", model: "glm-4.6", note: "модель: glm-4.6" });
    expect(captured).toHaveLength(12); // system + 10 последних сообщений истории + реплика
    expect(captured[0]!.role).toBe("system");
    expect(captured[0]!.content).toContain(agent().instruction.slice(0, 20));
    expect(captured.at(-1)).toEqual({ role: "user", content: "вопрос клиента" });
  });

  it("провайдер настроен и упал — честная unavailable, демо-подмены нет", async () => {
    setAiBlock({ provider: "zai" });
    await expect(
      aiReply({ scope: "boss", message: "вопрос" }, { providerFactory: () => ({ name: "stub", model: null, complete: async () => { throw new Error("down"); } }) })
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("dialog/test без сотрудника: неизвестный agentId → 404 not_found (при настроенном провайдере)", async () => {
    setAiBlock({ provider: "zai" });
    await expect(aiReply({ scope: "dialog", agentId: "AG-нет", message: "q" }, { providerFactory: () => ({ name: "s", model: null, complete: async () => "x" }) }))
      .rejects.toMatchObject({ code: "not_found" });
  });
});

describe("маршруты /api/ai/*", () => {
  it("POST /api/ai/reply без блока ai → 200 scripted с пометкой", async () => {
    const res = await replyRoute(post({ scope: "test", agentId: agent().id, message: "Есть тариф для команды?" }));
    expect(await json(res)).toMatchObject({ status: 200, body: { source: "scripted", note: expect.stringContaining("не LLM") } });
  });

  it("POST: битое/неполное тело → 400 validation; dialog без agentId → 400", async () => {
    expect((await json(await replyRoute(post({ scope: "boss" })))).status).toBe(400);
    expect((await json(await replyRoute(post({ scope: "boss", message: "" })))).status).toBe(400);
    expect((await json(await replyRoute(post({ scope: "dialog", message: "q" })))).status).toBe(400);
    expect((await json(await replyRoute(post({ scope: "другое", message: "q" })))).status).toBe(400);
  });

  it("POST: неизвестный агент при настроенном провайдере → 404 not_found", async () => {
    setAiBlock({ provider: "zai" });
    const res404 = await json(await replyRoute(post({ scope: "dialog", agentId: "AG-нет", message: "q" })));
    expect(res404).toMatchObject({ status: 404, body: { code: "not_found" } });
  });

  it("GET /api/ai/status: без блока — configured false; с блоком — configured true и ключ только маской", async () => {
    const empty = await json(await statusRoute(new Request("http://x/api/ai/status")));
    expect(empty.body).toMatchObject({ configured: false, provider: null, apiKeyMask: null });
    setAiBlock({ provider: "openai", apiKey: "test-key-1234567890", model: "glm-4.6" });
    const full = await json(await statusRoute(new Request("http://x/api/ai/status")));
    expect(full.body).toMatchObject({ configured: true, provider: "openai", model: "glm-4.6", apiKeyMask: "••••7890" });
    expect(JSON.stringify(full.body)).not.toContain("test-key-1234567890");
  });
});
