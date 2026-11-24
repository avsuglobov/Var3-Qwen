import { errorResponse, getServerStore } from "@/lib/server/store";

/** GET /api/data/export — снимок в формате прототипа (`version: 1` + коллекции) текстом JSON. */
export async function GET() {
  try {
    const text = await getServerStore().api.data.exportJSON();
    return new Response(text, { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (e) {
    return errorResponse(e);
  }
}
