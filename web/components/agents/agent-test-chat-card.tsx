"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAiStatus, requestAiReply, type AiStatus } from "@/lib/ai-client";
import { scriptedReply } from "@/lib/scripted-reply";
import { cn } from "@/lib/utils";

interface ChatMessage {
  from: "client" | "agent";
  text: string;
  /** Пометка источника (этап 16): «демо-ответ…» или «модель: …». */
  note?: string;
}

const GREETING = "Готов к проверке. Напишите реплику клиента — попробуйте слова «тариф», «возврат», «поставщик».";
const DEMO_NOTE = "демо-ответ по сценарию, не LLM";

/**
 * Вкладка «Тест»: чат с сотрудником. Сначала мгновенный ответ по ключевым словам
 * (scriptedReply, как в прототипе) с честной пометкой «не LLM»; если LLM-провайдер
 * настроен (блок ai в secrets.json), сервер заменяет его настоящим ответом модели.
 */
export function AgentTestChatCard({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ from: "agent", text: GREETING }]);
  const [input, setInput] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    fetchAiStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false, provider: null, model: null, apiKeyMask: null }));
  }, []);

  // Последнее сообщение всегда видно
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    // Мгновенный демо-ответ с честной пометкой; при настроенном провайдере он заменяется ответом LLM.
    setMessages((prev) => [...prev, { from: "client", text }, { from: "agent", text: scriptedReply(text), note: DEMO_NOTE }]);
    if (!aiStatus?.configured) return;
    requestAiReply({ scope: "test", agentId, message: text })
      .then((r) => {
        if (r.source !== "llm") return; // сервер подтвердил демо-режим — сценарий остаётся
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (copy[last]?.from === "agent") copy[last] = { ...copy[last], text: r.text, note: r.note };
          return copy;
        });
      })
      .catch((e: Error) => {
        // Провайдер настроен, но вызов не удался: остаётся демо-ответ + честная причина.
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (copy[last]?.from === "agent") copy[last] = { ...copy[last], note: `${DEMO_NOTE} (${e.message})` };
          return copy;
        });
      });
  };

  return (
    <div className="space-y-3">
      {aiStatus?.configured ? (
        <p className="text-xs text-muted-foreground" data-testid="test-chat-ai-note">
          Ответы через LLM ({aiStatus.model ? `модель ${aiStatus.model}` : aiStatus.provider}); ключ провайдера — блок ai в secrets.json, в браузере виден только маской.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="test-chat-ai-note">
          <AlertTriangle className="size-3.5 shrink-0 text-critical" aria-hidden />
          Демо-сценарий: ответы подбираются по ключевым словам, это не LLM.
        </p>
      )}
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
            {m.note ? (
              <span className="mt-1 block text-[10.5px] text-muted-foreground" data-testid="test-chat-note">
                {m.note}
              </span>
            ) : null}
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
