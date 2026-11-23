"use client";

import { ChannelGlyph } from "@/components/agents/channel-icon";
import { Badge } from "@/components/ui/badge";
import { ru } from "@/lib/i18n/ru";
import type { Channel, Conversation } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Список входящих диалогов (как в прототипе): контакт, время, превью с иконкой канала. */
export function ChatList({ conversations, channels, selectedId, onSelect, className }: {
  conversations: readonly Conversation[];
  channels: readonly Channel[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-sm border border-border bg-card", className)} data-testid="chat-list">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="section-label">Входящие</span>
        <Badge>{ru.placeholder.demo}</Badge>
      </div>
      <div className="max-h-[420px] min-w-0 overflow-y-auto">
        {conversations.map((c) => {
          const channel = byId.get(c.channel);
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              data-testid="chat-item"
              data-conv-id={c.id}
              onClick={() => onSelect(c.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full min-w-0 flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                active && "bg-muted"
              )}
            >
              <span className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate text-[13.5px] font-semibold" data-testid="chat-item-name">{c.contactName}</span>
                <span className="shrink-0 text-xs text-muted-foreground-strong">{c.lastTime}</span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground-strong">
                {channel ? <ChannelGlyph name={channel.icon} /> : null}
                <span className="truncate">{c.lastPreview || "—"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
