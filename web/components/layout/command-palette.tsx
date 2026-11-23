"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { PanelLeft, SunMoon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/nav";
import { ru } from "@/lib/i18n/ru";
import { useUi } from "@/lib/stores/ui-store";

/** Поиск по подстроке (без «нечёткого» совпадения): название важнее описания, начало названия важнее середины. */
function rankItem(value: string, search: string, keywords?: string[]): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  const label = value.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (label.includes(q)) return 2;
  return keywords?.some((k) => k.toLowerCase().includes(q)) ? 1 : 0;
}

/** Командная палитра ⌘K / Ctrl+K: переход по разделам и быстрые действия. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPalette);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="overflow-hidden p-0">
        <DialogTitle className="sr-only">{ru.search.dialogTitle}</DialogTitle>
        <DialogDescription className="sr-only">{ru.search.placeholder}</DialogDescription>
        <Command filter={rankItem}>
          <CommandInput placeholder={ru.search.placeholder} aria-label={ru.search.dialogTitle} />
          <CommandList>
            <CommandEmpty>{ru.search.empty}</CommandEmpty>
            <CommandGroup heading={ru.search.groupSections}>
              {NAV_ITEMS.map((item) => (
                <CommandItem key={item.id} value={item.label} keywords={[item.description]} onSelect={() => run(() => router.push(`/${item.id}`))}>
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={ru.search.groupActions}>
              <CommandItem value="Переключить тему" keywords={["светлая", "тёмная", "оформление"]} onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
                <SunMoon aria-hidden />
                <span>{ru.theme.toggle}</span>
              </CommandItem>
              <CommandItem value={collapsed ? ru.topbar.expand : ru.topbar.collapse} keywords={["сайдбар", "навигация"]} onSelect={() => run(toggleSidebar)}>
                <PanelLeft aria-hidden />
                <span>{collapsed ? ru.topbar.expand : ru.topbar.collapse}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
