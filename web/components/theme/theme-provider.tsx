"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Тема по классу `dark` на <html>, по умолчанию «системная». next-themes вставляет блокирующий скрипт в <head>:
 * класс выставляется до первой отрисовки, поэтому нет мигания; на <html> стоит suppressHydrationWarning.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="aiws-theme" {...props}>
      {children}
    </NextThemesProvider>
  );
}
