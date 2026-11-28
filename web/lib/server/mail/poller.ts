import { mailPollTick } from "@/lib/server/mail/ingest";
import { readMailBlock } from "@/lib/server/secrets";

/**
 * Планировщик фонового опроса почты (этап 21): тот же паттерн, что auto-sync этапа 13 —
 * in-process setInterval из instrumentation.ts, идемпотентность через globalThis (dev-HMR
 * не создаёт второй таймер), таймер не держит процесс. Интервал — pollIntervalSec блока
 * mail (дефолт 2 минуты, решение этапа 21; минимум 30 с); первый тик — после полного
 * интервала. Ограничение «1 инстанс» — как у авто-синка (планировщик в процессе).
 */

const globalMail = globalThis as unknown as { __aiwsMailTimer?: NodeJS.Timeout };

/** Запускает планировщик; повторные вызовы второй таймер не создают. */
export function startMailPoller(): void {
  if (globalMail.__aiwsMailTimer) return;
  // Интервал фиксируется при старте сервера; смена в Настройках применяется к тикам логики
  // (pollIntervalSec читается на каждом тике) и после перезапуска процесса.
  const timer = setInterval(() => {
    void mailPollTickSafe();
  }, 60_000);
  timer.unref?.();
  globalMail.__aiwsMailTimer = timer;
}

/** Один тик планировщика: интервал из блока mail проверяется на каждом тике (60 с сетка). */
export async function mailPollTickSafe(): Promise<void> {
  try {
    const block = readMailBlock();
    if (!block || block.accounts.length === 0) return;
    if ((block.pollIntervalSec ?? 120) > 60) {
      // Простая сетка: тикаем «через раз» по фактической минуте, чтобы уважать интервал > 1 мин.
      const minute = Math.floor(Date.now() / 60_000);
      if (minute % Math.max(1, Math.round((block.pollIntervalSec ?? 120) / 60)) !== 0) return;
    }
    await mailPollTick();
  } catch (e) {
    console.warn(`[mail] тик опроса не выполнен: ${e instanceof Error ? e.message.slice(0, 200) : "неизвестная ошибка"}`);
  }
}
