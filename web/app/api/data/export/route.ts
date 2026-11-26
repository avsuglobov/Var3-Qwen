import { errorResponse, getServerStore } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/** GET /api/data/export — снимок в формате прототипа (`version: 1` + коллекции) текстом JSON. */
export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const text = await getServerStore().api.data.exportJSON();
    return new Response(text, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (e) {
    return errorResponse(e);
  }
}
