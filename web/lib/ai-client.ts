/**
 * Этап 16: клиентские вызовы AI-маршрутов (только через сервер — ключ LLM в браузер не
 * попадает). Ответ всегда содержит честный источник: source "scripted" — демо-ответ по
 * ключевым словам (не LLM), "llm" — настоящий провайдер из secrets.json. Ошибка сервера
 * (например, недоступный LLM) отдаётся вызывающему коду как честный текст, демо-ответом
 * она не подменяется.
 */

export interface AiReplyResult {
  text: string;
  source: "llm" | "scripted";
  provider: string | null;
  model: string | null;
  /** Пометка источника для показа под сообщением: «демо-ответ…» или «модель: …». */
  note: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  apiKeyMask: string | null;
}

export type AiScope = "dialog" | "test" | "boss";

/** Статус LLM-провайдера (ключ — только маска); падение сети — честная ошибка вызывающему. */
export async function fetchAiStatus(): Promise<AiStatus> {
  const res = await fetch("/api/ai/status");
  if (!res.ok) throw new Error("Не удалось получить статус ИИ-провайдера");
  return (await res.json()) as AiStatus;
}

/** Ответ AI-сотрудника; при недоступности сервиса или провайдера — честная ошибка. */
export async function requestAiReply(input: {
  scope: AiScope;
  message: string;
  agentId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AiReplyResult> {
  const res = await fetch("/api/ai/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Сервис ИИ недоступен — попробуйте ещё раз");
  }
  return (await res.json()) as AiReplyResult;
}
