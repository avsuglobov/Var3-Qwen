import { errorResponse, getServerStore } from "@/lib/server/store";

/** POST /api/data/reset — сброс к демо-фикстурам (db.js из прототипа). */
export async function POST() {
  try {
    await getServerStore().api.data.reset();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
