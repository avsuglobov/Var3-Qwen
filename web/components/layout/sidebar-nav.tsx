"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav";
import { ru } from "@/lib/i18n/ru";
import { cn } from "@/lib/utils";

/** Навигация по разделам. В свёрнутом виде остаются иконки (подписи — для скринридеров и в title). */
export function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={ru.nav.label} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-3">
          <div className={cn("section-label px-3 pb-1.5 pt-2", collapsed && "sr-only")}>{group.label}</div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === `/${item.id}` || pathname.startsWith(`/${item.id}/`);
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={`/${item.id}`}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    onClick={onNavigate}
                    className={cn(
                      "transition-ui relative flex h-9 items-center gap-3 rounded-sm px-3 text-[13.5px] text-muted-foreground hover:bg-muted hover:text-foreground",
                      "aria-[current=page]:bg-accent-soft aria-[current=page]:text-foreground",
                      "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5 aria-[current=page]:before:bg-primary",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} aria-hidden />
                    <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
