import { errorResponse, readJsonBody } from "@/lib/server/store";
import { runIntegration } from "@/lib/server/integrations";
import { guardApi } from "@/lib/server/auth";

/**
 * POST /api/integrations/sync — синхронизация с внешним сервисом (этап 8).
 * Тело и контракты — как у /api/integrations/check, действие адаптера — sync.
 */
export async function POST(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as { integrationId?: unknown };
    if (typeof body.integrationId !== "string" || body.integrationId.length === 0 || body.integrationId.length > 40) {
      return Response.json({ code: "validation", message: "Не указан integrationId" }, { status: 400 });
    }
    const run = await runIntegration(body.integrationId, "sync");
    return Response.json({ run });
  } catch (e) {
    return errorResponse(e);
  }
}
