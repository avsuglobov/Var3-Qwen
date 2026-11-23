"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useLeads } from "@/lib/api/hooks";
import { recentJournal } from "@/lib/selectors/overview";
import { cn } from "@/lib/utils";

/** «Журнал смены»: действия ИИ подписаны акцентом и моно-временем, действия людей — основным цветом текста. */
export function JournalCard() {
  const q = useLeads();
  const rows = q.data ? recentJournal(q.data, 8) : [];
  return (
    <Card data-testid="journal">
      <CardHeader>
        <CardTitle className="section-label !text-xs !font-normal">Лента событий · журнал смены</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Загрузка событий">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-6" />)}
          </div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="Событий пока нет" hint="Здесь появятся действия ИИ-сотрудников и менеджеров." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r, i) => (
              <li key={`${r.leadId}-${r.t}-${i}`} className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm sm:flex-nowrap" data-actor={r.actor}>
                <time className="font-data w-12 shrink-0 text-muted-foreground">{r.t}</time>
                <span className={cn("w-[4.5rem] shrink-0 font-medium", r.actor === "ai" && "text-primary")}>{r.actor === "ai" ? "ИИ" : "Менеджер"}</span>
                <span className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1 sm:truncate" data-testid="journal-text">{r.text}</span>
                <span className="font-data ml-auto shrink-0 text-xs text-muted-foreground sm:ml-0">{r.leadId}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
