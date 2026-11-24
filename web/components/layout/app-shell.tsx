"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Brand } from "@/components/layout/brand";
import { CommandPalette } from "@/components/layout/command-palette";
import { Grain } from "@/components/layout/grain";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Topbar } from "@/components/layout/topbar";
import { TRIAL_DAYS } from "@/lib/config";
import { ru } from "@/lib/i18n/ru";
import { UiStoreProvider, useUi } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

function Shell({ children }: { children: ReactNode }) {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobileNav = useUi((s) => s.setMobileNav);
  const rootRef = useRef<HTMLDivElement>(null);

  // Этап 5 (a11y): Radix (Dialog, DropdownMenu) скрывает фон через aria-hidden (hideOthers),
  // но не ставит inert — скрытые кнопки и ссылки остаются доступными клавиатуре и скринридерам
  // (axe: aria-hidden-focus). Дублируем скрытие: aria-hidden на корне → корень же inert.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => { root.inert = root.getAttribute("aria-hidden") === "true"; };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(root, { attributes: true, attributeFilter: ["aria-hidden"] });
    return () => { obs.disconnect(); root.inert = false; };
  }, []);

  return (
    <div ref={rootRef} className="flex min-h-dvh">
      <a href="#main" className="skip-link">
        {ru.skipToContent}
      </a>

      {/* Десктоп: сворачиваемый сайдбар (ширина из токенов) */}
      <aside
        className="transition-width sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-card lg:flex"
        style={{ width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)" }}
      >
        <Brand collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} />
        <div className={cn("section-label flex h-12 shrink-0 items-center gap-2 border-t border-border px-4", collapsed && "justify-center px-0")}>
          <span className="size-2 shrink-0 rounded-sm bg-primary" aria-hidden />
          <span className={cn("truncate", collapsed && "sr-only")}>
            {ru.topbar.trial} · {TRIAL_DAYS} {ru.topbar.trialDays}
          </span>
        </div>
      </aside>

      {/* Планшет и мобильный: sidebar превращается в drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileNav}>
        <SheetContent>
          <SheetTitle className="sr-only">{ru.nav.drawerTitle}</SheetTitle>
          <SheetDescription className="sr-only">{ru.nav.label}</SheetDescription>
          <Brand />
          <SidebarNav collapsed={false} onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className="app-main min-w-0 flex-1 outline-none">
          <div className="mx-auto w-full min-w-0 max-w-[var(--content-max)] px-6 py-7 lg:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette />
      <Grain />
    </div>
  );
}

export function AppShell({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  return (
    <UiStoreProvider initialCollapsed={initialCollapsed}>
      <Shell>{children}</Shell>
    </UiStoreProvider>
  );
}
