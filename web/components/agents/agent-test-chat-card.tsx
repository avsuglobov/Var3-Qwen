"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scriptedReply } from "@/lib/scripted-reply";
import { cn } from "@/lib/utils";

interface ChatMessage {
  from: "client" | "agent";
  text: string;
}

const GREETING = "Готов к проверке. Напишите реплику клиента — попробуйте слова «тариф», «возврат», «поставщик».";

/** Вкладка «Тест»: демо-чат с сотрудником. Ответы по ключевым словам (перенесено из прототипа), на экране — честная пометка «не LLM». */
export function AgentTestChatCard() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ from: "agent", text: GREETING }]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { from: "client", text }, { from: "agent", text: scriptedReply(text) }]);
    setInput("");
  };

  // Последнее сообщение всегда видно
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0 text-critical" aria-hidden />
        Демо-сценарий: ответы подбираются по ключевым словам, это не LLM.
      </p>
      <ul ref={listRef} className="flex max-h-72 min-w-0 flex-col gap-2 overflow-y-auto rounded-card border border-border p-3" data-testid="agent-test-chat" aria-label="Тест-чат с сотрудником">
        {messages.map((m, i) => (
          <li
            key={i}
            className={cn(
              "max-w-[85%] rounded-card px-3 py-2 text-[13px]",
              m.from === "client" ? "self-end bg-accent-soft" : "self-start bg-muted"
            )}
          >
            <span className="section-label mb-0.5 block">{m.from === "client" ? "Клиент" : "Сотрудник"}</span>
            {m.text}
          </li>
        ))}
      </ul>
      <form
        className="flex min-w-0 gap-2"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Сообщение от клиента…"
          aria-label="Сообщение от клиента"
          data-testid="test-input"
          className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
        <Button type="submit" variant="default" size="sm">
          <Send aria-hidden />
          Отправить
        </Button>
      </form>
    </div>
  );
}
