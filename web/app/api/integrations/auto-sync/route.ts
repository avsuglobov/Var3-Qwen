import { ApiError } from "@/lib/api/types";
import { adapterOf } from "@/lib/integrations/adapters";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { autoSyncEnabledOf, saveAutoSync } from "@/lib/server/secrets";

/**
 * Тумблер авто-синхронизации (этап 14). Состояние — блок autoSync в .data/secrets.json
 * (рядом с ключами и курсорами, вне снимка данных); записи нет — авто-синхронизация
 * включена (сохраняет поведение этапа 13). Планировщик читает флаг на каждом тике.
 */

function requireIntegrationId(req: Request): string {
  const id = new URL(req.url).searchParams.get("integrationId") ?? "";
  if (id.length === 0 || id.length > 40) throw new ApiError("validation", "Не указан integrationId");
  return id;
}

/** GET /api/integrations/auto-sync?integrationId=… — текущее состояние тумблера. */
export async function GET(req: Request) {
  try {
    const integrationId = requireIntegrationId(req);
    if (!adapterOf(integrationId)) throw new ApiError("not_found", `Для интеграции ${integrationId} адаптер пока не реализован`);
    return Response.json({ integrationId, enabled: autoSyncEnabledOf(integrationId) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/integrations/auto-sync — переключает тумблер: { integrationId, enabled }. */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { integrationId?: unknown; enabled?: unknown };
    if (typeof body.integrationId !== "string" || body.integrationId.length === 0 || body.integrationId.length > 40) {
      throw new ApiError("validation", "Не указан integrationId");
    }
    if (!adapterOf(body.integrationId)) throw new ApiError("not_found", `Для интеграции ${body.integrationId} адаптер пока не реализован`);
    if (typeof body.enabled !== "boolean") throw new ApiError("validation", "Поле enabled должно быть булевым");
    saveAutoSync(body.integrationId, body.enabled);
    return Response.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    return errorResponse(e);
  }
}
