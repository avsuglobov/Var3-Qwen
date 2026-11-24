"use client";

import { ArrowRight, FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";
import { ACTOR_META, type JournalRow } from "@/lib/selectors/crm";
import type { Agent, Channel, Conversation, Lead, Stage } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Вид «Журнал» раздела CRM (этап 3, группа 3): лента событий всех лидов воронки слева,
 * инспектор выбранного лида справа (данные, события, стадия, действия) — как crmJournal прототипа.
 * На мобильных колонки складываются в столбец.
 */
export function CrmJournal({
  rows,
  leads,
  selected,
  stages,
  channels,
  agents,
  conversations,
  onSelect,
  onMoveStage,
  onDelete,
  onMakeDoc,
  onFeedback
}: {
  rows: readonly JournalRow[];
  leads: readonly Lead[];
  selected: Lead | undefined;
  stages: readonly Stage[];
  channels: Record<string, Channel>;
  agents: readonly Agent[];
  conversations: readonly Conversation[];
  onSelect: (leadId: string) => void;
  onMoveStage: (leadId: string, stageId: string) => void;
  onDelete: (lead: Lead) => void;
  onMakeDoc: (lead: Lead) => void;
  onFeedback: (text: string, kind?: "status" | "alert") => void;
}) {
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="min-w-0" data-testid="crm-journal-card">
        <CardHeader>
          <CardTitle className="section-label !text-xs !font-normal">Журнал смены</CardTitle>
          <Badge variant="outline" className="ml-auto" data-testid="crm-journal-count">
            {rows.length} событий
          </Badge>
        </CardHeader>
        <CardContent data-testid="crm-journal">
          {rows.length === 0 ? (
            <EmptyState title="Событий пока нет" hint="События этой воронки появятся здесь — из диалогов и работы с лидами." />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, i) => (
                <li key={`${row.leadId}-${i}`} className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm sm:flex-nowrap" data-testid="crm-journal-row" data-actor={row.actor}>
                  <time className="font-data w-12 shrink-0 text-muted-foreground">{row.t}</time>
                  <span className={cn("w-[4.5rem] shrink-0 font-medium", row.actor === "ai" && "text-primary")}>{ACTOR_META[row.actor]}</span>
                  <span className="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1 sm:truncate">{row.text}</span>
                  <button
                    type="button"
                    className="font-data shrink-0 text-xs text-primary hover:underline"
                    onClick={() => onSelect(row.leadId)}
                    data-testid="crm-journal-lead-link"
                    title={`Открыть ${row.leadId} в инспекторе`}
                  >
                    {row.leadId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="min-w-0">
        <h2 className="section-label">Инспектор лида</h2>
        <div className="mt-2.5">
          {selected ? (
            <LeadInspector
              lead={selected}
              stages={stages}
              channels={channels}
              agents={agents}
              conversation={conversations.find((c) => c.contactName === selected.name)}
              onMoveStage={onMoveStage}
              onDelete={onDelete}
              onMakeDoc={onMakeDoc}
              onFeedback={onFeedback}
            />
          ) : (
            <Card data-testid="crm-inspector-empty">
              <EmptyState title="Лид не выбран" hint="Выберите лид из журнала или канбана." />
            </Card>
          )}
        </div>
        {leads.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted-foreground">В этой воронке нет лидов — создайте лид или выберите другую воронку.</p>
        ) : null}
      </div>
    </div>
  );
}

/** Инспектор выбранного лида: данные, лента событий, смена стадии, действия (как в прототипе). */
function LeadInspector({
  lead,
  stages,
  channels,
  agents,
  conversation,
  onMoveStage,
  onDelete,
  onMakeDoc,
  onFeedback
}: {
  lead: Lead;
  stages: readonly Stage[];
  channels: Record<string, Channel>;
  agents: readonly Agent[];
  conversation: Conversation | undefined;
  onMoveStage: (leadId: string, stageId: string) => void;
  onDelete: (lead: Lead) => void;
  onMakeDoc: (lead: Lead) => void;
  onFeedback: (text: string, kind?: "status" | "alert") => void;
}) {
  const router = useRouter();
  const stage = stages.find((s) => s.id === lead.stageId);
  const channel = channels[lead.channel];
  const agent = agents.find((a) => a.id === lead.agentId);

  return (
    <Card data-testid="crm-inspector">
      <div className="flex items-center gap-2 px-5 pt-5">
        <span className="min-w-0 truncate text-[14px] font-semibold">{lead.name}</span>
        <span className="flex-1" />
        <Badge variant="outline" data-testid="crm-inspector-stage">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          {stage?.name ?? "—"}
        </Badge>
      </div>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]" data-testid="crm-inspector-kv">
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-data">{lead.id}</dd>
          <dt className="text-muted-foreground">Канал</dt>
          <dd>{channel?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">Агент</dt>
          <dd>{agent?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">Активность</dt>
          <dd className="font-data">{lead.lastActivity ?? "—"}</dd>
        </dl>
        <h3 className="section-label mt-4">Лента событий лида</h3>
        <ul className="mt-1 divide-y divide-border" data-testid="crm-lead-events">
          {lead.events.map((e, i) => (
            <li key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm sm:flex-nowrap">
              <time className="font-data w-12 shrink-0 text-muted-foreground">{e.t}</time>
              <span className={cn("w-[4.5rem] shrink-0 font-medium", e.actor === "ai" && "text-primary")}>{ACTOR_META[e.actor]}</span>
              <span className="order-last min-w-0 basis-full text-muted-foreground sm:order-none sm:basis-0 sm:flex-1 sm:truncate">{e.text}</span>
            </li>
          ))}
        </ul>
        <div className="my-4 h-px bg-border" />
        <div className="space-y-1.5">
          <label className="section-label" htmlFor="crm-lead-stage">
            Стадия
          </label>
          <select
            id="crm-lead-stage"
            className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            value={lead.stageId}
            onChange={(e) => {
              onMoveStage(lead.id, e.target.value);
              onFeedback("Стадия изменена");
            }}
            data-testid="crm-lead-stage-select"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (!conversation) {
                onFeedback("Для этого лида нет диалога", "alert");
                return;
              }
              onFeedback("");
              router.push("/dialogs");
            }}
            data-testid="crm-open-dialog"
          >
            <ArrowRight aria-hidden />
            Открыть диалог
          </Button>
          <Button
            size="sm"
            variant="secondary"
            title={"Создать документ по клиенту «" + lead.name + "»"}
            onClick={() => onMakeDoc(lead)}
            data-testid="crm-make-doc"
          >
            <FileText aria-hidden />
            Документ
          </Button>
          <span className="flex-1" />
          <Button variant="destructive" size="sm" onClick={() => onDelete(lead)} data-testid="crm-delete-lead">
            <Trash2 aria-hidden />
            Удалить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
