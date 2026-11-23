import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { fontVariables } from "@/lib/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${APP_TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={fontVariables}>
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
