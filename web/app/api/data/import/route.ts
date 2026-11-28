import { errorResponse, getServerStore } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/** POST /api/data/import — снимок текстом в теле запроса; валидные коллекции заменяются, битые отбрасываются. */
export async function POST(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const text = await req.text();
    return Response.json(await getServerStore().api.data.importJSON(text));
  } catch (e) {
    return errorResponse(e);
  }
}
