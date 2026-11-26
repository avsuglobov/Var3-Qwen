/**
 * Этап 13: точка старта серверного планировщика авто-синхронизации. register() Next.js
 * вызывает один раз при поднятии сервера (`next start` и dev); в edge-рантайме, на сборке
 * и в unit-тестах планировщик не стартует. Повторный вызов и dev-HMR безопасны: таймер
 * идемпотентен в startAutoSync (globalThis).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSync } = await import("@/lib/server/auto-sync");
    startAutoSync();
  }
}
