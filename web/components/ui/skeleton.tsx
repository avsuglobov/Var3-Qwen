import { cn } from "@/lib/utils";

/** Заглушка загрузки; анимация гасится глобальным правилом prefers-reduced-motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-muted", className)} />;
}
