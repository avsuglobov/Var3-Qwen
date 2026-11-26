import { errorResponse } from "@/lib/server/store";
import { readRuns } from "@/lib/server/runs";
import { guardApi } from "@/lib/server/auth";

/** GET /api/integrations/runs — журнал прогонов интеграций (новые сверху, до 100 записей). */
export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    return Response.json({ runs: readRuns() });
  } catch (e) {
    return errorResponse(e);
  }
}
