"use client";

import { ArrowRight } from "lucide-react";
import { Fragment } from "react";
import { Card } from "@/components/ui/card";

/**
 * Сценарий реактивации базы (прототип `sections2.js` leads()): цепочка
 * «Пользователь → ИИ · Продажи → Менеджер» и три KPI-карточки; два из них —
 * «—» с пометкой (автокасания появятся на своих этапах, как в прототипе).
 */

export function ReactivationCard({ importedCount, agentName }: { importedCount: number | null; agentName: string }) {
  const nodes: { role: string; name: string }[] = [
    { role: "Пользователь", name: "Контакты из базы" },
    { role: `ИИ · ${agentName}`, name: "Автокасания по сценарию" },
    { role: "Менеджер", name: "Передача заинтересованных" }
  ];
  const kpis: { label: string; value: number | null; hint: string; emptyHint: string; testid: string }[] = [
    {
      label: "Импортировано контактов",
      value: importedCount,
      hint: "Лиды из файлов, в CRM",
      emptyHint: "Импортируйте файл",
      testid: "leads-kpi-imported"
    },
    { label: "Автокасаний запущено", value: null, hint: "", emptyHint: "Автокасания появятся позже (демо)", testid: "leads-kpi-touches" },
    { label: "Передано менеджеру", value: null, hint: "", emptyHint: "По ответу клиента", testid: "leads-kpi-handoff" }
  ];
  return (
    <Card className="p-5" data-testid="leads-reactivation">
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="leads-chain">
        {nodes.map((n, i) => (
          <Fragment key={n.role}>
            {i > 0 ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
            <span className="min-w-0 rounded-card border border-border bg-muted p-3 text-center">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground-strong">{n.role}</span>
              <span className="block text-sm font-medium">{n.name}</span>
            </span>
          </Fragment>
        ))}
      </div>
      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0 rounded-card border border-border p-4" data-testid={k.testid} data-kpi={k.label}>
            <div className="section-label">{k.label}</div>
            <div className="mt-2 font-data text-[30px] font-medium leading-none" aria-label={k.value === null ? "нет данных" : undefined}>
              {k.value === null ? "—" : k.value}
            </div>
            <div className="mt-3 text-[12.5px] text-muted-foreground">{k.value === null ? k.emptyHint : k.hint}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
