"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ru } from "@/lib/i18n/ru";

/** Иконка выбирается CSS-классом dark:, а не состоянием — разметка сервера и клиента совпадает (без hydration-ошибок). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={ru.theme.toggle}>
          <Sun className="hidden dark:block" aria-hidden />
          <Moon className="dark:hidden" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{ru.theme.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">{ru.theme.light}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{ru.theme.dark}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{ru.theme.system}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
