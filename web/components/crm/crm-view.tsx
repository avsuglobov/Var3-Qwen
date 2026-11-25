"use client";

import { BarChart3, MessagesSquare, Plus, SquareKanban } from "lucide-react";
import { useEffect, useState } from "react";
import { CreateDocumentDialog } from "@/components/documents/create-document-dialog";
import { CrmJournal } from "@/components/crm/crm-journal";
import { CrmKanban } from "@/components/crm/crm-kanban";
import { CrmTable } from "@/components/crm/crm-table";
import { LeadDeleteDialog } from "@/components/crm/lead-delete-dialog";
import { NewLeadDialog } from "@/components/crm/new-lead-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useAgents, useChannels, useConversations, useCreateLead, useDeleteLead, useDocuments, useFunnels, useIntegrations, useLeads, useMoveLeadStage, useStages } from "@/lib/api/hooks";
import type { Lead } from "@/lib/schemas";
import {
  VIEW_META,
  crmSyncLabel,
  crmSyncOk,
  crmSyncRows,
  filterByStage,
  funnelLeads,
  funnelStages,
  journalEvents,
  moveStagePatch,
  nextSort,
  sortTableLeads,
  type CrmView,
  type TableSort
} from "@/lib/selectors/crm";
import { cn } from "@/lib/utils";

/**
 * Раздел «CRM» (этап 3, группа 3): воронки сделок и работа с лидами — журнал смены с инспектором
 * лида, канбан стадий на dnd-kit, таблица с фильтром и сортировкой; создание и удаление лидов.
 * Состояния loading/error/success. Поддерживает deep-link: /crm?lead=LD-…&funnel=…&view=journal.
 */
export function CrmView() {
  const leadsQ = useLeads();
  const funnelsQ = useFunnels();
  const stagesQ = useStages();
  const channelsQ = useChannels();
  const agentsQ = useAgents();
  const conversationsQ = useConversations();
  const documentsQ = useDocuments();
  const integrationsQ = useIntegrations();
  const moveStage = useMoveLeadStage();
  const createLead = useCreateLead();
  const removeLead = useDeleteLead();

  const [view, setView] = useState<CrmView>("journal");
  const [funnelId, setFunnelId] = useState("fn-sales");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<TableSort>("id");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  /** Лид, по которому открывается «Создать документ» (кнопка «Документ» инспектора). */
  const [docFor, setDocFor] = useState<Lead | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  // Deep-link из диалогов и внешних ссылок: /crm?lead=…&funnel=…&view=… (после монтирования, без влияния на hydration).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const viewParam = sp.get("view");
    if (viewParam && viewParam in VIEW_META) setView(viewParam as CrmView);
    const funnelParam = sp.get("funnel");
    if (funnelParam) setFunnelId(funnelParam);
    const leadParam = sp.get("lead");
    if (leadParam) setSelectedLeadId(leadParam);
  }, []);

  const loading = leadsQ.isPending || funnelsQ.isPending || stagesQ.isPending || channelsQ.isPending || agentsQ.isPending || integrationsQ.isPending;
  const error = leadsQ.isError || funnelsQ.isError || stagesQ.isError || channelsQ.isError || agentsQ.isError || integrationsQ.isError
    ? leadsQ.error ?? funnelsQ.error ?? stagesQ.error ?? channelsQ.error ?? agentsQ.error ?? integrationsQ.error
    : null;
  const leads = leadsQ.data ?? [];
  const funnels = funnelsQ.data ?? [];
  const stages = stagesQ.data ?? [];
  const channels = channelsQ.data ?? [];
  const agents = agentsQ.data ?? [];
  const conversations = conversationsQ.data ?? [];
  const channelsById = Object.fromEntries(channels.map((c) => [c.id, c]));
  const funnel = funnels.find((f) => f.id === funnelId) ?? funnels[0];
  const activeFunnelId = funnel?.id ?? funnelId;
  const fLeads = funnelLeads(leads, activeFunnelId);
  const viewStages = funnel ? funnelStages(funnel, stages) : [];
  const selected = fLeads.find((l) => l.id === selectedLeadId) ?? fLeads[0];
  const deletingLead = leads.find((l) => l.id === deleting) ?? null;
  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });

  if (loading) {
    return (
      <div className="min-w-0 space-y-6">
        <Header view={view} funnelId={activeFunnelId} funnels={funnels} syncLabel={null} syncOk={false} onFunnelChange={() => undefined} onViewChange={() => undefined} onCreate={() => undefined} />
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1.4fr_1fr]" aria-busy="true" aria-label="Загрузка CRM">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header view={view} funnelId={activeFunnelId} funnels={funnels} syncLabel={null} syncOk={false} onFunnelChange={() => undefined} onViewChange={() => undefined} onCreate={() => undefined} />
        <ErrorState
          message={error.message}
          onRetry={() => { void leadsQ.refetch(); void funnelsQ.refetch(); void stagesQ.refetch(); void channelsQ.refetch(); void agentsQ.refetch(); void integrationsQ.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Header
        view={view}
        funnelId={activeFunnelId}
        funnels={funnels}
        syncLabel={crmSyncLabel(crmSyncRows(integrationsQ.data ?? []))}
        syncOk={crmSyncOk(crmSyncRows(integrationsQ.data ?? []))}
        onFunnelChange={(id) => setFunnelId(id)}
        onViewChange={setView}
        onCreate={() => setCreateOpen(true)}
      />
      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="crm-feedback">
          {feedback.text}
        </p>
      ) : null}
      {view === "journal" ? (
        <CrmJournal
          rows={journalEvents(leads, activeFunnelId)}
          leads={fLeads}
          selected={selected}
          stages={stages}
          channels={channelsById}
          agents={agents}
          conversations={conversations}
          onSelect={setSelectedLeadId}
          onMoveStage={(id, stageId) => {
            const lead = leads.find((l) => l.id === id);
            const patch = lead ? moveStagePatch(lead, stageId, stages) : null;
            if (!lead || !patch) return;
            moveStage.mutate(
              { id, patch },
              { onError: (e) => onFeedback(e.message, "alert") }
            );
          }}
          onDelete={(lead) => setDeleting(lead.id)}
          onMakeDoc={(lead) => setDocFor(lead)}
          onFeedback={onFeedback}
        />
      ) : view === "kanban" ? (
        <CrmKanban
          leads={fLeads}
          stages={viewStages}
          channels={channelsById}
          onMoveStage={(id, stageId) => {
            const lead = leads.find((l) => l.id === id);
            const patch = lead ? moveStagePatch(lead, stageId, stages) : null;
            if (!lead || !patch) return;
            moveStage.mutate(
              { id, patch },
              { onError: (e) => onFeedback(e.message, "alert") }
            );
          }}
          onSelect={(id) => {
            setSelectedLeadId(id);
            setView("journal");
          }}
        />
      ) : (
        <CrmTable
          leads={sortTableLeads(filterByStage(fLeads, filter), sort)}
          stages={viewStages.length ? viewStages : stages}
          channels={channelsById}
          agents={agents}
          filter={filter}
          onFilterChange={setFilter}
          sort={sort}
          onSortChange={() => setSort((cur) => nextSort(cur))}
          onSelect={(id) => {
            setSelectedLeadId(id);
            setView("journal");
          }}
        />
      )}
      <NewLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        leads={leads}
        funnels={funnels}
        channels={channelsById}
        agents={agents}
        defaultFunnelId={activeFunnelId}
        onCreated={(lead) => {
          setFunnelId(lead.funnelId);
          setSelectedLeadId(lead.id);
          setView("journal");
          onFeedback(`Лид создан: ${lead.id}`);
        }}
      />
      <CreateDocumentDialog
        open={docFor !== null}
        onOpenChange={(next) => {
          if (!next) setDocFor(null);
        }}
        docs={documentsQ.data ?? []}
        clients={leads.map((l) => l.name)}
        defaultClient={docFor?.name}
        onCreated={() => onFeedback("Документ создан")}
      />
      <LeadDeleteDialog
        lead={deletingLead}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        onDeleted={() => {
          if (selectedLeadId === deleting) setSelectedLeadId(null);
          setDeleting(null);
          onFeedback("Лид удалён");
        }}
      />
      {createLead.isError ? (
        <p role="alert" className="text-[13px] text-critical">
          Не удалось создать лид: {createLead.error.message}
        </p>
      ) : null}
      {removeLead.isError ? (
        <p role="alert" className="text-[13px] text-critical">
          Не удалось удалить лид: {removeLead.error.message}
        </p>
      ) : null}
    </div>
  );
}

