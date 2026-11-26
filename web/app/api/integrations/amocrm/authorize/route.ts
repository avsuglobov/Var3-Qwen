import { errorResponse } from "@/lib/server/store";
import { amocrmAuthorizeStart } from "@/lib/server/oauth-amocrm";

/** POST /api/integrations/amocrm/authorize — начало входа через amoCRM (этап 11): { authorizeUrl }. */
export async function POST() {
  try {
    return Response.json(amocrmAuthorizeStart());
  } catch (e) {
    return errorResponse(e);
  }
}
