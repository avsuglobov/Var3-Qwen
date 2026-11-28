import { ApiError } from "@/lib/api/types";
import { dropUserSessions, guardApi, hashSecret, newSalt, sessionContextOf, validatePassword, validateRole } from "@/lib/server/auth";
import { errorResponse, readJsonBody } from "@/lib/server/store";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/auth/users/[id] — смена роли и/или пароля (админ). Нельзя снять роль с последнего
 * администратора; смена роли или пароля гасит сессии пользователя (кроме текущей сессии самого
 * админа). DELETE — удаление учётной записи: нельзя удалить себя и последнего администратора.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = (await readJsonBody(req)) as { role?: unknown; password?: unknown; password2?: unknown };
    const auth = readAuthBlock();
    const user = auth?.users.find((u) => u.id === id);
    if (!auth || !user) return Response.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
    const lastAdmin = user.role === "admin" && auth.users.filter((u) => u.role === "admin").length === 1;
    if (body.role !== undefined && lastAdmin && validateRole(body.role) !== "admin") {
      throw new ApiError("validation", "Нельзя снять роль с последнего администратора");
    }

    let next = auth;
    if (body.role !== undefined) {
      const role = validateRole(body.role);
      next = { ...next, users: next.users.map((u) => (u.id === id ? { ...u, role } : u)) };
    }
    if (body.password !== undefined) {
      const password = validatePassword(body.password);
      if (body.password2 !== password) throw new ApiError("validation", "Пароль и подтверждение не совпадают");
      const salt = newSalt();
      next = { ...next, users: next.users.map((u) => (u.id === id ? { ...u, passHash: hashSecret(password, salt), passSalt: salt } : u)) };
    }
    // Роль/пароль изменились — чужие сессии пользователя гасятся; текущая сессия админа остаётся.
    const ownToken = sessionContextOf(req)?.session.token ?? "";
    const sessions = next.sessions.filter((s) => s.userId !== id || s.token === ownToken);
    writeAuthBlock({ ...next, sessions });
    const updated = next.users.find((u) => u.id === id)!;
    return Response.json({ id: updated.id, login: updated.login, role: updated.role, createdAt: updated.createdAt });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = guardApi(req, "admin");
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const auth = readAuthBlock();
    const user = auth?.users.find((u) => u.id === id);
    if (!auth || !user) return Response.json({ code: "not_found", message: "Пользователь не найден" }, { status: 404 });
    const ctxSelf = sessionContextOf(req);
    if (ctxSelf && ctxSelf.user.id === id) throw new ApiError("validation", "Нельзя удалить свою учётную запись");
    if (user.role === "admin" && auth.users.filter((u) => u.role === "admin").length === 1) {
      throw new ApiError("validation", "Нельзя удалить последнего администратора");
    }
    writeAuthBlock(dropUserSessions({ ...auth, users: auth.users.filter((u) => u.id !== id) }, id));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
