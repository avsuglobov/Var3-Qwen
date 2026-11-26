import { ApiError } from "@/lib/api/types";
import { LOGIN_DELAY_MS, createSession, sessionCookieHeaders, validatePin, verifyPin } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readAuthBlock } from "@/lib/server/secrets";

/**
 * POST /api/auth/login — разблокировка по PIN: { pin }. Неверный PIN — 401 с задержкой
 * 250 мс (замедление перебора), верный — 200 и HttpOnly-cookie сессии на 30 дней.
 */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { pin?: unknown };
    const auth = readAuthBlock();
    if (!auth) throw new ApiError("validation", "PIN ещё не задан — задайте его при первом входе");
    const pin = validatePin(body.pin);
    if (!verifyPin(pin, auth)) {
      await new Promise((resolve) => setTimeout(resolve, LOGIN_DELAY_MS));
      return Response.json({ message: "Неверный PIN" }, { status: 401 });
    }
    const token = createSession(auth);
    return Response.json({ ok: true }, { headers: sessionCookieHeaders(token) });
  } catch (e) {
    return errorResponse(e);
  }
}
