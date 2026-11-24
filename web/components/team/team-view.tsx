"use client";

import { ArrowRight, GitBranch } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useChainTemplates } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

/**
 * Раздел «Команда» (этап 3, группа 7) — поведение team() прототипа: выбор шаблона цепочки
 * (чипы, активный — акцентный) и визуализация цепочки ИИ-сотрудников со стрелками
 * («Результат каждого шага передаётся следующему по цепочке»). Выбор шаблона — локальный
 * стейт (в прототипе — persisted UI-стейт). Кнопки «Новая цепочка» и «Добавить шаг»
 * (в прототипе «скоро») не переносятся — только доступные действия.
 */
export function TeamView() {
  const templatesQ = useChainTemplates();
  const [tplId, setTplId] = useState<string | null>(null);

  const loading = templatesQ.isPending;
  const error = templatesQ.isError ? templatesQ.error : null;
  const templates = templatesQ.data ?? [];
  const active = templates.find((t) => t.id === tplId) ?? templates[0];

  if (loading) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка команды">
        <Header />
        <Skeleton className="h-6 w-full max-w-md" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header />
        <ErrorState message={error.message} onRetry={() => void templatesQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Header />

      <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Шаблоны цепочек">
        <span className="section-label">Шаблоны:</span>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={active?.id === t.id}
            onClick={() => setTplId(t.id)}
            className={cn(
              "inline-flex h-8 items-center rounded-chip border px-3 text-xs font-medium transition-colors",
              active?.id === t.id ? "border-primary bg-accent-soft text-accent dark:text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            data-testid="team-tpl"
            data-tpl={t.id}
          >
            {t.name}
          </button>
        ))}
      </div>

      {active ? (
        <Card>
          <CardContent>
            <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
              <h2 className="text-[15px] font-medium">Цепочка: {active.name}</h2>
              <Badge variant="outline" className="text-[11px]">
                Демо
              </Badge>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="team-chain">
              {active.nodes.map((n, i) => (
                <ChainFragment key={n.role + n.name} role={n.role} name={n.name} arrow={i > 0} />
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <GitBranch className="size-3.5" aria-hidden />
                Результат каждого шага передаётся следующему AI-сотруднику по цепочке
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ChainFragment({ role, name, arrow }: { role: string; name: string; arrow: boolean }) {
  return (
    <>
      {arrow ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <div className="min-w-[130px] rounded-chip border border-border bg-muted px-3 py-2" data-testid="team-node">
        <div className="text-[11px] font-medium uppercase tracking-wide text-accent dark:text-foreground">{role}</div>
        <div className="mt-0.5 text-[13px]">{name}</div>
      </div>
    </>
  );
}

function Header() {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Команда</h1>
      <p className="mt-1 text-sm text-muted-foreground">Конструктор цепочек AI-сотрудников</p>
    </header>
  );
}
