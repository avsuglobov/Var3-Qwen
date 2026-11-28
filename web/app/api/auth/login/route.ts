import { ApiError } from "@/lib/api/types";
import { LOGIN_DELAY_MS, LOCKOUT_MAX_FAILS, clearFails, createSession, findUser, lockedUntilOf, registerFail, sessionCookieHeaders, verifySecret } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

/**
 * POST /api/auth/login — вход: { login, password }. Неверные данные — 401 с задержкой 250 мс
 * (замедление перебора); 5 неудач подряд — логин блокируется на 15 минут (lockout, срок в ответе).
 * Для установок этапов 15–17, где пользователи ещё не созданы, работает старый вход по PIN:
 * { pin } — сессия открывает API и Настройки, где создаётся первый администратор.
 */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as { login?: unknown; password?: unknown; pin?: unknown };
    const auth = readAuthBlock();
    if (!auth || (auth.users.length === 0 && !auth.pinHash)) {
      throw new ApiError("validation", "Вход ещё не настроен — создайте первого администратора");
    }
    const fail = (message: string): Response => Response.json({ message }, { status: 401 });

    if (auth.users.length === 0) {
      // Миграция с PIN-установки: верный PIN открывает приложение до создания первого админа.
      if (typeof body.pin !== "string" || !verifySecret(body.pin, auth.pinSalt ?? "", auth.pinHash ?? "")) {
        await new Promise((resolve) => setTimeout(resolve, LOGIN_DELAY_MS));
        return fail("Неверный PIN");
      }
      const token = createSession(auth, "pending-pin");
      return Response.json({ ok: true }, { headers: sessionCookieHeaders(token) });
    }

    const login = typeof body.login === "string" ? body.login : "";
    const lockedUntil = lockedUntilOf(auth, login);
    if (lockedUntil) {
      const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
      return fail(`Вход временно заблокирован — повторите через ~${minutes} мин`);
    }
    const user = findUser(auth, login);
    const ok = !!user && typeof body.password === "string" && verifySecret(body.password, user.passSalt, user.passHash);
    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, LOGIN_DELAY_MS));
      const next = registerFail(auth, login || "-");
      writeAuthBlock(next);
      if (lockedUntilOf(next, login || "-")) {
        return fail(`Вход временно заблокирован — ${LOCKOUT_MAX_FAILS} неудачных попыток подряд, повторите через 15 минут`);
      }
      return fail("Неверный логин или пароль");
    }
    const token = createSession(clearFails(auth, login), user.id);
    return Response.json({ ok: true }, { headers: sessionCookieHeaders(token) });
  } catch (e) {
    return errorResponse(e);
  }
}
