"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useOnboarding, useToggleOnboarding } from "@/lib/api/hooks";
import { onboardingProgress } from "@/lib/selectors/overview";
import { cn } from "@/lib/utils";

/** «С чего начать»: 7 шагов с прогрессом. Выполненный шаг — галочка (без зачёркивания), шаги переключаются мышью и клавиатурой. */
export function OnboardingCard() {
  const q = useOnboarding();
  const toggle = useToggleOnboarding();
  const progress = q.data ? onboardingProgress(q.data) : null;

  return (
    <Card data-testid="onboarding">
      <CardHeader>
        <CardTitle>С чего начать</CardTitle>
        {progress ? <Badge className="font-data ml-auto">{progress.percent}%</Badge> : null}
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Загрузка шагов">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState title="Шагов пока нет" hint="Список появится после настройки рабочего пространства." />
        ) : (
          <>
            <div
              role="progressbar"
              aria-label="Прогресс настройки"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percent ?? 0}
              className="mb-4 h-1.5 overflow-hidden rounded-chip bg-muted"
            >
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <ul className="divide-y divide-border">
              {q.data.map((step, i) => (
                <li key={step.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={step.done}
                    onClick={() => toggle.mutate({ id: step.id, done: !step.done })}
                    className="transition-ui flex w-full items-center gap-3 rounded-sm px-1 py-2.5 text-left hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "font-data flex size-6 shrink-0 items-center justify-center rounded-sm border text-xs",
                        step.done ? "border-status bg-status text-on-critical" : "border-border text-muted-foreground"
                      )}
                      aria-hidden
                    >
                      {step.done ? <Check className="size-4" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{step.name}</span>
                    <span className="section-label shrink-0">{step.done ? "Готово" : "В процессе"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {toggle.isError ? (
              <p role="alert" className="mt-3 text-sm text-muted-foreground">
                Не удалось сохранить отметку: {toggle.error.message}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
