"use client";

import * as React from "react";
import { STATUS_META } from "@/lib/selectors/agents";
import type { AgentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Статус сотрудника: точка + текстовая подпись (не только цветом). Критичный цвет — только у точки. */
export function AgentStatus({ status, className, ...rest }: { status: AgentStatus; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px]", meta.textClass, className)} {...rest}>
      <span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} aria-hidden />
      {meta.label}
    </span>
  );
}
