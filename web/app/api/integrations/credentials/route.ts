import { ApiError } from "@/lib/api/types";
import { adapterOf } from "@/lib/integrations/adapters";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { credentialsOf, maskSecret, saveCredentials } from "@/lib/server/secrets";

/**
 * Ключи внешних сервисов (этап 8). Ключи хранятся в .data/secrets.json и не отдаются
 * в браузер целиком: GET возвращает маскированные значения (у несекретных полей — текст),
 * PUT принимает полный набор полей адаптера и проверяет состав ключей по его определению.
 */

function requireIntegrationId(req: Request): string {
  const id = new URL(req.url).searchParams.get("integrationId") ?? "";
  if (id.length === 0 || id.length > 40) throw new ApiError("validation", "Не указан integrationId");
  return id;
}

/** GET /api/integrations/credentials?integrationId=… — поля адаптера с масками секретов. */
export async function GET(req: Request) {
  try {
    const integrationId = requireIntegrationId(req);
    const adapter = adapterOf(integrationId);
    if (!adapter) throw new ApiError("not_found", `Для интеграции ${integrationId} адаптер пока не реализован`);
    const saved = credentialsOf(integrationId);
    return Response.json({
      integrationId,
      updatedAt: saved?.updatedAt ?? null,
      fields: adapter.fields.map((def) => {
        const value = saved?.fields[def.key] ?? "";
        return {
          key: def.key,
          label: def.label,
          secret: def.secret,
          hint: def.hint ?? null,
          /** Секретные поля — только маска; несекретные — значение целиком. */
          masked: def.secret && value ? maskSecret(value) : null,
          plain: def.secret ? null : value || null
        };
      })
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PUT /api/integrations/credentials — сохраняет набор полей: { integrationId, fields }. */
export async function PUT(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { integrationId?: unknown; fields?: unknown };
    if (typeof body.integrationId !== "string" || body.integrationId.length === 0 || body.integrationId.length > 40) {
      throw new ApiError("validation", "Не указан integrationId");
    }
    const adapter = adapterOf(body.integrationId);
    if (!adapter) throw new ApiError("not_found", `Для интеграции ${body.integrationId} адаптер пока не реализован`);
    if (typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields)) {
      throw new ApiError("validation", "Поле fields должно быть объектом");
    }
    const allowed = new Set(adapter.fields.map((f) => f.key));
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.fields as Record<string, unknown>)) {
      if (!allowed.has(key)) throw new ApiError("validation", `Неизвестное поле конфигурации: ${key}`);
      if (typeof value !== "string") throw new ApiError("validation", `Поле ${key} должно быть строкой`);
      if (value.length > 2000) throw new ApiError("validation", `Поле ${key} длиннее 2000 знаков`);
      if (value.trim().length > 0) fields[key] = value.trim();
    }
    saveCredentials(body.integrationId, fields);
    return Response.json({ ok: true, updatedAt: credentialsOf(body.integrationId)?.updatedAt ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
