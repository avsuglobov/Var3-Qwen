"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import type { ActivityPoint } from "@/lib/schemas";

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-border bg-popover px-3 py-2 text-xs shadow-pop">
      <div className="font-data mb-1 text-muted-foreground">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="font-data flex items-center gap-2">
          <span className="size-2 rounded-[1px]" style={{ background: p.color }} aria-hidden />
          <span>
            {p.name}: {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Столбчатая диаграмма активности. Цвета — только токены (CSS-переменные); текстовая таблица-дублёр для скринридеров. */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const reduced = useReducedMotion();
  return (
    <div>
      <div className="h-60 min-w-0" data-testid="activity-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 240 }}>
          <BarChart data={data} margin={{ top: 16, right: 8, left: -12, bottom: 0 }} barGap={4} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={ChartTooltip} />
            <Bar dataKey="ai" name="ИИ" fill="var(--primary)" radius={[2, 2, 0, 0]} isAnimationActive={!reduced} />
            <Bar dataKey="human" name="Человек" fill="var(--muted-foreground)" radius={[2, 2, 0, 0]} isAnimationActive={!reduced} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[1px] bg-primary" />
          ИИ
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[1px] bg-muted-foreground" />
          Человек
        </li>
      </ul>
      <div className="sr-only">
      <table>
        <caption>Активность за неделю: сообщения ИИ и человека по дням</caption>
        <thead>
          <tr>
            <th scope="col">День</th>
            <th scope="col">ИИ</th>
            <th scope="col">Человек</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.ai}</td>
              <td>{d.human}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
