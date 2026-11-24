"use client";

import { BookOpen, Mail, MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { scriptedReply } from "@/lib/scripted-reply";
import { HELP_INITIAL, HELP_WHO } from "@/lib/selectors/system";
import { cn } from "@/lib/utils";

interface ChatMsg {
  from: "ai" | "human";
  text: string;
  meta: string;
}

/**
 * Раздел «Помощь» (этап 3, финальная группа) — поведение help() прототипа: карточка
 * «Поддержка» (чипы каналов связи) и «Чат обучения» с ответом по сценарию
 * (scriptedReply, как bindChat прототипа: «Помощь печатает…» и ответ через паузу).
 * Email честно помечен «Подключается на бэкенде» — адрес не выдумывается.
 */
export function HelpView() {
  const [messages, setMessages] = useState<ChatMsg[]>([{ from: "ai", text: HELP_INITIAL, meta: HELP_WHO }]);
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Лента прокручена к последнему сообщению (как chat-scroll прототипа)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const send = (): void => {
    const text = value.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { from: "human", text, meta: "Вы" }]);
    setValue("");
    setTyping(true);
    timerRef.current = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { from: "ai", text: scriptedReply(text), meta: HELP_WHO }]);
    }, 900);
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <h1 className="text-[28px] leading-tight">Помощь</h1>
        <p className="mt-1 text-sm text-muted-foreground">Поддержка и чат обучения</p>
      </header>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="section-label mb-3">Поддержка</h2>
            <div className="space-y-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-card px-2.5 py-1 text-xs" data-testid="help-support-chat">
                  <MessageCircle className="size-3.5" aria-hidden />
                  Чат с поддержкой
                </span>
                <Badge variant="outline" className="text-[11px]">
                  Демо
                </Badge>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-card px-2.5 py-1 text-xs" data-testid="help-support-email">
                  <Mail className="size-3.5" aria-hidden />
                  Email
                </span>
                <span className="text-xs text-muted-foreground">Подключается на бэкенде</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-card px-2.5 py-1 text-xs" data-testid="help-support-articles">
                  <BookOpen className="size-3.5" aria-hidden />
                  База статей
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="section-label mb-3">Чат обучения</h2>
            <div className="flex flex-col overflow-hidden rounded-sm border border-border">
              <div ref={listRef} className="flex h-60 flex-col gap-2.5 overflow-y-auto p-3" data-testid="help-chat" aria-live="polite">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-chip px-3 py-2 text-[13px]",
                      m.from === "ai" ? "self-start border border-border bg-card" : "self-end bg-primary text-primary-foreground"
                    )}
                    data-testid={m.from === "ai" ? "help-msg-ai" : "help-msg-human"}
                  >
                    {m.text}
                    <div className={cn("mt-0.5 text-[10.5px]", m.from === "ai" ? "text-muted-foreground" : "text-primary-foreground/80")}>
                      {m.meta}
                    </div>
                  </div>
                ))}
                {typing ? (
                  <div className="self-start px-3 py-2 text-[12px] text-muted-foreground" data-testid="help-typing" role="status">
                    {HELP_WHO} печатает…
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-2.5">
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                  placeholder="Ваш вопрос…"
                  aria-label="Сообщение в чат обучения"
                  className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                  data-testid="help-input"
                />
                <Button size="sm" onClick={send} aria-label="Отправить" data-testid="help-send">
                  <Send className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
