import { clearCookieHeaders, dropSession, sessionContextOf } from "@/lib/server/auth";

/** POST /api/auth/logout — завершает текущую сессию (токен удаляется из secrets.json), кука сбрасывается. */
export async function POST(req: Request) {
  const ctx = sessionContextOf(req);
  if (!ctx) {
    return Response.json({ message: "Требуется вход — сессия не найдена или истекла" }, { status: 401 });
  }
  dropSession(ctx.auth, ctx.session.token);
  return Response.json({ ok: true }, { headers: clearCookieHeaders() });
}
