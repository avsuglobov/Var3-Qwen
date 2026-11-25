"use client";

import { Calendar, Code, FileText, MessageCircle, Phone, Plug, Plus, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useCompanyProfile, useIntegrations, useSaveCompanyProfile } from "@/lib/api/hooks";
import { applyConnectionStates, integrationStatusText } from "@/lib/selectors/system";
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
 * «Запросить интеграцию» (обратная связь вместо тоста прототипа). Этап 7: «Подключить»/
 * «Отключить» сохраняют состояние в профиле компании (connections) и переживают
 * перезагрузку; вызовы внешних сервисов в демо не выполняются — помечено честно.
 */
export function IntegrationsView() {
  const integrationsQ = useIntegrations();
  const profileQ = useCompanyProfile();
  const save = useSaveCompanyProfile();
  const [feedback, setFeedback] = useState("");

  if (integrationsQ.isPending || profileQ.isPending) {
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
  if (integrationsQ.isError || profileQ.isError) {
    const err = integrationsQ.isError ? integrationsQ.error : profileQ.isError ? profileQ.error : null;
    return (
      <div className="min-w-0 space-y-6">
        <Header />
        <ErrorState message={err?.message ?? "Ошибка загрузки"} onRetry={() => { void integrationsQ.refetch(); void profileQ.refetch(); }} />
      </div>
    );
  }

  const items = integrationsQ.data ?? [];
  const effective = applyConnectionStates(items, profileQ.data?.connections);

  /** Переключение состояния: в профиль сохраняются явные состояния всех интеграций справочника. */
  const toggle = (id: string, next: boolean): void => {
    const connections = effective.map((it) => ({ id: it.id, connected: it.id === id ? next : it.connected }));
    save.mutate(
      { connections },
      {
        onSuccess: () => setFeedback(`${nameOf(items, id)}: состояние сохранено`),
        onError: (e) => setFeedback(e.message)
      }
    );
  };

  return (
    <div className="min-w-0 space-y-6">
      <Header onRequest={() => setFeedback("Запрос интеграции отправлен (демо)")} />

      {feedback ? (
        <p role="status" aria-live="polite" className="text-[13px]" data-testid="integrations-feedback">
          {feedback}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="integrations-grid">
        {effective.map((it) => (
          <IntegrationCard key={it.id} item={it} onToggle={toggle} />
        ))}
      </div>

      <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Plug className="size-3.5" aria-hidden />
        Состояние подключения сохраняется в данных приложения; обмен данными с внешними сервисами в демо не выполняется.
      </p>
    </div>
  );
}

function nameOf(items: readonly Integration[], id: string): string {
  return items.find((it) => it.id === id)?.name ?? id;
}

function IntegrationCard({ item, onToggle }: { item: Integration; onToggle: (id: string, next: boolean) => void }) {
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
          <Button
            variant="secondary"
            size="sm"
            aria-label={connected ? `Отключить ${item.name}` : `Подключить ${item.name}`}
            data-testid="integrations-toggle"
            data-int={item.id}
            onClick={() => onToggle(item.id, !connected)}
          >
            {connected ? "Отключить" : "Подключить"}
          </Button>
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
