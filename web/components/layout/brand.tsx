import { APP_NAME, APP_TAGLINE_SHORT } from "@/lib/config";
import { cn } from "@/lib/utils";

/** Слова с дефисом не переносим по дефису («ИИ-сотрудников» — одним куском). */
function NoHyphenBreak({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i}>
          {i > 0 ? " " : ""}
          {w.includes("-") ? <span className="whitespace-nowrap">{w}</span> : w}
        </span>
      ))}
    </>
  );
}

/** Логотип: монограмма + название из config. Без сторонних брендов и маскотов. */
export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border px-4", collapsed && "justify-center px-0")}>
      <div className="font-data flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-[13px] font-semibold text-primary-foreground" aria-hidden>
        AI
      </div>
      <div className={cn("min-w-0 leading-tight", collapsed && "sr-only")}>
        <div className="font-heading truncate text-[15px] font-semibold">{APP_NAME}</div>
        <div className="section-label leading-[1.25]">
          <NoHyphenBreak text={APP_TAGLINE_SHORT} />
        </div>
      </div>
    </div>
  );
}
