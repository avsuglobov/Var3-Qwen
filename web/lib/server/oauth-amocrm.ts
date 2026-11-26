import { randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import { amocrmTokenRequest } from "@/lib/integrations/adapters";
import { credentialsOf, readCredentials, saveCredentials, writeCredentials } from "@/lib/server/secrets";

/**
 * Первичная выдача токена amoCRM по коду авторизации (этап 11). Кнопка «Войти через amoCRM»
 * ведёт на https://app.amocrm.ru/oauth?client_id=…&mode=redirect&state=…; amoCRM возвращает
 * браузер на redirect_uri, зарегистрированный в настройках интеграции, с одноразовым code
 * (живёт ограниченное время и используется один раз). Маршрут-колбэк
 * (app/api/integrations/amocrm/callback) обменивает код на токены (grant_type=authorization_code,
 * redirect_uri обязан совпасть с зарегистрированным) и сохраняет их в .data/secrets.json.
 * Одноразовый state пишется в secrets.json рядом с ключами (TTL 30 минут) и проверяется,
 * если amoCRM вернул его в колбэке. Секреты в браузер не уходят: страница-ответ содержит
 * только итог и не содержит токенов.
 */

const AMOCRM_AUTHORIZE_URL = "https://app.amocrm.ru/oauth";
const AMOCRM_INTEGRATION_ID = "int-amocrm";
const PENDING_TTL_MS = 30 * 60_000;

/** Незавершённый вход этой интеграции; null — вход не начинался или уже завершён. */
function pendingOf(): { state: string; createdAt: number } | null {
  return readCredentials().pending?.[AMOCRM_INTEGRATION_ID] ?? null;
}

function savePending(state: string): void {
  const file = readCredentials();
  file.pending = { ...file.pending, [AMOCRM_INTEGRATION_ID]: { state, createdAt: Date.now() } };
  writeCredentials(file);
}

function clearPending(): void {
  const file = readCredentials();
  const rest = { ...file.pending };
  if (!rest[AMOCRM_INTEGRATION_ID]) return;
  delete rest[AMOCRM_INTEGRATION_ID];
  file.pending = Object.keys(rest).length > 0 ? rest : undefined;
  writeCredentials(file);
}

/** POST /api/integrations/amocrm/authorize → { authorizeUrl }: state генерируется и сохраняется. */
export function amocrmAuthorizeStart(): { authorizeUrl: string } {
  const saved = credentialsOf(AMOCRM_INTEGRATION_ID);
  const clientId = (saved?.fields.clientId ?? "").trim();
  const clientSecret = (saved?.fields.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) {
    throw new ApiError("validation", "Сначала сохраните clientId и секретный ключ — они нужны amoCRM для выдачи токена");
  }
  const state = randomBytes(16).toString("hex");
  savePending(state);
  const url = new URL(AMOCRM_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("mode", "redirect");
  url.searchParams.set("state", state);
  return { authorizeUrl: url.toString() };
}

export type AmocrmCallbackResult = { ok: boolean; message: string };

/** GET /api/integrations/amocrm/callback?code=…&state=… — обмен кода на токены и сохранение. */
export async function amocrmAuthorizeCallback(params: { code: string | null; state: string | null; origin: string }, fetchImpl: typeof fetch = fetch): Promise<AmocrmCallbackResult> {
  const code = (params.code ?? "").trim();
  if (!code) return { ok: false, message: "amoCRM не передал код авторизации — вернитесь в приложение и начните вход заново" };
  const pending = pendingOf();
  if (!pending) return { ok: false, message: "Вход не начинался или уже завершён — вернитесь в приложение и нажмите «Войти через amoCRM» заново" };
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    clearPending();
    return { ok: false, message: "Ссылка входа устарела (больше 30 минут) — вернитесь в приложение и начните вход заново" };
  }
  if ((params.state ?? "").trim() && params.state !== pending.state) {
    return { ok: false, message: "Параметр state не совпал с начатым входом — запрос отклонён" };
  }
  const saved = credentialsOf(AMOCRM_INTEGRATION_ID);
  const clientId = (saved?.fields.clientId ?? "").trim();
  const clientSecret = (saved?.fields.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) return { ok: false, message: "ClientId и секретный ключ не сохранены — заполните их в диалоге «Ключи»" };
  // redirect_uri берётся из адреса колбэка и обязан совпасть с зарегистрированным в amoCRM.
  const redirectUri = new URL("/api/integrations/amocrm/callback", params.origin).toString();
  const issued = await amocrmTokenRequest("выдать токен по коду", { client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }, fetchImpl);
  if (!("accessToken" in issued)) return { ok: false, message: issued.detail };
  const merged = { ...(saved?.fields ?? {}), accessToken: issued.accessToken, ...(issued.refreshToken ? { refreshToken: issued.refreshToken } : {}) };
  saveCredentials(AMOCRM_INTEGRATION_ID, merged);
  clearPending();
  return { ok: true, message: "Токены amoCRM получены и сохранены — окно входа можно закрыть" };
}
