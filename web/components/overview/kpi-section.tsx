"use client";

import { FileText, MessageSquare, UserCheck, Users } from "lucide-react";
import { KpiCard } from "@/components/overview/kpi-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useConversations, useDocuments, useLeads } from "@/lib/api/hooks";
import { computeKpis } from "@/lib/selectors/overview";

/** Четыре карточки-сводки. Состояния: загрузка (скелетон), ошибка (с «Повторить»), нет данных («—» и подсказка), успех. */
export function KpiSection() {
  const leads = useLeads();
  const documents = useDocuments();
  const conversations = useConversations();
  const queries = [leads, documents, conversations];
  const failed = queries.find((q) => q.isError);

  if (failed?.error) {
    return (
      <Card>
        <ErrorState message={failed.error.message} onRetry={() => queries.forEach((q) => { if (q.isError) void q.refetch(); })} />
      </Card>
    );
  }
  if (!leads.data || !documents.data || !conversations.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Загрузка сводки">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-card" />)}
      </div>
    );
  }
  const k = computeKpis(leads.data, documents.data, conversations.data);
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Лиды за период" value={k.leads} icon={Users} hint={`В базе сейчас: ${k.leads}`} emptyHint="Лиды появятся после подключения каналов" />
      <KpiCard label="Созданные счета" value={k.documents} icon={FileText} hint="ИИ готовит по шаблону" emptyHint="Счета появятся, когда ИИ подготовит первый документ" />
      <KpiCard label="Сообщения от ИИ" value={k.aiMessages} icon={MessageSquare} hint="Ответы из базы знаний" emptyHint="Подключите канал и включите ИИ-сотрудника" />
      <KpiCard
        label="Передано менеджеру"
        value={k.handedOff}
        icon={UserCheck}
        critical={k.escalated > 0}
        hint={k.escalated > 0 ? "Есть эскалация (КРИТИЧНО)" : "Передача по правилам"}
        emptyHint="Передачи появятся по правилам согласования"
      />
    </div>
  );
}
