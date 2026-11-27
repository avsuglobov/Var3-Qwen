import { guardApi } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { aiReply, aiReplyRequestSchema } from "@/lib/server/ai/reply";

/**
 * POST /api/ai/reply — ответ AI-сотрудника (этап 16). Единственная точка вызова LLM:
 * провайдер собирается на сервере из блока ai файла .data/secrets.json, ключ в браузер
 * не уходит. Без блока ai — честный scripted-fallback с пометкой «демо-ответ».
 * Маршрут защищён PIN-сессией наравне с остальными /api/* (этап 15).
 */
export async function POST(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const parsed = aiReplyRequestSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      return Response.json(
        { code: "validation", message: "Ожидается { scope: «dialog»|«test»|«boss», message, agentId?, history? }" },
        { status: 400 }
      );
    }
    return Response.json(await aiReply(parsed.data));
  } catch (e) {
    return errorResponse(e);
  }
}
