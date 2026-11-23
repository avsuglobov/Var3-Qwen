"use client";

import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { useActivity } from "@/lib/api/hooks";
import { ru } from "@/lib/i18n/ru";

/** Recharts тяжёлый (~120 КБ): грузится отдельным чанком после первой отрисовки страницы. */
const ActivityChart = dynamic(() => import("@/components/charts/activity-chart").then((m) => m.ActivityChart), {
  ssr: false,
  loading: () => <Skeleton className="h-60" />
});

export function ActivityCard() {
  const q = useActivity();
  const hasData = !!q.data && q.data.some((d) => d.ai > 0 || d.human > 0);
  return (
    <Card data-testid="activity">
      <CardHeader>
        <CardTitle>Активность за неделю</CardTitle>
        <Badge className="ml-auto">{ru.placeholder.demo}</Badge>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <Skeleton className="h-60" />
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !hasData ? (
          <EmptyState title="Пока нет активности" hint="График появится, когда ИИ-сотрудники начнут отвечать клиентам." />
        ) : (
          <ActivityChart data={q.data} />
        )}
      </CardContent>
    </Card>
  );
}
