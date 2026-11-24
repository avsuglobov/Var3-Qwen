"use client";

import { Calendar, Code, FileText, MessageCircle, Phone, Plug, Plus, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useIntegrations } from "@/lib/api/hooks";
import { integrationStatusText } from "@/lib/selectors/system";
import { cn } from "@/lib/utils";
import type { Integration } from "@/lib/schemas";

const INTEGRATION_ICON: Record<string, typeof FileText> = {
  refresh: RefreshCw,
  "send-paper-plane": Send,
  "message-circle": MessageCircle,
  calendar: Calendar,
  code: Code,
  "file-text": FileText,
  phone: Phone
};

/**
 * Раздел «Интеграции» (этап 3, финальная группа) — поведение integrations() прототипа:
 * сетка карточек D.INTEGRATIONS со статусом «Подключено / Не подключено» и кнопка
 * «Запросить интеграцию» (обратная связь вместо тоста прототипа). Кнопки карточек
 * «Настроить»/«Подключить» в прототипе помечены «скоро» (data-soon) и не переносятся —
 * в приложении только доступные действия.
 */
export function IntegrationsView() {
  const integrationsQ = useIntegrations();
  const [feedback, setFeedback] = useState("");

  if (integrationsQ.isPending) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка интеграций">
        <Header />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </div>
    );
  }
  if (integrationsQ.isError) {
    return (
      <div className="min-w-0 space-y-6">
        <Header />
        <ErrorState message={integrationsQ.error.message} onRetry={() => void integrationsQ.refetch()} />
      </div>
    );
  }

  const items = integrationsQ.data ?? [];

  return (
    <div className="min-w-0 space-y-6">
      <Header onRequest={() => setFeedback("Запрос интеграции отправлен (демо)")} />

      {feedback ? (
        <p role="status" aria-live="polite" className="text-[13px]" data-testid="integrations-feedback">
          {feedback}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="integrations-grid">
        {items.map((it) => (
          <IntegrationCard key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({ item }: { item: Integration }) {
  const Icon = INTEGRATION_ICON[item.icon] ?? Plug;
  const connected = item.connected;
  return (
    <Card className="h-full" data-testid="integrations-card" data-int={item.id}>
      <CardContent className="flex h-full flex-col gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate text-sm font-semibold">{item.name}</span>
          <span className="flex-1" aria-hidden />
          <Badge variant="outline" className="text-[11px]">
            Демо
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{item.desc}</p>
        <div className="mt-auto flex min-w-0 items-center justify-between gap-2 pt-1">
          <Badge variant="outline" className="text-[11px]">
            <span className={cn("size-1.5 rounded-full", connected ? "bg-status" : "bg-muted-foreground")} aria-hidden />
            {integrationStatusText(connected)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Header({ onRequest }: { onRequest?: () => void }) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight">Интеграции</h1>
        <p className="mt-1 text-sm text-muted-foreground">Подключение внешних сервисов и каналов</p>
      </div>
      {onRequest ? (
        <Button onClick={onRequest} data-testid="integrations-request">
          <Plus className="size-4" aria-hidden />
          Запросить интеграцию
        </Button>
      ) : null}
    </header>
  );
}
