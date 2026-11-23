"use client";

import { BookOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { Agent } from "@/lib/schemas";

/** Вкладка «Знания»: подключённая база знаний. Добавление источников появится вместе с «Хранилищем» (этап 6). */
export function AgentKnowledgeCard({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-4">
      <h3 className="section-label">Подключённая база знаний</h3>
      {agent.knowledge.length === 0 ? (
        <EmptyState title="Источников пока нет" hint="Здесь появятся материалы базы знаний этого сотрудника." />
      ) : (
        <ul className="space-y-2">
          {agent.knowledge.map((k) => (
            <li key={k} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-chip border border-border bg-card px-2.5 text-xs font-medium">
                <BookOpen className="size-3.5 shrink-0" aria-hidden />
                {k}
              </span>
              <Badge className="shrink-0">Индексировано</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <Button variant="secondary" size="sm" disabled title="Скоро">
          <Plus aria-hidden />
          Добавить источник
        </Button>
        <span className="text-xs text-muted-foreground">Скоро — вместе с разделом «Хранилище»</span>
      </div>
    </div>
  );
}
