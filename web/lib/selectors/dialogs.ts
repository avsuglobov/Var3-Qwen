import type { Conversation } from "@/lib/schemas";
import type { ConversationMode } from "@/lib/types";

/**
 * Чистые функции раздела «Диалоги» (этап 3, группа 2). Поведение перенесено из прототипа
 * (`../download/sections.js`, `db.js`): режимы диалога, подписи авторов, патч отправки сообщения.
 */

export type ChatMessage = Conversation["messages"][number];

/**
 * Режим диалога. Информация не передаётся только цветом: чип всегда с текстом,
 * точка есть у «ИИ отвечает» и «ИИ в режиме чтения», у «Менеджер отвечает» — заливка.
 */
export const MODE_META: Record<ConversationMode, { label: string; dotClass: string | null; chipClass: string }> = {
  ai: { label: "ИИ отвечает", dotClass: "bg-primary", chipClass: "border border-border bg-card text-foreground" },
  human: { label: "Менеджер отвечает", dotClass: null, chipClass: "bg-primary text-primary-foreground" },
  reading: { label: "ИИ в режиме чтения", dotClass: "bg-muted-foreground", chipClass: "border border-border bg-card text-muted-foreground" }
};

/** Подпись автора сообщения (как .meta в прототипе): Клиент / ИИ / Менеджер. */
export const ACTOR_META: Record<ChatMessage["from"], string> = { client: "Клиент", ai: "ИИ", human: "Менеджер" };

/** Статус ведения диалога в панели контекста: как в прототипе — «С ИИ» только в режиме ai. */
export function contextStatus(mode: ConversationMode): string {
  return mode === "ai" ? "С ИИ" : "С менеджером";
}

/**
 * Патч диалога при отправке сообщения (поведение db.addMessage прототипа): сообщение дописывается
 * в конец, обновляются превью и время; переданный режим применяется, только если он передан
 * (компонент сам решает: ответ менеджера уходит в «ИИ в режиме чтения», как pushHumanMsg).
 * Вход не мутируется.
 */
export function addMessagePatch(conv: Conversation, msg: ChatMessage, mode?: ConversationMode): Partial<Conversation> {
  return {
    messages: [...conv.messages, msg],
    lastPreview: msg.text,
    lastTime: msg.time ?? conv.lastTime,
    ...(mode ? { mode } : {})
  };
}

/** Время сообщения — UTC ЧЧ:ММ (как db.nowHM прототипа и часы в верхней панели). */
export function nowHM(): string {
  const d = new Date();
  const pad = (x: number): string => String(x).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
