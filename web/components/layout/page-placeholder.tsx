import { Badge } from "@/components/ui/badge";
import { findNavItem } from "@/lib/nav";
import { ru } from "@/lib/i18n/ru";

/** Временная страница раздела до его реализации (этап указан в плане MIGRATION.md). */
export function PagePlaceholder({ id }: { id: string }) {
  const item = findNavItem(id);
  if (!item) throw new Error(`Неизвестный раздел: ${id}`);
  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <h1 className="text-[28px] leading-tight">{item.label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
      </header>
      <section className="min-w-0 rounded-card border border-border bg-card p-6" aria-labelledby={`ph-${id}`}>
        <div className="mb-2 flex items-center gap-3">
          <h2 id={`ph-${id}`} className="text-base">
            {ru.placeholder.soon} {item.stage}
          </h2>
          <Badge>{ru.placeholder.demo}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {ru.placeholder.reference} «{item.label}» (папка <code className="font-data text-[13px]">download</code>).
        </p>
      </section>
    </div>
  );
}
