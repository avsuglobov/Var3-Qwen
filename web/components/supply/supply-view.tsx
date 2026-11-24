"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useSupplyOffers, useSupplyRequests } from "@/lib/api/hooks";

/**
 * Раздел «Снабжение» (этап 3, группа 7) — поведение supply() прототипа: таблица запросов
 * поставщикам (ID, запрос, поставщиков/ответов, статус с dot у «Сводка готова»), сводная
 * таблица условий без цен («Цены не показываются (демо)»). Кнопки «Открыть», «Передать
 * результат», «Новый запрос» (в прототипе «скоро») не переносятся — только доступные действия.
 */
export function SupplyView() {
  const requestsQ = useSupplyRequests();
  const offersQ = useSupplyOffers();

  const loading = requestsQ.isPending || offersQ.isPending;
  const error = requestsQ.isError ? requestsQ.error : offersQ.isError ? offersQ.error : null;

  if (loading) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка снабжения">
        <Header />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header />
        <ErrorState message={error.message} onRetry={() => { void requestsQ.refetch(); void offersQ.refetch(); }} />
      </div>
    );
  }

  const requests = requestsQ.data ?? [];
  const offers = offersQ.data ?? [];

  return (
    <div className="min-w-0 space-y-6">
      <Header />

      <section className="min-w-0" aria-label="Запросы поставщикам">
        <h2 className="section-label mb-2">Запросы</h2>
        <Card>
          <CardContent>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm" data-testid="supply-requests">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 pr-3 font-medium">Запрос</th>
                    <th className="py-2 pr-3 font-medium">Поставщиков</th>
                    <th className="py-2 pr-3 font-medium">Ответов</th>
                    <th className="py-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-b-0" data-testid="supply-request" data-request={r.id}>
                      <td className="py-2.5 pr-3 font-data text-xs">{r.id}</td>
                      <td className="py-2.5 pr-3">{r.item}</td>
                      <td className="py-2.5 pr-3 font-data text-xs">{r.suppliers}</td>
                      <td className="py-2.5 pr-3 font-data text-xs">{r.replies}</td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[11px]">
                          {r.status === "Сводка готова" ? <span className="size-1.5 rounded-full bg-status" aria-hidden /> : null}
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="min-w-0" aria-label="Сводная таблица условий">
        <h2 className="section-label mb-2">Сводная таблица условий</h2>
        <Card>
          <CardContent>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm" data-testid="supply-offers">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Поставщик</th>
                    <th className="py-2 pr-3 font-medium">Срок</th>
                    <th className="py-2 font-medium">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.supplier} className="border-b border-border last:border-b-0" data-testid="supply-offer" data-supplier={o.supplier}>
                      <td className="py-2.5 pr-3">{o.supplier}</td>
                      <td className="py-2.5 pr-3 font-data text-xs">{o.term}</td>
                      <td className="py-2.5 text-muted-foreground">{o.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <AlertTriangle className="size-3.5" aria-hidden />
              Цены не показываются (демо). ИИ готовит сравнение по сроку и условиям.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Header() {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Снабжение</h1>
      <p className="mt-1 text-sm text-muted-foreground">Запросы поставщикам и сводка условий</p>
    </header>
  );
}
