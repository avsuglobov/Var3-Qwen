"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, FileText, Paperclip, Send, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelGlyph } from "@/components/agents/channel-icon";
import { useUpdateConversation } from "@/lib/api/hooks";
import { ACTOR_META, MODE_META, addMessagePatch, fmtBytes, nowHM } from "@/lib/selectors/dialogs";
import { MAX_ATTACHMENT_BYTES, MAX_MESSAGE_ATTACHMENTS, type Attachment, type Channel, type Conversation } from "@/lib/schemas";
import type { ChatMessage } from "@/lib/selectors/dialogs";
import { cn } from "@/lib/utils";

/** Содержимое файла в base64 (без префикса DataURL): снимок хранит вложения целиком (этап 6). */
async function readAsBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

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
  /** Выбранные вложения (этап 6): валидируются до отправки, уходят вместе с сообщением. */
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  /** Выбор файлов: не больше трёх на сообщение, каждый до 1 МБ; при нарушении — ошибка, партия целиком отклоняется. */
  const pickFiles = async (list: FileList | null): Promise<void> => {
    if (!list || list.length === 0) return;
    setFileError(null);
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_MESSAGE_ATTACHMENTS) {
      setFileError(`Не больше ${MAX_MESSAGE_ATTACHMENTS} файлов на сообщение`);
      return;
    }
    if (incoming.some((f) => f.size > MAX_ATTACHMENT_BYTES)) {
      setFileError("Файл больше 1 МБ — вложение не принято");
      return;
    }
    const accepted: Attachment[] = [];
    for (const f of incoming) {
      accepted.push({ name: f.name, size: f.size, mime: f.type || undefined, data: await readAsBase64(f) });
    }
    setFiles((cur) => [...cur, ...accepted]);
  };

  const send = () => {
    const text = value.trim();
    if (!text && files.length === 0) return;
    setError(null);
    const msg: ChatMessage = { from: "human", text, time: nowHM(), ...(files.length ? { attachments: files } : {}) };
    update.mutate(
      { id: conv.id, patch: addMessagePatch(conv, msg, "reading") },
      { onError: fail }
    );
    setValue("");
    setFiles([]);
    setFileError(null);
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
              {m.text ? <div className="whitespace-pre-wrap break-words">{m.text}</div> : null}
              {m.attachments?.length ? (
                <div className={cn("mt-1.5 flex flex-col items-start gap-1", m.from === "human" && "items-end")}>
                  {m.attachments.map((a, k) =>
                    a.data ? (
                      <a
                        key={k}
                        href={`data:${a.mime || "application/octet-stream"};base64,${a.data}`}
                        download={a.name}
                        title="Скачать вложение"
                        className={cn(
                          "inline-flex max-w-[240px] items-center gap-1.5 rounded-chip border px-2 py-1 text-xs underline-offset-2 hover:underline",
                          m.from === "human" ? "border-primary-foreground/40" : "border-border"
                        )}
                        data-testid="chat-attachment"
                        data-name={a.name}
                      >
                        <FileText className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{a.name}</span>
                        <span className="shrink-0 opacity-80"> · {fmtBytes(a.size)}</span>
                      </a>
                    ) : (
                      <span
                        key={k}
                        title="Содержимое файла не сохранено"
                        className={cn(
                          "inline-flex max-w-[240px] items-center gap-1.5 rounded-chip border px-2 py-1 text-xs",
                          m.from === "human" ? "border-primary-foreground/40" : "border-border"
                        )}
                        data-testid="chat-attachment"
                        data-name={a.name}
                      >
                        <FileText className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{a.name}</span>
                        <span className="shrink-0 opacity-80"> · {fmtBytes(a.size)}</span>
                      </span>
                    )
                  )}
                </div>
              ) : null}
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

      {/* Выбранные вложения: чипы с именем, размером и кнопкой «убрать» */}
      {files.length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2" data-testid="chat-files">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex max-w-[260px] items-center gap-1.5 rounded-chip border border-border bg-muted px-2 py-1 text-xs"
              data-testid="chat-file-chip"
              data-name={f.name}
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted-foreground">{fmtBytes(f.size)}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Убрать файл ${f.name}`}
                data-testid="chat-file-remove"
                onClick={() => { setFiles((cur) => cur.filter((_, k) => k !== i)); setFileError(null); }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {fileError ? (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-critical" data-testid="chat-file-error" aria-live="polite">{fileError}</p>
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Прикрепить файл"
          data-testid="chat-file-input"
          onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }}
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={locked}
          title="Прикрепить файл (до 1 МБ, до 3 файлов на сообщение)"
          aria-label="Прикрепить файл"
          data-testid="chat-attach"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip aria-hidden />
        </Button>
        <Button variant="default" size="icon" data-testid="chat-send" aria-label="Отправить сообщение" disabled={locked} onClick={send}>
          <Send aria-hidden />
        </Button>
      </div>
    </div>
  );
}
