import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/config";

/** Каркас приложения. Свёрнутость сайдбара читается из куки на сервере — разметка сразу правильная, без «прыжка». */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";
  return <AppShell initialCollapsed={collapsed}>{children}</AppShell>;
}
