"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useEmails, useLeads, useMailAi, useMailPoll, useMailReply, useUpdateEmail, type MailAiAction } from "@/lib/api/hooks";
import { MAIL_STATUSES, type Email } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Вкладка «Почта» раздела «Диалоги» (этап 21): входящие письма почтовых аккаунтов — список,
 * карточка с телом и вложениями, статусы «Новое / В работе / Обработано», привязка к лиду,
 * AI-функции (саммари, классификация, черновик ответа) и отправка ответа через SMTP.
 * Источники AI-ответов помечены честно: «демо…, не LLM» или модель провайдера.
 */

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

const STATUS_STYLE: Record<string, string> = {
  "Новое": "bg-accent-soft text-accent",
  "В работе": "bg-muted",
  "Обработано": "bg-muted text-muted-foreground"
};

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MailView() {
  const emails = useEmails();
  const leads = useLeads();
  const updateEmail = useUpdateEmail();
  const mailAi = useMailAi();
  const mailReply = useMailReply();
  const mailPoll = useMailPoll();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [tone, setTone] = useState("деловой");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const list: Email[] = (emails.data ?? []).slice().sort((a, b) => b.date - a.date);
  const selected = list.find((e) => e.id === selectedId) ?? null;

  const loading = emails.isPending || leads.isPending;

  if (loading) {
    return (
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]" aria-busy="true" aria-label="Загрузка писем">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (emails.isError) {
    return <ErrorState message={emails.error.message} onRetry={() => void emails.refetch()} />;
  }

  const runAi = (action: MailAiAction) => {
    if (!selected) return;
    setAiNote(null);
    mailAi.mutate(
      { id: selected.id, action, ...(action === "draft" ? { tone } : {}) },
      {
        onSuccess: (res) => {
          if (action === "draft") setReply(res.text);
          setAiNote(res.note);
        },
        onError: (e) => setAiNote(e.message)
      }
    );
  };

  const sendReply = () => {
    if (!selected || !reply.trim()) return;
    mailReply.mutate(
      { id: selected.id, text: reply.trim() },
      {
        onSuccess: (res) => {
          setReply("");
          setFeedback(`Ответ отправлен на ${res.to}`);
        },
        onError: (e) => setFeedback(e.message)
      }
    );
  };

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm text-muted-foreground">Писем: {list.length}</h2>
          <Button
            variant="secondary"
            data-testid="mail-poll-now"
            disabled={mailPoll.isPending}
            onClick={() =>
              mailPoll.mutate(undefined, {
                onSuccess: (res) => {
                  const err = Object.values(res.errors)[0];
                  setFeedback(err ? `Проверка почты: ${err}` : `Проверка почты завершена — новых писем ${res.fetched}, лидов создано ${res.leadsCreated}`);
                },
                onError: (e) => setFeedback(e.message)
              })
            }
          >
            {mailPoll.isPending ? "Проверяю…" : "Проверить почту сейчас"}
          </Button>
        </div>
        {list.length === 0 ? (
          <Card data-testid="mail-empty">
            <EmptyState title="Писем нет" hint="Настройте учётную запись в Настройках → Почта — входящие письма появятся здесь." />
          </Card>
        ) : (
          <ul className="space-y-2" data-testid="mail-list">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  data-testid="mail-item"
                  onClick={() => {
                    setSelectedId(m.id);
                    setReply("");
                    setAiNote(null);
                    setFeedback(null);
                  }}
                  className={cn(
                    "w-full rounded-sm border border-border bg-card p-3 text-left transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-ring",
                    selected?.id === m.id && "border-accent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{m.from}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_STYLE[m.status] ?? "bg-muted")}>{m.status}</span>
                  </div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">{m.subject ?? "(без темы)"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{timeLabel(m.date)} · {m.folder}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        <Card data-testid="mail-card">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base">{selected.subject ?? "(без темы)"}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {selected.from} → {selected.to} · {timeLabel(selected.date)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="mail-status">Статус письма</label>
                <select
                  id="mail-status"
                  data-testid="mail-status"
                  className={FIELD}
                  value={selected.status}
                  onChange={(e) => updateEmail.mutate({ id: selected.id, patch: { status: e.target.value } })}
                >
                  {MAIL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {selected.category ? (
              <div className="flex items-center gap-2" data-testid="mail-category">
                <Badge>Категория: {selected.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  {selected.categorySource === "llm" ? "классификация LLM" : selected.categorySource === "scripted" ? "демо-классификация по ключевым словам, не LLM" : ""}
                </span>
              </div>
            ) : null}

            <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-card p-3 text-sm" data-testid="mail-body">
              {selected.body ?? "(тело письма не распознано — вложения и HTML-письма показываются частично)"}
            </div>

            {selected.attachments.length > 0 ? (
              <ul className="space-y-1 text-sm" data-testid="mail-attachments">
                {selected.attachments.map((a, i) => (
                  <li key={`${a.name}-${i}`}>
                    Вложение: {a.name} ({Math.max(1, Math.round(a.size / 1024))} КБ{a.data ? "" : " — крупнее лимита, содержимое не сохранено"})
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground" htmlFor="mail-lead">Привязка к лиду</label>
              <select
                id="mail-lead"
                data-testid="mail-lead"
                className={FIELD}
                value={selected.leadId ?? ""}
                onChange={(e) => updateEmail.mutate({ id: selected.id, patch: { leadId: e.target.value || null } })}
              >
                <option value="">— без лида —</option>
                {(leads.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" data-testid="mail-ai-summary" onClick={() => runAi("summary")} disabled={mailAi.isPending}>Саммари</Button>
              <Button variant="secondary" data-testid="mail-ai-classify" onClick={() => runAi("classify")} disabled={mailAi.isPending}>Классифицировать</Button>
              <label className="sr-only" htmlFor="mail-tone">Тон ответа</label>
              <select id="mail-tone" className={cn(FIELD, "w-40")} value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="деловой">Деловой</option>
                <option value="дружелюбный">Дружелюбный</option>
                <option value="короткий">Короткий</option>
              </select>
              <Button variant="secondary" data-testid="mail-ai-draft" onClick={() => runAi("draft")} disabled={mailAi.isPending}>Черновик ответа</Button>
            </div>
            {aiNote ? <p className="text-xs text-muted-foreground" data-testid="mail-ai-note">{aiNote}</p> : null}

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground" htmlFor="mail-reply">Ответ</label>
              <textarea
                id="mail-reply"
                data-testid="mail-reply"
                className="min-h-28 w-full rounded-sm border border-input bg-card p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                placeholder="Текст ответа (можно сгенерировать черновик)"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button data-testid="mail-send" onClick={sendReply} disabled={mailReply.isPending || !reply.trim()}>
                  {mailReply.isPending ? "Отправляю…" : "Ответить"}
                </Button>
                {feedback ? <span className="text-xs text-muted-foreground" data-testid="mail-feedback">{feedback}</span> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="mail-card-empty">
          <EmptyState title="Письмо не выбрано" hint="Выберите письмо слева — здесь появятся текст, вложения и ответ." />
        </Card>
      )}
    </div>
  );
}
