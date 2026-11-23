"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** TanStack Query: данные приходят через слой lib/api. Повторов нет — ошибка показывается сразу с кнопкой «Повторить». */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
