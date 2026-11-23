"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentWizard } from "@/components/agents/agent-wizard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useAgents, useChannels, useFunnels } from "@/lib/api/hooks";
import type { Agent } from "@/lib/schemas";

/** Раздел «AI-сотрудники» (этап 3, группа 1): список команды и мастер создания. Состояния loading/empty/error/success. */
export function AgentsView() {
  const agents = useAgents();
  const channels = useChannels();
  const funnels = useFunnels();
  const [wizardOpen, setWizardOpen] = useState(false);

  const funnelName = (agent: Agent) =>
    agent.funnelId ? funnels.data?.find((f) => f.id === agent.funnelId)?.name ?? null : null;
  const data: readonly Agent[] = agents.data ?? [];

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight">AI-сотрудники</h1>
          <p className="mt-1 text-sm text-muted-foreground">Команда AI-агентов: роли, каналы, воронки</p>
        </div>
        <Button variant="default" onClick={() => setWizardOpen(true)}>
          <Plus aria-hidden />
          Создать сотрудника
        </Button>
      </header>

      {agents.isPending ? (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Загрузка сотрудников">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52 rounded-card" />)}
        </div>
      ) : agents.isError ? (
        <Card>
          <ErrorState message={agents.error.message} onRetry={() => void agents.refetch()} />
        </Card>
      ) : data.length === 0 ? (
        <Card data-testid="agents-empty">
          <EmptyState title="Сотрудников пока нет" hint="Создайте первого AI-сотрудника кнопкой «Создать сотрудника» — он появится в этом списке." />
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="agents-grid">
          {data.map((a) => (
            <AgentCard key={a.id} agent={a} channels={channels.data ?? []} funnelName={funnelName(a)} />
          ))}
        </div>
      )}

      <AgentWizard open={wizardOpen} onOpenChange={setWizardOpen} agents={data} channels={channels.data ?? []} />
    </div>
  );
}
