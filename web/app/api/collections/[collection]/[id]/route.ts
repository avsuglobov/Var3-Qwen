import { errorResponse, readJsonBody } from "@/lib/server/store";
import { repoOf } from "@/lib/server/routes";
import { guardApi } from "@/lib/server/auth";
import { notifyEvent } from "@/lib/server/notify";

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

/** PUT /api/collections/[collection]/[id] — частичное обновление (патч валидируется схемой коллекции).
    Этап 20: перевод диалога в режим «менеджер» — событие уведомления (fire-and-forget, ответ не ждёт). */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { collection, id } = await ctx.params;
    const patch = (await readJsonBody(req)) as Record<string, unknown>;
    const updated = await repoOf(collection).update(id, patch);
    if (collection === "dialogs" && patch.mode === "human") {
      const contact = typeof (updated as { contactName?: unknown }).contactName === "string" ? (updated as { contactName: string }).contactName : "";
      void notifyEvent("Передача менеджеру", {
        subject: `Диалог ${id} передан менеджеру`,
        lines: [contact ? `Клиент: ${contact}.` : `Диалог: ${id}.`, "Диалог переведён из режима «ИИ отвечает» в режим менеджера — требуется ответ."]
      });
    }
    return Response.json(updated);
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
