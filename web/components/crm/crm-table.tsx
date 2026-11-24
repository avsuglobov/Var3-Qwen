"use client";

import { Filter } from "lucide-react";
import { ChannelGlyph } from "@/components/agents/channel-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CRM_SORTS, type TableSort } from "@/lib/selectors/crm";
import type { Agent, Channel, Lead, Stage } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Вид «Таблица» раздела CRM (этап 3, группа 3): фильтр по стадиям (чипы), сортировка
 * ID → Имя → Активность, клик или Enter по строке открывает лид в журнале — как crmTable прототипа.
 */
export function CrmTable({
  leads,
  stages,
  channels,
  agents,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  onSelect
}: {
  leads: readonly Lead[];
  stages: readonly Stage[];
  channels: Record<string, Channel>;
  agents: readonly Agent[];
  filter: string;
  onFilterChange: (stageId: string) => void;
  sort: TableSort;
  onSortChange: () => void;
  onSelect: (leadId: string) => void;
}) {
  const sortLabel = CRM_SORTS.find((s) => s.id === sort)?.label ?? "ID";
  const chip = (id: string, name: string): React.ReactElement => (
    <button
      key={id}
      type="button"
      aria-pressed={filter === id}
      onClick={() => onFilterChange(id)}
      className={cn(
        "rounded-chip border px-2.5 py-1 text-[12px] font-medium",
        filter === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
      data-testid="crm-stage-filter"
      data-filter={id}
    >
      {name}
    </button>
  );
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="section-label">Фильтр:</span>
        {chip("all", "Все")}
        {stages.map((s) => chip(s.id, s.name))}
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onSortChange} title="Сменить сортировку" data-testid="crm-sort-btn">
          <Filter aria-hidden />
          Сортировка: {sortLabel}
        </Button>
      </div>
      <div className="overflow-x-auto" data-testid="crm-table-wrap">
        <table className="w-full min-w-max border-collapse text-sm" data-testid="crm-table">
          <thead>
            <tr className="border-b border-border text-left">
              {["ID", "Лид", "Канал", "Стадия", "Агент", "Активность"].map((h) => (
                <th key={h} className="section-label px-3 py-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground" data-testid="crm-table-empty">
                  Нет лидов на выбранной стадии
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  tabIndex={0}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onSelect(lead.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelect(lead.id);
                  }}
                  data-testid="crm-table-row"
                  data-lead={lead.id}
                >
                  <td className="font-data px-3 py-2.5">{lead.id}</td>
                  <td className="px-3 py-2.5">{lead.name}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <ChannelGlyph name={channels[lead.channel]?.icon ?? ""} />
                      {channels[lead.channel]?.name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline">
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                      {stages.find((s) => s.id === lead.stageId)?.name ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{agents.find((a) => a.id === lead.agentId)?.name ?? "—"}</td>
                  <td className="font-data px-3 py-2.5">{lead.lastActivity ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
