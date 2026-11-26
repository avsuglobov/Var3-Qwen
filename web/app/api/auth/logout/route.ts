import { SESSION_TTL_MS, clearCookieHeaders, dropSession, sessionTokenOf } from "@/lib/server/auth";
import { readAuthBlock } from "@/lib/server/secrets";

/** POST /api/auth/logout — завершает текущую сессию (токен удаляется из secrets.json), кука сбрасывается. */
export async function POST(req: Request) {
  const auth = readAuthBlock();
  const token = sessionTokenOf(req);
  const now = Date.now();
  if (!auth || !token || !auth.sessions.some((s) => s.token === token && now - s.createdAt < SESSION_TTL_MS)) {
    return Response.json({ message: "Требуется вход — сессия не найдена или истекла" }, { status: 401 });
  }
  dropSession(auth, token);
  return Response.json({ ok: true }, { headers: clearCookieHeaders() });
}
