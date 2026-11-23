"use client";

import { useEffect, useState } from "react";
import { formatUtc } from "@/lib/clock";

/** Живые часы UTC. На сервере и при первой отрисовке — заглушка, поэтому нет расхождения разметки (hydration). */
export function UtcClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setTime(formatUtc(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="font-data hidden items-center gap-2 border-b border-transparent text-xs text-muted-foreground md:flex dark:border-primary dark:text-foreground" aria-label="Время UTC">
      <span className="section-label">UTC</span>
      <time suppressHydrationWarning>{time ?? "--:--:--"}</time>
    </div>
  );
}
