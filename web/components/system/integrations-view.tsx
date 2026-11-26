"use client";

import { Calendar, Code, FileText, KeyRound, MessageCircle, Phone, Plug, Plus, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useAutoSync, useCompanyProfile, useIntegrationAction, useIntegrationRuns, useIntegrations, useSaveCompanyProfile, useSetAutoSync } from "@/lib/api/hooks";
import { CredentialsDialog } from "@/components/system/credentials-dialog";
import { adapterOf } from "@/lib/integrations/adapters";
import type { IntegrationRun } from "@/lib/integrations/types";
import { applyConnectionStates, integrationStatusText } from "@/lib/selectors/system";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
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
 * «Запросить интеграцию». Этап 7: «Подключить»/«Отключить» сохраняют состояние в профиле
 * компании (connections) и переживают перезагрузку. Этап 8: у интеграций с адаптерами
 * (amoCRM, Bitrix24, REST API/webhook) кнопки «Ключи», «Проверить связь» и
 * «Синхронизировать» выполняют реальные HTTP-запросы через сервер, журнал прогонов —
 * в .data/integration-runs.json; у остальных карточек адаптер появится позже.
 * Этап 14: у интеграций с адаптерами тумблер «Автосинхронизация (15 мин)» включает/выключает
 * серверный планировщик для карточки (состояние в .data/secrets.json), прогоны планировщика
 * в журнале помечены припиской «(авто)».
 */
export function IntegrationsView() {
  const integrationsQ = useIntegrations();
  const profileQ = useCompanyProfile();
  const save = useSaveCompanyProfile();
  const runsQ = useIntegrationRuns();
  const actionM = useIntegrationAction();
  const [feedback, setFeedback] = useState("");
  const [keysFor, setKeysFor] = useState<Integration | null>(null);

  /** Действие адаптера: реальный вызов на сервере; итог связи ok:false — тоже результат. */
  const runAction = (id: string, action: "check" | "sync"): void => {
    actionM.mutate(
      { integrationId: id, action },
      {
        onSuccess: ({ run }) => setFeedback(`${nameOf(integrationsQ.data ?? [], id)}: ${action === "check" ? "проверка связи" : "синхронизация"} — ${run.ok ? "успех" : "ошибка"} (${run.detail})`),
        onError: (e) => setFeedback(e.message)
      }
    );
  };

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
  const runs = runsQ.data?.runs ?? [];

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
          <IntegrationCard
            key={it.id}
            item={it}
            run={runs.find((r) => r.integrationId === it.id) ?? null}
            onToggle={toggle}
            onKeys={() => setKeysFor(it)}
            onAction={runAction}
            actionBusy={actionM.isPending && actionM.variables?.integrationId === it.id}
            onAutoSyncResult={(message) => setFeedback(message)}
          />
        ))}
      </div>

      <CredentialsDialog key={keysFor?.id ?? "none"} open={keysFor !== null} integration={keysFor ?? effective[0]} onOpenChange={(next) => (next ? null : setKeysFor(null))} onSaved={(name) => setFeedback(`${name}: ключи сохранены`)} />

      <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Plug className="size-3.5" aria-hidden />
        Состояние подключения сохраняется в данных приложения. «Проверить связь» и «Синхронизировать» выполняют реальные
        HTTP-запросы через сервер; ключи вводятся вручную («Ключи») и хранятся в .data/secrets.json — в браузер отдаётся только маска.
        Тумблер «Автосинхронизация» включает прогоны планировщиком каждые 15 минут (состояние — в secrets.json), такие прогоны
        в журнале помечены «(авто)».
      </p>
    </div>
  );
}

function nameOf(items: readonly Integration[], id: string): string {
  return items.find((it) => it.id === id)?.name ?? id;
}

/** Строка последнего прогона: статус не только цветом (точка + слово «успех»/«ошибка»);
    прогоны планировщика — приписка «(авто)» (этап 14). */
function RunLine({ run }: { run: IntegrationRun }) {
  const time = new Date(run.at).toLocaleTimeString("ru-RU", { hour12: false });
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground" data-testid="integrations-run" data-int={run.integrationId}>
      <span className={cn("size-1.5 shrink-0 rounded-full", run.ok ? "bg-status" : "bg-critical")} aria-hidden />
      <span className="min-w-0 truncate">
        {run.action === "check" ? "Проверка" : "Синхронизация"}
        {run.trigger === "auto" ? " (авто)" : ""} · {run.ok ? "успех" : "ошибка"} · {run.detail} · {time}
      </span>
    </p>
  );
}

/** Тумблер «Автосинхронизация (15 мин)» карточки (этап 14): состояние — в .data/secrets.json
    (маршрут /api/integrations/auto-sync); записи нет — включена (поведение этапа 13). */
function AutoSyncRow({ id, name, onResult }: { id: string; name: string; onResult: (message: string) => void }) {
  const q = useAutoSync(id);
  const set = useSetAutoSync();
  return (
    <div className="flex min-w-0 items-center justify-between gap-2" data-testid="integrations-autosync-row" data-int={id}>
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">Автосинхронизация (15 мин)</span>
      <Switch
        checked={q.data?.enabled ?? true}
        label={`Автосинхронизация ${name}`}
        testId="integrations-autosync"
        onCheckedChange={(next) =>
          set.mutate(
            { integrationId: id, enabled: next },
            {
              onSuccess: () => onResult(`${name}: автосинхронизация ${next ? "включена" : "выключена"}`),
              onError: (e) => onResult(e.message)
            }
          )
        }
      />
    </div>
  );
}

function IntegrationCard({
  item,
  run,
  onToggle,
  onKeys,
  onAction,
  actionBusy,
  onAutoSyncResult
}: {
  item: Integration;
  run: IntegrationRun | null;
  onToggle: (id: string, next: boolean) => void;
  onKeys: () => void;
  onAction: (id: string, action: "check" | "sync") => void;
  actionBusy: boolean;
  onAutoSyncResult: (message: string) => void;
}) {
  const Icon = INTEGRATION_ICON[item.icon] ?? Plug;
  const connected = item.connected;
  const adapter = adapterOf(item.id);
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
        {adapter ? (
          <div className="space-y-1.5">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" data-testid="integrations-keys" data-int={item.id} onClick={onKeys}>
                <KeyRound className="size-3.5" aria-hidden />
                Ключи
              </Button>
              <Button variant="secondary" size="sm" data-testid="integrations-check" data-int={item.id} disabled={actionBusy} onClick={() => onAction(item.id, "check")}>
                Проверить связь
              </Button>
              <Button variant="secondary" size="sm" data-testid="integrations-sync" data-int={item.id} disabled={actionBusy} onClick={() => onAction(item.id, "sync")}>
                Синхронизировать
              </Button>
            </div>
            <AutoSyncRow id={item.id} name={item.name} onResult={onAutoSyncResult} />
            {run ? <RunLine run={run} /> : <p className="text-[11px] text-muted-foreground">Прогонов ещё не было</p>}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Адаптер появится позже</p>
        )}
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
