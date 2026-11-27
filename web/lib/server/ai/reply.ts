import { z } from "zod";
import { ApiError } from "@/lib/api/types";
import type { AiBlock } from "@/lib/integrations/types";
import { scriptedReply } from "@/lib/scripted-reply";
import { readAiBlock } from "@/lib/server/secrets";
import { getServerStore } from "@/lib/server/store";
import { createAiProvider, type AiMessage, type AiProvider } from "@/lib/server/ai/provider";

/**
 * Этап 16: сборка ответа AI-сотрудника на сервере. Контекст ответа — инструкция сотрудника
 * и тезисы базы знаний хранилища (коллекция AGENTS); у scope "boss" — общая роль AI-РОП.
 * Провайдер не настроен (блока ai нет в secrets.json) — честный scripted-fallback с пометкой
 * «демо-ответ» (scripted-reply.ts, маркер не убирается). Провайдер настроен, но вызов не
 * удался — ApiError("unavailable"): интерфейс показывает ошибку, не подменяя её демо-ответом.
 * Каждый ответ содержит источник: source "llm" или "scripted".
 */

export const aiReplyRequestSchema = z
  .object({
    /** Точка вызова: диалог, тест-чат сотрудника, «Вопрос руководителю». */
    scope: z.enum(["dialog", "test", "boss"]),
    /** Реплика пользователя; ответ строится по ней и контексту. */
    message: z.string().min(1).max(4000),
    /** Сотрудник, чья инструкция задаёт контекст; обязателен для dialog/test. */
    agentId: z.string().max(100).optional(),
    /** Последние сообщения диалога; сервер берёт не больше 10 последних. */
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(2000)
        })
      )
      .max(20)
      .optional()
  })
  .superRefine((val, ctx) => {
    if (val.scope !== "boss" && !val.agentId) {
      ctx.addIssue({ code: "custom", message: "Для scope dialog/test требуется agentId" });
    }
  });

export type AiScope = z.infer<typeof aiReplyRequestSchema>["scope"];

const HISTORY_LIMIT = 10;

export interface AiReplyResult {
  text: string;
  /** "llm" — настоящий провайдер, "scripted" — демо-ответ по ключевым словам (не LLM). */
  source: "llm" | "scripted";
  provider: string | null;
  model: string | null;
  /** Пометка для интерфейса: «демо-ответ…» или «модель: …». */
  note: string;
}

/** Демо-ответ по сценарию с честной пометкой (этап 16, fallback без провайдера). */
export function scriptedResult(message: string): AiReplyResult {
  return { text: scriptedReply(message), source: "scripted", provider: null, model: null, note: "демо-ответ по сценарию, не LLM" };
}

/**
 * Системная инструкция провайдера. У dialog/test — роль AI-сотрудника: его инструкция и
 * тезисы базы знаний нумерованным списком; у boss — роль AI-руководителя отдела продаж.
 * Честность: провайдеру прямо запрещено выдумывать факты.
 */
export function buildSystemPrompt(agent: { name: string; instruction: string; knowledge: readonly string[] }, scope: AiScope): string {
  if (scope === "boss") {
    return [
      "Ты — AI-руководитель отдела продаж (AI-РОП). Отвечай кратко и по делу на вопросы руководителя о диалогах, качестве и метриках.",
      "Не выдумывай фактов: если данных нет в вопросе — честно скажи, что нужны данные из приложения. Отвечай по-русски."
    ].join(" ");
  }
  const knowledge = agent.knowledge.length
    ? "\nТезисы базы знаний:\n" + agent.knowledge.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "";
  return [
    `Ты — AI-сотрудник «${agent.name}». Пиши по-русски, коротко и вежливо.`,
    "Не выдумывай фактов: чего нет в инструкции и базе знаний — предложи передать вопрос менеджеру.",
    `Инструкция сотрудника:\n${agent.instruction || "(инструкция не задана)"}${knowledge}`
  ].join("\n");
}

/**
 * Ответ AI-сотрудника: сборка сообщений (system + история ≤10 + реплика) и вызов провайдера.
 * deps.providerFactory инъектируется в unit-тестах — реальной сети и затрат нет.
 */
export async function aiReply(
  input: z.infer<typeof aiReplyRequestSchema>,
  deps: { providerFactory?: (config: AiBlock) => AiProvider } = {}
): Promise<AiReplyResult> {
  const config = readAiBlock();
  if (!config) return scriptedResult(input.message);

  let agent: { name: string; instruction: string; knowledge: readonly string[] } | null = null;
  if (input.scope !== "boss") {
    const loaded = await getServerStore().api.agents.get(input.agentId ?? "");
    if (!loaded) throw new ApiError("not_found", "Сотрудник не найден");
    agent = { name: loaded.name, instruction: loaded.instruction, knowledge: loaded.knowledge };
  }
  const system = buildSystemPrompt(agent ?? { name: "AI-РОП", instruction: "", knowledge: [] }, input.scope);
  const messages: AiMessage[] = [
    { role: "system", content: system },
    ...(input.history ?? []).slice(-HISTORY_LIMIT).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: input.message }
  ];
  const provider = (deps.providerFactory ?? createAiProvider)(config);
  let text: string;
  try {
    text = await provider.complete(messages);
  } catch (e) {
    if (e instanceof ApiError) throw e; // честная причина уже сформирована адаптером
    throw new ApiError("unavailable", "Провайдер LLM недоступен — попробуйте позже или проверьте блок ai в secrets.json");
  }
  return { text, source: "llm", provider: provider.name, model: provider.model, note: provider.model ? `модель: ${provider.model}` : "ответ LLM" };
}
