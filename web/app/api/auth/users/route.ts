import { ApiError } from "@/lib/api/types";
import { createUser, guardApi, validateLogin, validatePassword, validateRole } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

type PublicUser = { id: string; login: string; role: string; createdAt: number };
const toPublic = (u: { id: string; login: string; role: string; createdAt: number }): PublicUser => u;

/**
 * GET /api/auth/users — список учётных записей (без хэшей), POST — создание пользователя
 * с ролью admin/manager/viewer. Только админ; в открытом режиме (блока auth нет) разрешено
 * без входа — так настраивается первый администратор из Настроек и живёт e2e.
 */
export async function GET(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  const auth = readAuthBlock();
  return Response.json({ users: (auth?.users ?? []).map(toPublic) });
}

export async function POST(req: Request) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const body = (await readJsonBody(req)) as { login?: unknown; password?: unknown; password2?: unknown; role?: unknown };
    const login = validateLogin(body.login);
    const password = validatePassword(body.password);
    if (body.password2 !== password) throw new ApiError("validation", "Пароль и подтверждение не совпадают");
    const role = validateRole(body.role);
    const auth = readAuthBlock() ?? { users: [], sessions: [], fails: [] };
    const { user, auth: next } = createUser(auth, login, password, role);
    writeAuthBlock(next);
    return Response.json(toPublic(user), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