/** Шапка раздела: заголовок, «Создать лид», переключатель видов, воронка, статус синхронизации с внешними CRM (этап 6: из справочника интеграций). */
function Header({
  view,
  funnelId,
  funnels,
  syncLabel,
  syncOk,
  onFunnelChange,
  onViewChange,
  onCreate
}: {
  view: CrmView;
  funnelId: string;
  funnels: readonly { id: string; name: string }[];
  /** Текст статуса синхронизации; null — данные справочника ещё не загружены (бейдж не рисуется). */
  syncLabel: string | null;
  syncOk: boolean;
  onFunnelChange: (id: string) => void;
  onViewChange: (v: CrmView) => void;
  onCreate: () => void;
}) {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Воронки сделок и работа с лидами</p>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <Button onClick={onCreate} data-testid="crm-new-lead-btn">
          <Plus aria-hidden />
          Создать лид
        </Button>
        <div className="inline-flex items-center gap-0.5 rounded-chip border border-border bg-card p-0.5" role="group" aria-label="Вид раздела">
          {(Object.keys(VIEW_META) as CrmView[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onViewChange(v)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-chip px-2.5 text-xs font-medium",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="crm-view-switch"
              data-view={v}
            >
              {v === "journal" ? <MessagesSquare className="size-3.5" aria-hidden /> : v === "kanban" ? <SquareKanban className="size-3.5" aria-hidden /> : <BarChart3 className="size-3.5" aria-hidden />}
              {VIEW_META[v].label}
            </button>
          ))}
        </div>
        <select
          aria-label="Воронка"
          value={funnelId}
          onChange={(e) => onFunnelChange(e.target.value)}
          className="h-9 w-auto rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="crm-funnel-select"
        >
          {funnels.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {syncLabel !== null ? (
          <Badge
            variant="outline"
            data-testid="crm-sync"
            title="Статусы внешних CRM — из справочника интеграций; настроить подключения можно в разделе «Интеграции»"
          >
            <span className={cn("size-1.5 rounded-full", syncOk ? "bg-status" : "bg-critical")} aria-hidden />
            {syncLabel}
          </Badge>
        ) : null}
      </div>
    </header>
  );
}
