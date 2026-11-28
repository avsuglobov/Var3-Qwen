import { APP_NAME } from "@/lib/config";
import { ApiError } from "@/lib/api/types";
import { mailCategory, type Email } from "@/lib/schemas";
import { createAiProvider, type AiMessage, type AiProvider } from "@/lib/server/ai/provider";
import { readAiBlock } from "@/lib/server/secrets";

/**
 * AI-функции писем (этап 21, решение пользователя — все три): саммари треда, классификация
 * (спам / продажи / поддержка / другое), черновик ответа в заданном тоне. Провайдер — адаптер
 * этапа 16 (блок ai в secrets.json); провайдер не настроен — честный scripted-fallback с
 * пометкой источника «scripted» (маркер «демо», не убирается). Сбой провайдера —
 * ApiError("unavailable"), ответ не выдумывается.
 */

export type MailAiAction = "summary" | "classify" | "draft";
export type MailAiTone = "деловой" | "дружелюбный" | "короткий";

export interface MailAiResult {
  action: MailAiAction;
  /** Саммари/классификация/черновик. */
  text: string;
  /** "llm" — настоящий провайдер, "scripted" — демо-ответ по правилам (не LLM). */
  source: "llm" | "scripted";
  note: string;
}

const BODY_LIMIT = 4000;

function letterContext(email: Pick<Email, "from" | "subject" | "body" | "date">): string {
  const date = new Date(email.date).toLocaleString("ru-RU");
  const body = email.body?.trim() || "(тело письма не распознано)";
  return `Письмо от ${email.from}, ${date}. Тема: ${email.subject ?? "(без темы)"}.\nТекст:\n${body.slice(0, BODY_LIMIT)}`;
}

/** Скриптовый fallback классификации по ключевым словам (без провайдера; честная пометка). */
export function scriptedCategory(email: Pick<Email, "from" | "subject" | "body">): Email["category"] {
  const all = `${email.subject ?? ""} ${email.body ?? ""}`.toLowerCase();
  const from = email.from.toLowerCase();
  if (/отписать|unsubscribe|рассылк|промо|скидк|акци|выигрыш|лотере|bitcoin|крипто/.test(all)) return "спам";
  if (/прайс|цен|стоимост|тариф|заказ|купить|счет|счёт|коммерческ/.test(all) && !/noreply|no-reply|не отвечайте/.test(from)) return "продажи";
  if (/проблем|ошибк|не работает|сбой|поддержк|помощь|вопрос|баг/.test(all)) return "поддержка";
  return "другое";
}

function systemPrompt(action: MailAiAction, tone: MailAiTone | null): string {
  const base = `Ты — ассистент отдела продаж ${APP_NAME}. Пиши по-русски. Не выдумывай фактов: чего нет в письме — не приписывай.`;
  if (action === "summary") return `${base} Сделай краткое саммари письма: о чём оно, что требуется от получателя (2–4 предложения).`;
  if (action === "classify") return `${base} Классифицируй письмо одним словом — ровно одна из категорий: спам, продажи, поддержка, другое. Ответь только словом категории.`;
  return `${base} Напиши черновик ответа на письмо в тоне: ${tone ?? "деловой"}. Без приветственных шаблонов вроде «Добрый день!» не обходись, но тело письма — по существу и не длиннее 8–10 предложений.`;
}

/** Демо-ответы scripted-fallback: саммари — первые предложения, черновик — шаблон с пометкой. */
function scriptedResult(action: MailAiAction, email: Email, tone: MailAiTone | null): MailAiResult {
  if (action === "classify") {
    const category = scriptedCategory(email) ?? "другое";
    return { action, text: category, source: "scripted", note: "демо-классификация по ключевым словам, не LLM" };
  }
  if (action === "summary") {
    const sentences = (email.body ?? "").split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(" ");
    const text = sentences.trim() ? `Письмо от ${email.from}: ${sentences.trim()}` : "Тело письма не распознано — саммари недоступно без провайдера.";
    return { action, text, source: "scripted", note: "демо-саммари по сценарию, не LLM" };
  }
  const category = scriptedCategory(email);
  const opener = category === "поддержка" ? "Спасибо за обращение — проверяем описанную проблему и вернёмся с решением." : category === "продажи" ? "Спасибо за интерес к нашим услугам — уточните, пожалуйста, объём и сроки, подготовим предложение." : "Спасибо за письмо.";
  return { action, text: `${opener}\n\n(демо-черновик по сценарию, не LLM — подключите блок ai в secrets.json для полной генерации)`, source: "scripted", note: "демо-черновик по сценарию, не LLM" };
}

/** Вызов AI-функции письма; deps.providerFactory инъектируется в unit-тестах (без сети и затрат). */
export async function mailAi(action: MailAiAction, email: Email, tone: MailAiTone | null, deps: { providerFactory?: (config: import("@/lib/integrations/types").AiBlock) => AiProvider } = {}): Promise<MailAiResult> {
  const config = readAiBlock();
  if (!config) return scriptedResult(action, email, tone);

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt(action, tone) },
    { role: "user", content: letterContext(email) }
  ];
  const provider = (deps.providerFactory ?? createAiProvider)(config);
  let text: string;
  try {
    text = await provider.complete(messages);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("unavailable", "Провайдер LLM недоступен — попробуйте позже или проверьте блок ai в secrets.json");
  }
  if (action === "classify") {
    const normalized = text.trim().toLowerCase().replace(/[.»"]+/g, "");
    const matched = (mailCategory.options as readonly string[]).find((c) => normalized.includes(c));
    return { action, text: matched ?? "другое", source: "llm", note: provider.model ? `модель: ${provider.model}` : "ответ LLM" };
  }
  return { action, text: text.trim(), source: "llm", note: provider.model ? `модель: ${provider.model}` : "ответ LLM" };
}
