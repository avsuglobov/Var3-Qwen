"use client";

import Link from "next/link";
import { AgentStatus } from "@/components/agents/agent-status";
import { ChannelChip } from "@/components/agents/channel-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ru } from "@/lib/i18n/ru";
import type { Agent, Channel } from "@/lib/schemas";

/** Карточка сотрудника в списке (как в прототипе): монограмма, статус, каналы (первые 3 + «+N»), воронка, «Открыть». */
export function AgentCard({ agent, channels, funnelName }: { agent: Agent; channels: readonly Channel[]; funnelName: string | null }) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const shown = agent.channels.slice(0, 3).map((id) => byId.get(id)).filter((c) => c !== undefined);
  const extra = agent.channels.length - shown.length;
  return (
    <Card className="flex flex-col p-5" data-testid="agent-card" data-agent-id={agent.id}>
      <div className="mb-3 flex min-w-0 items-start gap-3">
        <span className="font-data flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary text-[13px] font-semibold text-primary-foreground" data-testid="agent-monogram" aria-hidden>
          {agent.monogram}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[14px] font-semibold">{agent.name}</h2>
            <Badge className="ml-auto shrink-0">{ru.placeholder.demo}</Badge>
          </div>
          <div className="mt-1">
            <AgentStatus status={agent.status} />
          </div>
        </div>
      </div>
      <p className="mb-3 line-clamp-3 text-[13px] text-muted-foreground">{agent.summary}</p>
      <div className="mb-4 flex min-w-0 flex-wrap gap-1.5">
        {shown.map((c) => <ChannelChip key={c.id} channel={c} />)}
        {extra > 0 && <Badge>+{extra}</Badge>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">Воронка: {funnelName ?? "—"}</span>
        <Button variant="secondary" size="sm" asChild>
          <Link href={`/agents/${agent.id}`}>Открыть</Link>
        </Button>
      </div>
    </Card>
  );
}
