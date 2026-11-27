import { guardApi } from "@/lib/server/auth";
import { maskSecret, readAiBlock } from "@/lib/server/secrets";

/**
 * GET /api/ai/status — этап 16: настроен ли LLM-провайдер для AI-сотрудников.
 * Честность в интерфейсе («демо» против модели) строится по этому статусу;
 * ключ уходит в браузер только маской «••••последние 4» (maskSecret).
 */
export async function GET(req: Request) {
  const denied = guardApi(req);
  if (denied) return denied;
  const ai = readAiBlock();
  return Response.json({
    configured: ai !== null,
    provider: ai?.provider ?? null,
    model: ai?.model ?? null,
    apiKeyMask: ai?.apiKey ? maskSecret(ai.apiKey) : null
  });
}
