import { errorResponse, getServerStore } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/** POST /api/data/reset — сброс к демо-фикстурам (db.js из прототипа). */
export async function POST(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    await getServerStore().api.data.reset();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
