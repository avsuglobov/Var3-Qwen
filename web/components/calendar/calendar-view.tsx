"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Download, GraduationCap, Phone, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useCalendarEvents } from "@/lib/api/hooks";
import { APP_NAME } from "@/lib/config";
import {
  ICS_FILENAME,
  MONTHS,
  WD,
  buildICS,
  calendarGrid,
  eventDotTone,
  upcomingEvents,
  type EventType
} from "@/lib/selectors/calendar";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/schemas";

const EV_ICON: Record<EventType, typeof Phone> = {
  call: Phone,
  deadline: AlertTriangle,
  meeting: Users,
  training: GraduationCap
};

const EV_TEXT_COLOR: Record<EventType, string> = {
  call: "text-accent",
  deadline: "text-critical dark:text-foreground",
  meeting: "text-status",
  training: "text-muted-foreground"
};

/**
 * Раздел «Календарь» (этап 3, группа 6): сетка месяца с точками событий, навигация
 * «назад/вперёд/сегодня», экспорт .ics (RFC 5545, строгий разбор и пропуски битых событий)
 * и «Ближайшие события» — поведение calendar()/exportICS() прототипа.
 */
export function CalendarView() {
  const eventsQ = useCalendarEvents();
  const [monthOffset, setMonthOffset] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });
  const clearFeedback = (): void => setFeedback({ text: "", kind: "status" });

  const loading = eventsQ.isPending;
  const error = eventsQ.isError ? eventsQ.error : null;
  const events = eventsQ.data ?? [];

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const y = base.getFullYear();
  const m = base.getMonth();

  const exportICS = (): void => {
    clearFeedback();
    const r = buildICS(events);
    if (!r.count) {
      onFeedback("Нет событий с корректной датой для экспорта", "alert");
      return;
    }
    const blob = new Blob([r.text], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ICS_FILENAME;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    onFeedback("Экспортировано событий: " + r.count + (r.skipped.length ? ", пропущено (некорректная дата или данные): " + r.skipped.length : ""));
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-6">
        <Header y={y} m={m} offset={monthOffset} onOffset={() => undefined} onExport={() => undefined} />
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1.6fr_1fr]" aria-busy="true" aria-label="Загрузка календаря">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header y={y} m={m} offset={monthOffset} onOffset={() => undefined} onExport={() => undefined} />
        <ErrorState message={error.message} onRetry={() => void eventsQ.refetch()} />
      </div>
    );
  }

  const cells = calendarGrid(y, m, events);
  const upcoming = upcomingEvents(events);

  return (
    <div className="min-w-0 space-y-6">
      <Header y={y} m={m} offset={monthOffset} onOffset={setMonthOffset} onExport={exportICS} />

      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="calendar-feedback">
          {feedback.text}
        </p>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent>
            <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
              {WD.map((w) => (
                <div key={w} className="section-label px-1 py-1 text-center">
                  {w}
                </div>
              ))}
              {cells.map((c, i) =>
                c.day === null ? (
                  <div key={"d" + i} className="min-h-[64px] rounded-chip border border-transparent" />
                ) : (
                  <div
                    key={c.date}
                    className={cn(
                      "min-h-[64px] rounded-chip border p-1.5",
                      c.isToday ? "border-primary bg-accent-soft" : c.events.length ? "border-border bg-card" : "border-border/60 bg-card"
                    )}
                    data-testid="calendar-cell"
                    data-date={c.date}
                    aria-label={c.date + (c.events.length ? ", событий: " + c.events.length : "")}
                  >
                    <span className={cn("font-data text-xs", c.isToday && "font-semibold text-accent")}>{c.day}</span>
                    {c.events.length ? (
                      <span className="mt-1 flex flex-wrap gap-0.5" data-testid="calendar-dots">
                        {c.events.map((e) => (
                          <EventDot key={e.id} type={e.type} />
                        ))}
                      </span>
                    ) : null}
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <div className="section-label">Ближайшие события</div>
              <Badge variant="outline" className="text-[11px]">
                Демо
              </Badge>
            </div>
            <div className="space-y-2.5" data-testid="calendar-upcoming">
              {upcoming.length === 0 ? (
                <EmptyState title="Нет событий" hint="Запланируйте встречу или дедлайн." />
              ) : (
                upcoming.map((e) => (
                  <div key={e.id} className="flex min-w-0 items-start gap-2.5 border-b border-border pb-2.5 last:border-b-0 last:pb-0" data-testid="calendar-event" data-event={e.id}>
                    <EventIcon type={e.type} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium leading-tight">{e.title}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {e.date} · {e.time}
                        {e.duration ? " · " + e.duration : ""} · {e.assignee}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EventDot({ type }: { type: string | null | undefined }) {
  const tone = eventDotTone(type);
  return (
    <span
      className={cn("size-1.5 rounded-full", tone === "accent" ? "bg-accent" : tone === "critical" ? "bg-critical" : tone === "status" ? "bg-status" : "bg-muted-foreground")}
      aria-hidden
    />
  );
}

function EventIcon({ type }: { type: string | null | undefined }) {
  const et = (EVENT_TYPES_HAS(type) ? type : "training") as EventType;
  const Icon = EV_ICON[et];
  return (
    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-chip border border-border bg-muted">
      <Icon className={cn("size-3.5", EV_TEXT_COLOR[et])} aria-hidden />
    </span>
  );
}

function EVENT_TYPES_HAS(type: string | null | undefined): boolean {
  return type === "call" || type === "deadline" || type === "meeting" || type === "training";
}
/** Шапка: заголовок, навигация месяца, «Сегодня» и экспорт «.ics» (pageHead прототипа). */
function Header({
  y,
  m,
  offset,
  onOffset,
  onExport
}: {
  y: number;
  m: number;
  offset: number;
  onOffset: (next: number) => void;
  onExport: () => void;
}) {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Календарь</h1>
      <p className="mt-1 text-sm text-muted-foreground">Встречи, дедлайны и обучение команды</p>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onOffset(offset - 1)} aria-label="Предыдущий месяц" data-testid="calendar-prev">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-[8.5rem] text-center text-sm font-medium" data-testid="calendar-title">
          {MONTHS[m]} {y}
        </span>
        <Button variant="secondary" size="sm" onClick={() => onOffset(offset + 1)} aria-label="Следующий месяц" data-testid="calendar-next">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onOffset(0)} data-testid="calendar-today">
          Сегодня
        </Button>
        <Button variant="secondary" size="sm" onClick={onExport} title={"Скачать " + ICS_FILENAME + " (" + APP_NAME + ")"} data-testid="calendar-export">
          <Download className="size-3.5" aria-hidden />
          .ics
        </Button>
      </div>
    </header>
  );
}
