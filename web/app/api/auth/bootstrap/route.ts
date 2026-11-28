import { ApiError } from "@/lib/api/types";
import { createSession, createUser, sessionCookieHeaders, validateLogin, validatePassword, validatePin, verifySecret } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

/**
 * POST /api/auth/bootstrap — создание первого администратора; работает только пока пользователей
 * нет. Для установок этапов 15–17 обязателен верный старый PIN ({ pin }) — подтверждение права
 * настраивать вход; PIN-хэш при этом удаляется (PIN отключается совсем, далее только пароли).
 * Свежей установки: { login, password } без PIN. Ответ 200 ставит куку сессии нового админа.
 */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { login?: unknown; password?: unknown; password2?: unknown; pin?: unknown };
    const auth = readAuthBlock();
    if (auth && auth.users.length > 0) throw new ApiError("duplicate", "Пользователи уже созданы — используйте вход");
    const login = validateLogin(body.login);
    const password = validatePassword(body.password);
    if (body.password2 !== password) throw new ApiError("validation", "Пароль и подтверждение не совпадают");
    if (auth?.pinHash) {
      if (typeof body.pin !== "string" || !verifySecret(body.pin, auth.pinSalt ?? "", auth.pinHash)) {
        throw new ApiError("validation", "Укажите действующий PIN — он подтверждает право создать администратора");
      }
    }
    const base = auth ?? { users: [], sessions: [], fails: [] };
    const { user, auth: withUser } = createUser(base, login, password, "admin");
    const final: typeof withUser = { ...withUser, pinHash: undefined, pinSalt: undefined }; // PIN отключается совсем
    const token = createSession(final, user.id);
    return Response.json({ ok: true, user: { id: user.id, login: user.login, role: user.role } }, { headers: sessionCookieHeaders(token) });
  } catch (e) {
    return errorResponse(e);
  }
}
