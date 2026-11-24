"use client";

import { useEffect, useState } from "react";
import { Bell, Menu, PanelLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UtcClock } from "@/components/layout/utc-clock";
import { useShellStats } from "@/lib/api/hooks";
import { TRIAL_DAYS } from "@/lib/config";
import { ru } from "@/lib/i18n/ru";
import { useUi } from "@/lib/stores/ui-store";

/** Верхняя панель: меню, свернуть сайдбар, поиск ⌘K, часы UTC, статус агентов, пробный период, уведомления, тема, аватар. */
export function Topbar() {
  const setMobileNav = useUi((s) => s.setMobileNav);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setPalette = useUi((s) => s.setPalette);
  const [shortcut, setShortcut] = useState("⌘K");
  useEffect(() => {
    if (!/mac|iphone|ipad/i.test(navigator.platform)) setShortcut("Ctrl K");
  }, []);
  const { agentsOnline, agentsTotal, unread } = useShellStats();
  const loaded = agentsTotal !== undefined && agentsOnline !== undefined;
  const agentsLabel = loaded ? `${agentsOnline} / ${agentsTotal}` : `${ru.topbar.loading} / ${ru.topbar.loading}`;

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-border bg-background px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label={ru.topbar.openMenu} onClick={() => setMobileNav(true)}>
        <Menu aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={collapsed ? ru.topbar.expand : ru.topbar.collapse} aria-pressed={collapsed} onClick={toggleSidebar}>
        <PanelLeft aria-hidden />
      </Button>

      <button
        type="button"
        onClick={() => setPalette(true)}
        // имя содержит видимый текст + шорткат подряд и без скобок (axe label-content-name-mismatch:
        // токены «лидам Ctrl K» должны идти в имени неразрывно, скобки axe вырезает)
        aria-label={`${ru.search.placeholder} ${shortcut} — открыть палитру команд`}
        className="transition-ui flex h-9 min-w-0 max-w-[440px] flex-1 items-center gap-2 rounded-sm border border-border bg-card px-3 text-left text-[13px] text-muted-foreground hover:border-border-strong"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{ru.search.placeholder}</span>
        <kbd aria-hidden className="font-data hidden shrink-0 rounded-sm border border-border px-1.5 text-[11px] sm:inline">{shortcut}</kbd>
      </button>

      <UtcClock />

      <div className="font-data hidden items-center gap-2 text-xs text-muted-foreground lg:flex" aria-label={loaded ? `${agentsOnline} из ${agentsTotal} ${ru.topbar.agents} ${ru.topbar.agentsOnline}` : "Статус агентов загружается"}>
        <span className="size-2 rounded-chip bg-status" aria-hidden />
        <span>
          {agentsLabel} {ru.topbar.agents}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="section-label hidden items-center gap-2 whitespace-nowrap xl:flex">
          <span className="size-2 rounded-sm bg-primary" aria-hidden />
          <span>
            {ru.topbar.trial} · {TRIAL_DAYS} {ru.topbar.trialDays}
          </span>
        </div>

        <Button variant="ghost" size="icon" className="relative" aria-label={`${ru.topbar.notifications}: ${unread ?? ru.topbar.loading}`}>
          <Bell aria-hidden />
          {unread ? (
            <span className="font-data absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-chip bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground" aria-hidden>
              {unread}
            </span>
          ) : null}
        </Button>
        <ThemeToggle />
        <div className="font-data flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-xs font-semibold" role="img" aria-label={ru.topbar.demoUser}>
          {ru.topbar.demoMonogram}
        </div>
      </div>
    </header>
  );
}
