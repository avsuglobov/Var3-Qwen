"use client";

import { useState } from "react";
import { ChatContextCard } from "@/components/dialogs/chat-context-card";
import { ChatList } from "@/components/dialogs/chat-list";
import { ChatThread } from "@/components/dialogs/chat-thread";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useAgents, useChannels, useConversations, useLeads } from "@/lib/api/hooks";
import type { Conversation } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Раздел «Диалоги» (этап 3, группа 2): единый inbox — список чатов, переписка с переключением
 * «ИИ / менеджер», контекст клиента. Состояния loading/empty/error/success. На мобильных
 * показывается список или переписка (кнопка «назад»), панель контекста — от lg.
 */
export function ConversationsView() {
  const conversations = useConversations();
  const channels = useChannels();
  const agents = useAgents();
  const leads = useLeads();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"list" | "thread">("list");

  const loading = conversations.isPending || channels.isPending || agents.isPending;
  const error = conversations.isError || channels.isError || agents.isError
    ? conversations.error ?? channels.error ?? agents.error
    : null;
  const data: readonly Conversation[] = conversations.data ?? [];

  if (loading) {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0">
          <h1 className="text-[28px] leading-tight">Диалоги</h1>
          <p className="mt-1 text-sm text-muted-foreground">Единый inbox: переписка, режим «Человек + ИИ», контекст клиента</p>
        </header>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]" aria-busy="true" aria-label="Загрузка диалогов">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0">
          <h1 className="text-[28px] leading-tight">Диалоги</h1>
          <p className="mt-1 text-sm text-muted-foreground">Единый inbox: переписка, режим «Человек + ИИ», контекст клиента</p>
        </header>
        <ErrorState
          message={error.message}
          onRetry={() => { void conversations.refetch(); void channels.refetch(); void agents.refetch(); }}
        />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="min-w-0 space-y-6">
        <header className="min-w-0">
          <h1 className="text-[28px] leading-tight">Диалоги</h1>
          <p className="mt-1 text-sm text-muted-foreground">Единый inbox: переписка, режим «Человек + ИИ», контекст клиента</p>
        </header>
        <Card data-testid="dialogs-empty">
          <EmptyState title="Диалогов пока нет" hint="Входящие обращения клиентов появятся здесь, когда AI-сотрудник начнёт отвечать." />
        </Card>
      </div>
    );
  }

  const selected: Conversation = data.find((c) => c.id === selectedId) ?? data[0];
  const agentName = agents.data?.find((a) => a.id === selected.agentId)?.name ?? "—";

  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <h1 className="text-[28px] leading-tight">Диалоги</h1>
        <p className="mt-1 text-sm text-muted-foreground">Единый inbox: переписка, режим «Человек + ИИ», контекст клиента</p>
      </header>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <ChatList
          className={cn(pane === "thread" && "hidden lg:flex")}
          conversations={data}
          channels={channels.data ?? []}
          selectedId={selected.id}
          onSelect={(id) => { setSelectedId(id); setPane("thread"); }}
        />
        <ChatThread
          className={cn(pane === "list" && "hidden lg:flex")}
          conv={selected}
          channels={channels.data ?? []}
          agentName={agentName}
          onBack={() => setPane("list")}
        />
        <ChatContextCard
          className="hidden lg:flex"
          conv={selected}
          channels={channels.data ?? []}
          leadHref={(() => {
            const lead = (leads.data ?? []).find((l) => l.name === selected.contactName);
            return lead ? `/crm?lead=${lead.id}` : undefined;
          })()}
        />
      </div>
    </div>
  );
}
