import { readAuthBlock } from "@/lib/server/secrets";
import { sessionContextOf } from "@/lib/server/auth";

/**
 * GET /api/auth/status — состояние входа (открытый маршрут). mode: «open» — блока auth нет,
 * API открыт (демо и e2e); «pin» — блок от этапов 15–17, пользователи ещё не созданы, вход по
 * PIN до bootstrap; «users» — вход по логину/паролю. unlocked — есть живая сессия; user —
 * логин и роль текущего пользователя (null — входа нет или открытый режим).
 */
export async function GET(req: Request) {
  const auth = readAuthBlock();
  const mode = !auth || (auth.users.length === 0 && !auth.pinHash) ? "open" : auth.users.length === 0 ? "pin" : "users";
  const ctx = sessionContextOf(req);
  return Response.json({
    mode,
    unlocked: mode === "open" || ctx !== null,
    user: ctx ? { login: ctx.user.login, role: ctx.user.role } : null
  });
}
