import { ApiError } from "@/lib/api/types";
import { createSession, hashPin, newSalt, sessionCookieHeaders, validatePin } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readAuthBlock } from "@/lib/server/secrets";

/** POST /api/auth/setup — первичное задание PIN: { pin, pin2 }. Работает только пока PIN не задан. */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { pin?: unknown; pin2?: unknown };
    if (readAuthBlock()) throw new ApiError("duplicate", "PIN уже задан — используйте вход");
    const pin = validatePin(body.pin);
    if (body.pin2 !== pin) throw new ApiError("validation", "PIN и подтверждение не совпадают");
    const salt = newSalt();
    const auth = { pinHash: hashPin(pin, salt), pinSalt: salt, sessions: [] };
    const token = createSession(auth);
    return Response.json({ ok: true }, { headers: sessionCookieHeaders(token) });
  } catch (e) {
    return errorResponse(e);
  }
}
