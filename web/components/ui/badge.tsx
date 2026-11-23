import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Бейдж/чип. Статус не передаётся только цветом: точка всегда рядом с текстом. */
const badgeVariants = cva(
  "section-label on-elevated inline-flex items-center gap-1.5 rounded-chip border border-border px-2 py-0.5 leading-4",
  { variants: { variant: { default: "bg-muted", outline: "bg-transparent" } }, defaultVariants: { variant: "default" } }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
