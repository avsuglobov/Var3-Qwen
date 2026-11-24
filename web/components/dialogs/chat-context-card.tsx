"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelGlyph } from "@/components/agents/channel-icon";
import { contextStatus } from "@/lib/selectors/dialogs";
import type { Channel, Conversation } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** Панель контекста диалога (как в прототипе): кто обратился, канал, история, данные клиента, следующий шаг. */
export function ChatContextCard({ conv, channels, leadHref, className }: {
  conv: Conversation;
  channels: readonly Channel[];
  /** Ссылка на лида в CRM (этап 3, группа 3): /crm?lead=…, если у контакта есть лид. */
  leadHref?: string;
  className?: string;
}) {
  const channel = channels.find((ch) => ch.id === conv.channel);
  const ctx = conv.context;
  return (
    <div className={cn("flex min-w-0 flex-col gap-4 overflow-hidden rounded-sm border border-border bg-card p-4", className)} data-testid="chat-context">
      <section>
        <h3 className="section-label">Кто обратился</h3>
        <p className="mt-1.5 truncate text-[13.5px] font-semibold">{ctx.who}</p>
      </section>
      <section>
        <h3 className="section-label">Канал</h3>
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm">
          {channel ? <ChannelGlyph name={channel.icon} /> : null}
          <span className="truncate">{ctx.channel}</span>
        </p>
      </section>
      <section>
        <h3 className="section-label">История</h3>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{ctx.history}</p>
      </section>
      <section>
        <h3 className="section-label">Данные клиента</h3>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
          <dt className="text-muted-foreground">Файлы</dt>
          <dd>{ctx.files}</dd>
          <dt className="text-muted-foreground">Статус</dt>
          <dd data-testid="chat-context-status">{contextStatus(conv.mode)}</dd>
        </dl>
      </section>
      <section className="mt-auto border-t border-border pt-3">
        <h3 className="section-label">Следующий шаг</h3>
        <p className="mt-1.5 text-[13px]">{ctx.nextStep}</p>
        <Button asChild variant="secondary" size="sm" className="mt-2 w-full">
          <Link href={leadHref ?? "/crm"} data-testid="chat-open-crm">
            <ArrowRight aria-hidden />
            Открыть в CRM
          </Link>
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">{leadHref ? "Откроется инспектор связанного лида в CRM" : "Для этого контакта нет лида в CRM"}</p>
      </section>
    </div>
  );
}
