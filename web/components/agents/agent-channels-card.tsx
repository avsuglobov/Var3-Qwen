"use client";

import { Plus } from "lucide-react";
import { ChannelChip } from "@/components/agents/channel-icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { Agent, Channel } from "@/lib/schemas";

/** Вкладка «Каналы»: подключённые каналы. Подключение новых появится на этапе интеграций (этап 8). */
export function AgentChannelsCard({ agent, channels }: { agent: Agent; channels: readonly Channel[] }) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const connected = agent.channels.map((id) => byId.get(id)).filter((c) => c !== undefined);
  return (
    <div className="space-y-4">
      <h3 className="section-label">Каналы подключения</h3>
      {connected.length === 0 ? (
        <EmptyState title="Каналы не подключены" hint="Подключите канал, чтобы сотрудник отвечал клиентам." />
      ) : (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {connected.map((c) => <ChannelChip key={c.id} channel={c} />)}
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <Button variant="secondary" size="sm" disabled title="Скоро">
          <Plus aria-hidden />
          Подключить канал
        </Button>
        <span className="text-xs text-muted-foreground">Скоро — вместе с разделом «Интеграции»</span>
      </div>
    </div>
  );
}
