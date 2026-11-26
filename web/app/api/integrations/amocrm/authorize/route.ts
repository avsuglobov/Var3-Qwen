import { errorResponse } from "@/lib/server/store";
import { amocrmAuthorizeStart } from "@/lib/server/oauth-amocrm";
import { guardApi } from "@/lib/server/auth";

/** POST /api/integrations/amocrm/authorize — начало входа через amoCRM (этап 11): { authorizeUrl }. */
export async function POST(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    return Response.json(amocrmAuthorizeStart());
  } catch (e) {
    return errorResponse(e);
  }
}
