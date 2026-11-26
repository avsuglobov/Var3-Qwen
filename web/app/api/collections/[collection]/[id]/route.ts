import { errorResponse, readJsonBody } from "@/lib/server/store";
import { repoOf } from "@/lib/server/routes";
import { guardApi } from "@/lib/server/auth";

type Ctx = { params: Promise<{ collection: string; id: string }> };

/** GET /api/collections/[collection]/[id] — запись или 404. */
export async function GET(req: Request, ctx: Ctx) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { collection, id } = await ctx.params;
    const item = await repoOf(collection).get(id);
    if (!item) return Response.json({ code: "not_found", message: `Запись ${id} не найдена` }, { status: 404 });
    return Response.json(item);
  } catch (e) {
    return errorResponse(e);
  }
}

/** PUT /api/collections/[collection]/[id] — частичное обновление (патч валидируется схемой коллекции). */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { collection, id } = await ctx.params;
    const patch = (await readJsonBody(req)) as Record<string, unknown>;
    return Response.json(await repoOf(collection).update(id, patch));
  } catch (e) {
    return errorResponse(e);
  }
}

/** DELETE /api/collections/[collection]/[id] — удаление (204). */
export async function DELETE(req: Request, ctx: Ctx) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { collection, id } = await ctx.params;
    await repoOf(collection).remove(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
