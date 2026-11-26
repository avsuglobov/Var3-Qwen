import { errorResponse, readJsonBody } from "@/lib/server/store";
import { runIntegration } from "@/lib/server/integrations";
import { guardApi } from "@/lib/server/auth";

/**
 * POST /api/integrations/check — проверка связи с внешним сервисом (этап 8).
 * Тело: { integrationId }. Выполняет реальный HTTP-вызов адаптера, пишет прогон в журнал
 * и возвращает его запись. Итог связи ok:false — это обычный 200-ответ с результатом;
 * 4xx означает, что прогон не состоялся (нет адаптера, не заданы ключи, битое тело).
 */
export async function POST(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as { integrationId?: unknown };
    if (typeof body.integrationId !== "string" || body.integrationId.length === 0 || body.integrationId.length > 40) {
      return Response.json({ code: "validation", message: "Не указан integrationId" }, { status: 400 });
    }
    const run = await runIntegration(body.integrationId, "check");
    return Response.json({ run });
  } catch (e) {
    return errorResponse(e);
  }
}
