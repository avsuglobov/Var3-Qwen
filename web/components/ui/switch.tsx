"use client";

import { cn } from "@/lib/utils";

/**
 * Переключатель (role=switch) — как .switch прототипа: клик мышью, пробел и Enter
 * работают (обработчик onKeyDown с preventDefault), aria-checked синхронна.
 */
export function Switch({ checked, onCheckedChange, label, testId }: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onCheckedChange(!checked); } }}
      className={cn("inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors", checked ? "border-primary bg-primary" : "border-border bg-muted")}
      data-testid={testId}
    >
      <span className={cn("mx-0.5 size-4 rounded-full bg-card shadow-sm transition-transform", checked && "translate-x-4")} aria-hidden />
    </button>
  );
}
