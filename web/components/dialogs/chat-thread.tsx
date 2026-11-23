"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, Paperclip, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelGlyph } from "@/components/agents/channel-icon";
import { useUpdateConversation } from "@/lib/api/hooks";
import { ACTOR_META, MODE_META, addMessagePatch, nowHM } from "@/lib/selectors/dialogs";
import type { Channel, Conversation } from "@/lib/schemas";
import type { ChatMessage } from "@/lib/selectors/dialogs";
import { cn } from "@/lib/utils";

/** Оформление сообщения по автору (как msg-client / msg-ai / msg-human в прототипе). */
const MSG_CLASSES: Record<ChatMessage["from"], string> = {
  client: "bg-muted text-foreground",
  ai: "border border-border bg-card text-foreground",
  human: "bg-primary text-primary-foreground"
};

/**
 * Переписка: шапка с чипом режима, лента сообщений, композер. Поведение прототипа:
 * в режиме «ИИ» поле отключено («Передать менеджеру»), ответ менеджера отправляется
 * и переводит диалог в «ИИ в режиме чтения», лента прокручена к последнему сообщению.
 */
export function ChatThread({ conv, channels, agentName, onBack, className }: {
  conv: Conversation;
  channels: readonly Channel[];
  agentName: string;
  onBack: () => void;
  className?: string;
}) {
  const update = useUpdateConversation();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const channel = channels.find((ch) => ch.id === conv.channel);
  const mode = MODE_META[conv.mode];
  const locked = conv.mode === "ai";

  // Лента всегда прокручена к последнему сообщению (data-autoscroll в прототипе)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv.id, conv.messages.length]);

  const fail = () => setError("Не удалось отправить. Данные не сохранились — попробуйте ещё раз.");

  const send = () => {
    const text = value.trim();
    if (!text) return;
    setError(null);
    update.mutate(
      { id: conv.id, patch: addMessagePatch(conv, { from: "human", text, time: nowHM() }, "reading") },
      { onError: fail }
    );
    setValue("");
  };

  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-sm border border-border bg-card", className)} data-testid="chat-thread" data-conv-id={conv.id}>
      {/* Шапка: назад (мобильный), монограмма сотрудника, контакт, канал · сотрудник, чип режима */}
      <div className="flex min-w-0 items-center gap-3 border-b border-border px-3 py-2.5">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="К списку диалогов" title="К списку диалогов" onClick={onBack} data-testid="chat-back">
          <ChevronLeft aria-hidden />
        </Button>
        <span className="font-data flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-[11px] font-semibold text-primary-foreground" aria-hidden>
          {conv.agentId ? (agentName || "?").slice(0, 1).toUpperCase() : "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{conv.contactName}</div>
          <div className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
            {channel ? <ChannelGlyph name={channel.icon} /> : null}
            <span className="truncate">{channel?.name ?? conv.channel} · {agentName}</span>
          </div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-medium", mode.chipClass)} data-testid="chat-mode">
          {mode.dotClass ? <span className={cn("size-2 shrink-0 rounded-full", mode.dotClass)} aria-hidden /> : null}
          {mode.label}
        </span>
      </div>

      {/* Лента сообщений */}
      <div ref={listRef} className="h-[360px] min-w-0 overflow-y-auto px-4 py-3" data-testid="chat-messages">
        <div className="flex flex-col gap-2.5">
          {conv.messages.map((m, i) => (
            <div
              key={i}
              data-testid="chat-msg"
              data-from={m.from}
              className={cn("max-w-[85%] self-start rounded-sm px-3 py-2 text-sm", MSG_CLASSES[m.from], m.from === "human" && "self-end text-right")}
            >
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              <div className={cn("mt-1 text-[11px]", m.from === "human" ? "text-primary-foreground/90" : "text-muted-foreground-strong")}>
                {ACTOR_META[m.from]}{m.time ? ` · ${m.time}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <p role="status" className="border-t border-border px-4 py-2 text-xs text-critical" aria-live="polite">{error}</p>
      ) : null}

      {/* Композер: в режиме «ИИ» поле отключено, менеджер может передать диалог себе */}
      <div className="flex min-w-0 items-center gap-2 border-t border-border p-3">
        {locked ? (
          <Button variant="secondary" size="sm" data-testid="chat-takeover" title="Передать менеджеру" onClick={() => update.mutate({ id: conv.id, patch: { mode: "human" } }, { onError: fail })}>
            <Users aria-hidden />
            Передать менеджеру
          </Button>
        ) : (
          <Button variant="secondary" size="sm" data-testid="chat-giveback" title="Вернуть диалог ИИ" onClick={() => update.mutate({ id: conv.id, patch: { mode: "ai" } }, { onError: fail })}>
            <Bot aria-hidden />
            Вернуть ИИ
          </Button>
        )}
        <input
          data-testid="chat-input"
          className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          placeholder={locked ? "ИИ ведёт диалог…" : "Ответ менеджера…"}
          disabled={locked}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
        />
        <Button variant="ghost" size="icon" disabled title="Скоро — вложения в диалоге" aria-label="Прикрепить файл">
          <Paperclip aria-hidden />
        </Button>
        <Button variant="default" size="icon" data-testid="chat-send" aria-label="Отправить сообщение" disabled={locked} onClick={send}>
          <Send aria-hidden />
        </Button>
      </div>
    </div>
  );
}
