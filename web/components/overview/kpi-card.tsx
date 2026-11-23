import { AlertTriangle, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ru } from "@/lib/i18n/ru";

/** Карточка-сводка. Нет данных — «—» и подсказка; критичное (эскалация) помечено иконкой и текстом, а не только цветом. */
export function KpiCard({ label, value, hint, emptyHint, critical = false, icon: Icon }: {
  label: string;
  value: number | null;
  hint: string;
  emptyHint: string;
  critical?: boolean;
  icon: LucideIcon;
}) {
  const empty = value === null || value === 0;
  return (
    <Card className="p-5" data-kpi={label}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <span className="section-label">{label}</span>
        <Badge className="ml-auto">{ru.placeholder.demo}</Badge>
      </div>
      <div className="font-data text-[30px] font-medium leading-none" aria-label={empty ? "нет данных" : undefined}>
        {empty ? "—" : value}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {critical ? <AlertTriangle className="size-3.5 shrink-0 text-critical" aria-hidden /> : <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />}
        <span>{empty ? emptyHint : hint}</span>
      </div>
    </Card>
  );
}
