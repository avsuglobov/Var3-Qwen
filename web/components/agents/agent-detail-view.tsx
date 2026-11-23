"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Pause, RefreshCw } from "lucide-react";
import { AgentApprovalsCard } from "@/components/agents/agent-approvals-card";
import { AgentChannelsCard } from "@/components/agents/agent-channels-card";
import { AgentFunnelCard } from "@/components/agents/agent-funnel-card";
import { AgentInstructionCard } from "@/components/agents/agent-instruction-card";
import { AgentKnowledgeCard } from "@/components/agents/agent-knowledge-card";
import { AgentStatus } from "@/components/agents/agent-status";
import { AgentTestChatCard } from "@/components/agents/agent-test-chat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useAgents, useChannels, useUpdateAgent } from "@/lib/api/hooks";
import { ru } from "@/lib/i18n/ru";
import { ROLE_LABELS } from "@/lib/selectors/agents";
import type { AgentRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  ["instruction", "Инструкция"],
  ["knowledge", "Знания"],
  ["channels", "Каналы"],
  ["funnel", "Воронка"],
  ["approvals", "Правила согласования"],
  ["test", "Тест"]
] as const;

type TabId = (typeof TABS)[number][0];

/** Страница сотрудника: шапка с паузой, статус/роль и вкладки (как в прототипе, раздел «AI-сотрудники» → деталь). */
export function AgentDetailView({ agentId }: { agentId: string }) {
  const agents = useAgents();
  const channels = useChannels();
  const update = useUpdateAgent();
  const [tab, setTab] = useState<TabId>("instruction");

  const agent = agents.data?.find((a) => a.id === agentId);

  if (agents.isPending) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка сотрудника">
        <Skeleton className="h-14 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (agents.isError) {
    return (
      <Card>
        <ErrorState message={agents.error.message} onRetry={() => void agents.refetch()} />
      </Card>
    );
  }
  if (!agent) {
    return (
      <Card>
        <EmptyState title="Сотрудник не найден" hint="Возможно, ссылка устарела или запись удалена. Откройте список и выберите сотрудника." />
        <div className="px-5 pb-5">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/agents">
              <ChevronLeft aria-hidden />
              К списку
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  const paused = agent.status === "offline";
  const pauseBusy = update.isPending && update.variables?.id === agent.id;
  const pause = () => {
    update.mutate({ id: agent.id, patch: { status: paused ? "online" : "offline" } });
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight">{agent.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{agent.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/agents">
              <ChevronLeft aria-hidden />
              К списку
            </Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={pause} aria-busy={pauseBusy} data-testid="agent-pause">
            {paused ? <RefreshCw aria-hidden /> : <Pause aria-hidden />}
            {paused ? "Возобновить" : "Приостановить"}
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AgentStatus status={agent.status} data-testid="agent-status" />
        <Badge>Роль: {ROLE_LABELS[agent.role as AgentRole]}</Badge>
        <Badge>{ru.placeholder.demo}</Badge>
      </div>

      <div role="tablist" aria-label="Вкладки сотрудника" className="flex min-w-0 flex-wrap gap-1 border-b border-border">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`tab-${id}`}
            className={cn(
              "transition-ui -mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
              tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card role="tabpanel" aria-label={TABS.find(([id]) => id === tab)?.[1]} className="p-5" data-testid="agent-tab">
        {tab === "instruction" && <AgentInstructionCard agent={agent} />}
        {tab === "knowledge" && <AgentKnowledgeCard agent={agent} />}
        {tab === "channels" && <AgentChannelsCard agent={agent} channels={channels.data ?? []} />}
        {tab === "funnel" && <AgentFunnelCard agent={agent} />}
        {tab === "approvals" && <AgentApprovalsCard agent={agent} />}
        {tab === "test" && <AgentTestChatCard />}
      </Card>
    </div>
  );
}
