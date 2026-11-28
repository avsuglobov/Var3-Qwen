import { guardApi } from "@/lib/server/auth";
import { mailPollTick } from "@/lib/server/mail/ingest";
import { errorResponse } from "@/lib/server/store";

/**
 * Ручная загрузка писем (этап 21, менеджер и выше): тот же тик, что у планировщика, но с
 * немедленным результатом — сколько писем записано, лидов создано, какие аккаунты с ошибкой.
 * Кнопка «Проверить почту сейчас» во вкладке «Почта» и в Настройках.
 */

export async function POST(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  try {
    const result = await mailPollTick();
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
