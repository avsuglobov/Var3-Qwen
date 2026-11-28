/**
 * Этап 13: точка старта серверных планировщиков — авто-синхронизации (этапы 13–14) и
 * фонового опроса почты (этап 21). register() Next.js вызывает один раз при поднятии
 * сервера (`next start` и dev); в edge-рантайме, на сборке и в unit-тестах планировщики
 * не стартуют. Повторный вызов и dev-HMR безопасны: таймеры идемпотентны в startAutoSync
 * и startMailPoller (globalThis).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSync } = await import("@/lib/server/auto-sync");
    startAutoSync();
    const { startMailPoller } = await import("@/lib/server/mail/poller");
    startMailPoller();
  }
}
