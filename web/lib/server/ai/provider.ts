import { ApiError } from "@/lib/api/types";
import type { AiBlock } from "@/lib/integrations/types";

/**
 * Этап 16: серверные провайдеры LLM за единым интерфейсом. Вызовы выполняются только из
 * серверных маршрутов /api/ai/* — ключ из блока ai файла .data/secrets.json в браузер не
 * попадает (только маска maskSecret()). Два адаптера: "zai" — SDK z-ai-web-dev-sdk
 * (sdkFactory инъектируется в тестах — сети и затрат нет), "openai" — любая
 * OpenAI-совместимая точка /chat/completions через инъекцию fetchImpl (в тестах заглушка).
 * Ошибки честные: ApiError("unavailable") с понятной причиной, ответ не выдумывается.
 */

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProvider {
  /** Человекочитаемое имя адаптера — попадает в пометку ответа в интерфейсе. */
  readonly name: string;
  /** Модель для пометки; null — используется дефолт провайдера. */
  readonly model: string | null;
  complete(messages: AiMessage[]): Promise<string>;
}

/** Минимальный контракт SDK z-ai-web-dev-sdk: default.create() → клиент chat.completions. */
export interface ZaiSdk {
  chat: {
    completions: {
      create(args: {
        messages: AiMessage[];
        model?: string;
        thinking?: { type: string };
      }): Promise<{ choices?: Array<{ message?: { content?: string | null } | null } | null> }>;
    };
  };
}

/** Фабрика SDK-клиента; в unit-тестах подставляется заглушка без сети. */
export type SdkFactory = () => Promise<ZaiSdk>;
export type FetchImpl = typeof fetch;

/** Дефолтная фабрика: динамический импорт SDK на сервере (backend-only, этап 16). */
async function defaultSdkFactory(): Promise<ZaiSdk> {
  const mod = (await import("z-ai-web-dev-sdk")) as unknown as {
    default?: { create: () => Promise<ZaiSdk> };
    create?: () => Promise<ZaiSdk>;
  };
  const factory = mod.default ?? mod;
  if (!factory || typeof factory.create !== "function") {
    throw new ApiError("unavailable", "SDK z-ai-web-dev-sdk недоступен в этом окружении");
  }
  return factory.create();
}

/** Текст первого выбора из ответа провайдера; пустой или отсутствующий — null. */
function pickChoiceText(parsed: unknown): string | null {
  const choices = (parsed as { choices?: Array<{ message?: { content?: string | null } | null }> })?.choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

/** OpenAI-совместимый адаптер: POST {baseUrl}/chat/completions, Bearer-ключ, model при заданном. */
async function completeOpenAI(messages: AiMessage[], config: AiBlock, fetchImpl: FetchImpl): Promise<string> {
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  if (!base) throw new ApiError("validation", "Не задан baseUrl OpenAI-совместимого провайдера (блок ai в secrets.json)");
  if (!config.apiKey) throw new ApiError("validation", "Не задан apiKey OpenAI-совместимого провайдера (блок ai в secrets.json)");
  let res: Response;
  try {
    res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ ...(config.model ? { model: config.model } : {}), messages })
    });
  } catch {
    throw new ApiError("unavailable", "Провайдер LLM недоступен (сетевая ошибка)");
  }
  if (!res.ok) throw new ApiError("unavailable", `Провайдер LLM ответил ошибкой HTTP ${res.status}`);
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new ApiError("unavailable", "Провайдер LLM вернул ответ не в формате JSON");
  }
  const text = pickChoiceText(parsed);
  if (!text) throw new ApiError("unavailable", "Провайдер LLM вернул пустой ответ");
  return text;
}

/** Фабрика провайдера по блоку ai из secrets.json (этап 16). */
export function createAiProvider(config: AiBlock, deps: { fetchImpl?: FetchImpl; sdkFactory?: SdkFactory } = {}): AiProvider {
  if (config.provider === "openai") {
    const fetchImpl = deps.fetchImpl ?? fetch;
    return {
      name: "openai",
      model: config.model ?? null,
      complete: (messages) => completeOpenAI(messages, config, fetchImpl)
    };
  }
  const sdkFactory = deps.sdkFactory ?? defaultSdkFactory;
  return {
    name: "zai",
    model: config.model ?? null,
    complete: async (messages) => {
      let sdk: ZaiSdk;
      try {
        sdk = await sdkFactory();
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError("unavailable", "Не удалось инициализировать SDK z-ai-web-dev-sdk");
      }
      let completion: Awaited<ReturnType<ZaiSdk["chat"]["completions"]["create"]>>;
      try {
        completion = await sdk.chat.completions.create({
          messages,
          ...(config.model ? { model: config.model } : {}),
          thinking: { type: "disabled" }
        });
      } catch {
        throw new ApiError("unavailable", "Провайдер LLM недоступен (ошибка вызова z-ai-web-dev-sdk)");
      }
      const text = pickChoiceText(completion);
      if (!text) throw new ApiError("unavailable", "Провайдер LLM вернул пустой ответ");
      return text;
    }
  };
}
