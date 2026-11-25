import fs from "node:fs";
import path from "node:path";
import { integrationRunSchema, type IntegrationRun } from "@/lib/integrations/types";

/**
 * Журнал прогонов интеграций (этап 8): `.data/integration-runs.json`, вне снимка данных —
 * это операционная история, а не пользовательские данные: в экспорт/импорт она не входит.
 * Запись атомарная (tmp + rename), новые прогоны сверху, журнал ограничен MAX_RUNS.
 */

const RUNS_FILE = "integration-runs.json";
const MAX_RUNS = 100;

function runsPath(): string {
  return path.join(process.env.AIWS_DATA_DIR ?? path.join(process.cwd(), ".data"), RUNS_FILE);
}

/** Журнал прогонов; файла нет или он бит — пустой список (битые записи отбрасываются). */
export function readRuns(): IntegrationRun[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(runsPath(), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((r) => {
      const p = integrationRunSchema.safeParse(r);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  }
}

/** Дописывает прогон в журнал (новые сверху) и возвращает обновлённый список. */
export function appendRun(run: IntegrationRun): IntegrationRun[] {
  const runs = [run, ...readRuns()].slice(0, MAX_RUNS);
  fs.mkdirSync(path.dirname(runsPath()), { recursive: true });
  const tmp = `${runsPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(runs), { mode: 0o600 });
  fs.renameSync(tmp, runsPath());
  return runs;
}
