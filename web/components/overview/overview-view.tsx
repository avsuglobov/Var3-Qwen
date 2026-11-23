"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { ActivityCard } from "@/components/overview/activity-card";
import { JournalCard } from "@/components/overview/journal-card";
import { KpiSection } from "@/components/overview/kpi-section";
import { OnboardingCard } from "@/components/overview/onboarding-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OverviewView() {
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight">Обзор</h1>
          <p className="mt-1 text-sm text-muted-foreground">Сводка по работе AI-сотрудников и текущая активность</p>
        </div>
        <Button variant="secondary" onClick={() => void qc.invalidateQueries()} aria-busy={fetching}>
          <RefreshCw className={cn(fetching && "animate-spin")} aria-hidden />
          Обновить
        </Button>
      </header>

      <KpiSection />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ActivityCard />
        <OnboardingCard />
      </div>

      <JournalCard />
    </div>
  );
}
