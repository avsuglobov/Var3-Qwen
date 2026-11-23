"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useLeads, useStages } from "@/lib/api/hooks";
import { funnelColumns } from "@/lib/selectors/agents";
import type { Agent } from "@/lib/schemas";

/** Вкладка «Воронка»: стадии с числом лидов этой воронки. Для ролей без воронки — честное пустое состояние. */
export function AgentFunnelCard({ agent }: { agent: Agent }) {
  const stages = useStages();
  const leads = useLeads();

  if (!agent.funnelId) {
    return (
      <div className="space-y-4">
        <h3 className="section-label">Воронка продаж</h3>
        <EmptyState title="Без воронки" hint="Для этой роли воронка не используется." />
      </div>
    );
  }

  const loading = stages.isPending || leads.isPending;
  const error = stages.isError || leads.isError ? (stages.error ?? leads.error) : null;

  return (
    <div className="space-y-4">
      <h3 className="section-label">Воронка продаж</h3>
      {loading ? (
        <div aria-busy="true" aria-label="Загрузка воронки">
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => { void stages.refetch(); void leads.refetch(); }} />
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="agent-funnel">
          {funnelColumns(agent.funnelId, stages.data ?? [], leads.data ?? []).map(({ stage, count }) => (
            <div key={stage.id} className="rounded-card border border-border p-3" data-stage={stage.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{stage.name}</span>
                <span className="font-data text-sm text-muted-foreground" aria-label={`Лидов: ${count}`}>{count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
