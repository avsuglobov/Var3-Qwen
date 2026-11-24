/** Тестовый сборщик .xlsx/.zip (Node): пары к tests/lib/xlsx-build.mjs. */
export function buildZip(
  entries: { name: string; data: Buffer | string; store?: boolean; claimUsize?: number; garbage?: boolean }[]
): Buffer;

export function buildXlsx(
  rows: unknown[][],
  o?: { store?: boolean; entryOpts?: Record<string, { claimUsize?: number; garbage?: boolean }> }
): Buffer;
