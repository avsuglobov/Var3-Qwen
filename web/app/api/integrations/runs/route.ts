import { errorResponse } from "@/lib/server/store";
import { readRuns } from "@/lib/server/runs";

/** GET /api/integrations/runs — журнал прогонов интеграций (новые сверху, до 100 записей). */
export async function GET() {
  try {
    return Response.json({ runs: readRuns() });
  } catch (e) {
    return errorResponse(e);
  }
}
