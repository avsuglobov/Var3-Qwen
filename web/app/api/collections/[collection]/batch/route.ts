import { ApiError } from "@/lib/api/types";
import type { Lead } from "@/lib/schemas";
import { errorResponse, getServerStore, readJsonBody } from "@/lib/server/store";
import { guardApi } from "@/lib/server/auth";

/** POST /api/collections/leads/batch — пакетное создание лидов (импорт базы), одна запись в хранилище. */
export async function POST(req: Request, ctx: { params: Promise<{ collection: string }> }) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const { collection } = await ctx.params;
    if (collection !== "leads") throw new ApiError("validation", "Пакетное создание поддерживается только для лидов");
    const body = (await readJsonBody(req)) as { items?: unknown };
    if (!Array.isArray(body.items)) throw new ApiError("validation", "Ожидается массив items");
    const created = await getServerStore().api.leads.createMany(body.items as Lead[]);
    return Response.json({ items: created }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
