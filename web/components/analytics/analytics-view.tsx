"use client";

import { RefreshCw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { scriptedReply } from "@/lib/scripted-reply";
import { DIALOG_REVIEW, analyticsKpis, reviewIsOk } from "@/lib/selectors/analytics";
import { nowHM } from "@/lib/selectors/dialogs";
import { useConversations, useLeads } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

interface ChatMsg {
  from: "ai" | "human";
  text: string;
  meta: string;
}

/**
 * Раздел «Аналитика» (этап 3, группа 7) — поведение analytics() прототипа: таблица разбора
 * диалогов менеджеров (ОК/Нарушение, демо-выборка — помечена «Демо»), чат «Вопрос
 * руководителю» с ответом по сценарию (scriptedReply, как bindChat прототипа).
 * Этап 7: KPI пересчитываются из данных приложения по правилам согласования
 * (analyticsKpis), кнопка «Пересчитать» обновляет данные и показывает время пересчёта.
 */
export function AnalyticsView() {
  const leadsQ = useLeads();
  const convsQ = useConversations();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { from: "ai", text: "Готов разобрать любой диалог или посчитать метрику качества (демо).", meta: "AI-РОП" }
  ]);
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Лента прокручена к последнему сообщению (как chat-scroll прототипа)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const loading = leadsQ.isPending || convsQ.isPending;
  const dataError = leadsQ.isError ? leadsQ.error : convsQ.isError ? convsQ.error : null;

  /** «Пересчитать»: свежие данные из хранилища + время пересчёта и объём выборки. */
  const recalc = async (): Promise<void> => {
    setFeedback(null);
    const [l, c] = await Promise.all([leadsQ.refetch(), convsQ.refetch()]);
    setFeedback(`Пересчитано в ${nowHM()} — лидов: ${l.data?.length ?? 0}, диалогов: ${c.data?.length ?? 0}`);
  };

  const send = (): void => {
    const text = value.trim();
    if (!text) return;
    setError(null);
    setMessages((prev) => [...prev, { from: "human", text, meta: "Вы" }]);
    setValue("");
    setTyping(true);
    timerRef.current = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { from: "ai", text: scriptedReply(text), meta: "AI-РОП" }]);
    }, 900);
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка аналитики">
        <Header onRecalc={() => undefined} />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }
  if (dataError) {
    return (
      <div className="min-w-0 space-y-6">
        <Header onRecalc={() => undefined} />
        <ErrorState message={dataError.message} onRetry={() => { void leadsQ.refetch(); void convsQ.refetch(); }} />
      </div>
    );
  }

  const leads = leadsQ.data ?? [];
  const kpis = analyticsKpis(DIALOG_REVIEW, leads);

  return (
    <div className="min-w-0 space-y-6">
      <Header onRecalc={() => void recalc()} />

      {feedback ? (
        <p role="status" aria-live="polite" className="text-[13px]" data-testid="analytics-feedback">
          {feedback}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Качество цепочки" hint="Доля диалогов разбора без нарушений" testId="analytics-kpi-quality" value={kpis.quality} />
        <Kpi label="Нарушений скрипта" hint="Строки разбора ниже с нарушением (демо-выборка)" testId="analytics-kpi-violations" value={String(kpis.violations)} />
        <Kpi label="Эскалаций к человеку" hint="Лиды с пометкой «Эскалация» (правило согласования)" testId="analytics-kpi-escalations" value={String(kpis.escalations)} />
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent>
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h2 className="section-label">Разбор диалогов менеджеров</h2>
              <Badge variant="outline" className="text-[11px]">
                Демо
              </Badge>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-sm" data-testid="analytics-review">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Диалог</th>
                    <th className="py-2 pr-3 font-medium">Менеджер</th>
                    <th className="py-2 font-medium">Нарушение</th>
                  </tr>
                </thead>
                <tbody>
                  {DIALOG_REVIEW.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-b-0" data-testid="analytics-row" data-conv={r.id}>
                      <td className="py-2.5 pr-3 font-data text-xs">{r.id}</td>
                      <td className="py-2.5 pr-3">{r.manager}</td>
                      <td className="py-2.5">
                        {reviewIsOk(r) ? (
                          <Badge variant="outline" className="text-[11px]">
                            <span className="size-1.5 rounded-full bg-status" aria-hidden />
                            ОК
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[11px]">
                              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                              Нарушение
                            </Badge>
                            <span className="text-xs">{r.violation}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="section-label mb-3">Вопрос руководителю</h2>
            <div className="flex flex-col overflow-hidden rounded-sm border border-border">
              <div ref={listRef} className="flex h-64 flex-col gap-2.5 overflow-y-auto p-3" data-testid="rop-chat" aria-live="polite">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-chip px-3 py-2 text-[13px]",
                      m.from === "ai" ? "self-start border border-border bg-card" : "self-end bg-primary text-primary-foreground"
                    )}
                    data-testid={m.from === "ai" ? "rop-msg-ai" : "rop-msg-human"}
                  >
                    {m.text}
                    <div className={cn("mt-0.5 text-[10.5px]", m.from === "ai" ? "text-muted-foreground" : "text-primary-foreground/80")}>
                      {m.meta}
                    </div>
                  </div>
                ))}
                {typing ? (
                  <div className="self-start px-3 py-2 text-[12px] text-muted-foreground" data-testid="rop-typing" role="status">
                    AI-РОП печатает…
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-2.5">
                <input
                  value={value}
                  onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                  placeholder="Спросите AI-РОП…"
                  aria-label="Сообщение AI-РОП"
                  className="h-9 min-w-0 flex-1 rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                  data-testid="rop-input"
                />
                <Button size="sm" onClick={send} aria-label="Отправить" data-testid="rop-send">
                  <Send className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            {error ? (
              <p role="alert" aria-live="polite" className="mt-2 text-[13px] text-destructive" data-testid="rop-error">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, hint, testId, value }: { label: string; hint: string; testId: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <div className="section-label">{label}</div>
        <div className="mt-1.5 font-data text-2xl leading-tight" data-testid={testId}>
          {value}
        </div>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Шапка с кнопкой «Пересчитать» (в прототипе «скоро», с этапа 7 — настоящее действие). */
function Header({ onRecalc }: { onRecalc: () => void }) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight">Аналитика</h1>
        <p className="mt-1 text-sm text-muted-foreground">Разбор диалогов менеджеров и оценка качества цепочки</p>
      </div>
      <Button onClick={onRecalc} data-testid="analytics-recalc">
        <RefreshCw className="size-4" aria-hidden />
        Пересчитать
      </Button>
    </header>
  );
}
