import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/types";
import { AUTO_SYNC_INTERVAL_MS, autoSyncTick, startAutoSync } from "@/lib/server/auto-sync";
import { acquireRunLock, releaseRunLock, runIntegration } from "@/lib/server/integrations";
import { readRuns } from "@/lib/server/runs";
import { autoSyncEnabledOf, saveAutoSync, saveCredentials } from "@/lib/server/secrets";

/* Этап 13 — планировщик авто-синхронизации: тик по подключённым интеграциям (ключи сохранены),
   пропуск занятых, блокировка параллельных прогонов и идемпотентный старт таймера.
   Этап 14 — тумблер «Автосинхронизация» (состояние в secrets.json) и приписка trigger:
   тик помечает прогоны «auto», ручной прогон — «manual», старый журнал без поля читается.
   Сеть не нужна: в тестах подключается демо-источник int-demo (адаптер без сети). */

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "aiws-auto-"));
  process.env.AIWS_DATA_DIR = dataDir;
});
afterEach(() => {
  const g = globalThis as unknown as { __aiwsAutoSyncTimer?: NodeJS.Timeout };
  if (g.__aiwsAutoSyncTimer) {
    clearInterval(g.__aiwsAutoSyncTimer);
    delete g.__aiwsAutoSyncTimer;
  }
  releaseRunLock("int-demo");
  vi.useRealTimers();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.AIWS_DATA_DIR;
});

describe("планировщик авто-синхронизации (этап 13)", () => {
  it("интервал авто-синхронизации — 15 минут", () => {
    expect(AUTO_SYNC_INTERVAL_MS).toBe(15 * 60 * 1000);
  });

  it("тик без подключённых интеграций прогонов не создаёт", async () => {
    await autoSyncTick();
    expect(readRuns()).toEqual([]);
  });

  it("тик синхронизирует интеграцию с сохранёнными ключами: прогон в общем журнале, как у ручного", async () => {
    saveCredentials("int-demo", {});
    await autoSyncTick();
    const runs = readRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ integrationId: "int-demo", action: "sync", ok: true, status: 200 });
    expect(runs[0].detail).toContain("импортировано 3");
  });

  it("занятая интеграция тиком пропускается: параллельный прогон не стартует", async () => {
    saveCredentials("int-demo", {});
    expect(acquireRunLock("int-demo")).toBe(true);
    await autoSyncTick();
    expect(readRuns()).toEqual([]);
    releaseRunLock("int-demo");
    await autoSyncTick(); // следующий тик после освобождения — прогон выполняется
    expect(readRuns()).toHaveLength(1);
  });

  it("runIntegration при занятой интеграции — 409 duplicate, прогон в журнал не пишется", async () => {
    saveCredentials("int-demo", {});
    acquireRunLock("int-demo");
    const err = await runIntegration("int-demo", "sync").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("duplicate");
    expect(readRuns()).toEqual([]);
  });

  it("startAutoSync идемпотентен: два вызова — один тик за интервал", async () => {
    saveCredentials("int-demo", {});
    vi.useFakeTimers();
    startAutoSync();
    startAutoSync();
    await vi.advanceTimersByTimeAsync(AUTO_SYNC_INTERVAL_MS);
    expect(readRuns()).toHaveLength(1);
  });
});

describe("тумблер и приписка авто-синхронизации (этап 14)", () => {
  it("без записи тумблер включён (поведение этапа 13); saveAutoSync переключает и переживает перечитывание", () => {
    expect(autoSyncEnabledOf("int-demo")).toBe(true);
    saveAutoSync("int-demo", false);
    expect(autoSyncEnabledOf("int-demo")).toBe(false);
    saveAutoSync("int-demo", true);
    expect(autoSyncEnabledOf("int-demo")).toBe(true);
  });

  it("тик пропускает интеграцию с выключенной авто-синхронизацией и выполняет её после включения", async () => {
    saveCredentials("int-demo", {});
    saveAutoSync("int-demo", false);
    await autoSyncTick();
    expect(readRuns()).toEqual([]);
    saveAutoSync("int-demo", true);
    await autoSyncTick();
    expect(readRuns()).toHaveLength(1);
  });

  it("прогоны тика в журнале помечены trigger «auto»", async () => {
    saveCredentials("int-demo", {});
    await autoSyncTick();
    expect(readRuns()[0]?.trigger).toBe("auto");
  });

  it("ручной runIntegration помечен trigger «manual» (по умолчанию)", async () => {
    saveCredentials("int-demo", {});
    const run = await runIntegration("int-demo", "sync");
    expect(run.trigger).toBe("manual");
    expect(readRuns()[0]?.trigger).toBe("manual");
  });

  it("записи журнала до этапа 14 без trigger читаются — совместимость со старыми файлами", () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      path.join(dataDir, "integration-runs.json"),
      JSON.stringify([{ id: "r1", integrationId: "int-demo", action: "sync", ok: true, detail: "прогон этапа 13", status: 200, latencyMs: 2, at: 1700000000000 }])
    );
    const runs = readRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.trigger).toBeUndefined();
    expect(runs[0]?.detail).toBe("прогон этапа 13");
  });
});
