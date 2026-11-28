import { ApiError } from "@/lib/api/types";
import { guardApi } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readMailBlock, writeMailBlock } from "@/lib/server/secrets";

/**
 * Настройки опроса почты (этап 21): GET — состояние (просмотр всем вошедшим), PUT —
 * интервал в секундах (админ; 30–3600, дефолт 120 — решение этапа 21).
 */

export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  const block = readMailBlock();
  return Response.json({ pollIntervalSec: block?.pollIntervalSec ?? 120, accounts: block?.accounts.length ?? 0 });
}

export async function PUT(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as { pollIntervalSec?: unknown };
    const raw = body.pollIntervalSec;
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < 30 || value > 3600) {
      throw new ApiError("validation", "Интервал опроса — целое число секунд от 30 до 3600");
    }
    const block = readMailBlock();
    writeMailBlock({ accounts: block?.accounts ?? [], pollIntervalSec: value, cursors: block?.cursors, lastError: block?.lastError });
    return Response.json({ ok: true, pollIntervalSec: value });
  } catch (e) {
    return errorResponse(e);
  }
}
