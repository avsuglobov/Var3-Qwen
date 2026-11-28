import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as statusRoute } from "@/app/api/auth/status/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as bootstrapRoute } from "@/app/api/auth/bootstrap/route";
import { POST as usersCreateRoute } from "@/app/api/auth/users/route";
import { PATCH as userPatchRoute, DELETE as userDeleteRoute } from "@/app/api/auth/users/[id]/route";
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, guardApi, hashSecret, newSalt, validateLogin, validatePassword, verifySecret } from "@/lib/server/auth";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

/* Этап 18 — аккаунты и роли: вход по логину/паролю вместо общего PIN. Проверяются guard
   (без блока auth — открыт, без сессии — 401, viewer — 403 на запись, админ-группа — 403
   не-админам), bootstrap первого админа (валидация пароля, PIN-миграция, отключение PIN),
   login (задержка при ошибке, lockout 5/15), logout, лимит сессий и совместимость со
   старым secrets.json. Обработчики те же, что вызываются `next start`. */

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "aiws-auth-"));
  process.env.AIWS_DATA_DIR = dataDir;
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.AIWS_DATA_DIR;
});

const post = (url: string, body: unknown, cookie?: string): Request =>
  new Request("http://localhost" + url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
const patch = (url: string, body: unknown, cookie: string): Request =>
  new Request("http://localhost" + url, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
const get = (url: string, cookie?: string): Request =>
  new Request("http://localhost" + url, cookie ? { headers: { cookie } } : undefined);
const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];
const del = (url: string, cookie: string): Request =>
  new Request("http://localhost" + url, { method: "DELETE", headers: { cookie } });

/** Создаёт админа + пользователя с заданной ролью; возвращает куки обоих входов. */
async function seedUsers(): Promise<{ admin: string; other: string; otherId: string }> {
  const boot = await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
  expect(boot.status).toBe(200);
  const create = await usersCreateRoute(post("/api/auth/users", { login: "viewer1", password: "Password123", password2: "Password123", role: "viewer" }, cookieOf(boot)));
  expect(create.status).toBe(201);
  const created = (await create.json()) as { id: string };
  const otherLogin = await loginRoute(post("/api/auth/login", { login: "viewer1", password: "Password123" }));
  return { admin: cookieOf(boot), other: cookieOf(otherLogin), otherId: created.id };
}

describe("защита API (этап 18)", () => {
  it("без блока auth guardApi пропускает запросы — открытый режим (демо и e2e)", () => {
    expect(guardApi(get("/api/leads"))).toBeNull();
  });

  it("bootstrap валидирует: пароль короче 10, без цифры, несовпадение подтверждения, плохой логин — 400", async () => {
    expect((await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "short1", password2: "short1" }))).status).toBe(400);
    expect((await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "onlylettersok", password2: "onlylettersok" }))).status).toBe(400);
    expect((await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Other12345" }))).status).toBe(400);
    expect((await bootstrapRoute(post("/api/auth/bootstrap", { login: "ab", password: "Password123", password2: "Password123" }))).status).toBe(400);
  });

  it("bootstrap создаёт админа, гасит PIN-миграцию и ставит HttpOnly-куку; статус mode users", async () => {
    const res = await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = cookieOf(res);
    const st = (await (await statusRoute(get("/api/auth/status", cookie))).json()) as { mode: string; unlocked: boolean; user: { login: string; role: string } | null };
    expect(st.mode).toBe("users");
    expect(st.unlocked).toBe(true);
    expect(st.user?.role).toBe("admin");
    expect(readAuthBlock()?.pinHash).toBeUndefined();
    const stNo = (await (await statusRoute(get("/api/auth/status"))).json()) as { unlocked: boolean; user: unknown };
    expect(stNo.unlocked).toBe(false);
    expect(stNo.user).toBeNull();
  });

  it("повторный bootstrap — 409; без сессии guardApi — 401 «Требуется вход»", async () => {
    await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
    const again = await bootstrapRoute(post("/api/auth/bootstrap", { login: "root", password: "Password123", password2: "Password123" }));
    expect(again.status).toBe(409);
    const denied = guardApi(get("/api/leads"));
    expect(denied?.status).toBe(401);
    expect(JSON.stringify(await denied?.json())).toContain("Требуется вход");
  });

  it("миграция: PIN-блок этапов 15–17 — вход по PIN открывает API, bootstrap с PIN создаёт админа и отключает PIN", async () => {
    const salt = newSalt();
    writeAuthBlock({ pinHash: hashSecret("1525", salt), pinSalt: salt, users: [], sessions: [], fails: [] });
    let st = (await (await statusRoute(get("/api/auth/status"))).json()) as { mode: string };
    expect(st.mode).toBe("pin");
    expect(guardApi(get("/api/leads"))?.status).toBe(401);
    const pinLogin = await loginRoute(post("/api/auth/login", { pin: "1525" }));
    expect(pinLogin.status).toBe(200);
    const pinCookie = cookieOf(pinLogin);
    expect(guardApi(get("/api/leads", pinCookie))).toBeNull();
    const withoutPin = await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
    expect(withoutPin.status).toBe(400);
    const boot = await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123", pin: "1525" }, pinCookie));
    expect(boot.status).toBe(200);
    st = (await (await statusRoute(get("/api/auth/status"))).json()) as { mode: string };
    expect(st.mode).toBe("users");
    // PIN отключён: повторный вход по PIN невозможен, миграционная сессия погасла.
    expect((await loginRoute(post("/api/auth/login", { pin: "1525" }))).status).toBe(401);
    expect(guardApi(get("/api/leads", pinCookie))?.status).toBe(401);
    expect(guardApi(get("/api/leads", cookieOf(boot)))).toBeNull();
  });

  it("неверный пароль — 401 с задержкой; 5 неудач — lockout на 15 минут, верный пароль тоже отклоняется", async () => {
    await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
    const started = Date.now();
    const res = await loginRoute(post("/api/auth/login", { login: "admin", password: "Wrong999999" }));
    expect(res.status).toBe(401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(JSON.stringify(await res.json())).toContain("Неверный логин или пароль");
    let locked: Response | null = null;
    for (let i = 0; i < 4; i += 1) locked = await loginRoute(post("/api/auth/login", { login: "admin", password: "Wrong999999" }));
    expect(JSON.stringify(await locked?.json())).toContain("заблокирован");
    const evenCorrect = await loginRoute(post("/api/auth/login", { login: "admin", password: "Password123" }));
    expect(evenCorrect.status).toBe(401);
    expect(JSON.stringify(await evenCorrect.json())).toContain("заблокирован");
    // Неизвестный логин тоже копит неудачи — перебор логинов не бесплатен.
    const unknown = await loginRoute(post("/api/auth/login", { login: "ghost", password: "Whatever123" }));
    expect(unknown.status).toBe(401);
  });

  it("верный логин/пароль открывает API; logout закрывает и сбрасывает куку", async () => {
    await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
    const login = await loginRoute(post("/api/auth/login", { login: "admin", password: "Password123" }));
    expect(login.status).toBe(200);
    const cookie = cookieOf(login);
    expect(guardApi(get("/api/leads", cookie))).toBeNull();
    const out = await logoutRoute(post("/api/auth/logout", {}, cookie));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(guardApi(get("/api/leads", cookie))?.status).toBe(401);
    expect((await logoutRoute(post("/api/auth/logout", {}))).status).toBe(401);
  });

  it("viewer: GET открыт, запись — 403; админ-группа (reset) — 403 не-админам, админу доступна", async () => {
    const { admin, other } = await seedUsers();
    expect(guardApi(get("/api/leads", other))).toBeNull();
    const write = guardApi(post("/api/collections/leads", {}, other));
    expect(write?.status).toBe(403);
    expect(JSON.stringify(await write?.json())).toContain("только чтение");
    const adminOnly = guardApi(post("/api/data/reset", {}, other), "admin");
    expect(adminOnly?.status).toBe(403);
    expect(guardApi(post("/api/data/reset", {}, admin), "admin")).toBeNull();
    const managerWrite = guardApi(post("/api/collections/leads", {}, admin));
    expect(managerWrite).toBeNull();
  });

  it("PATCH роли гасит сессии пользователя; последнего админа нельзя удалить или понизить", async () => {
    const { admin, other, otherId } = await seedUsers();
    expect(guardApi(get("/api/leads", other))).toBeNull();
    const adminId = readAuthBlock()!.users.find((u) => u.login === "admin")!.id;
    const demoteLast = await userPatchRoute(patch(`/api/auth/users/${adminId}`, { role: "manager" }, admin), { params: Promise.resolve({ id: adminId }) });
    expect(demoteLast.status).toBe(400);
    const delSelf = await userDeleteRoute(del(`/api/auth/users/${adminId}`, admin), { params: Promise.resolve({ id: adminId }) });
    expect(delSelf.status).toBe(400);
    const patchRole = await userPatchRoute(patch(`/api/auth/users/${otherId}`, { role: "manager" }, admin), { params: Promise.resolve({ id: otherId }) });
    expect(patchRole.status).toBe(200);
    // Сессии viewer1 погасли при смене роли.
    expect(guardApi(get("/api/leads", other))?.status).toBe(401);
    const delOther = await userDeleteRoute(del(`/api/auth/users/${otherId}`, admin), { params: Promise.resolve({ id: otherId }) });
    expect(delOther.status).toBe(200);
    expect(readAuthBlock()!.users.some((u) => u.id === otherId)).toBe(false);
  });

  it("истекшая сессия не открывает API; сессий не больше 20 (лишние вытесняются)", async () => {
    await bootstrapRoute(post("/api/auth/bootstrap", { login: "admin", password: "Password123", password2: "Password123" }));
    const auth = readAuthBlock();
    expect(auth).not.toBeNull();
    writeAuthBlock({ ...auth!, sessions: [{ token: "a".repeat(32), userId: auth!.users[0].id, createdAt: Date.now() - SESSION_TTL_MS - 1 }] });
    expect(guardApi(get("/api/leads", `${SESSION_COOKIE}=${"a".repeat(32)}`))?.status).toBe(401);
    for (let i = 0; i < 25; i += 1) createSession(readAuthBlock()!, auth!.users[0].id);
    expect(readAuthBlock()!.sessions.length).toBe(20);
  });

  it("verifySecret сверяет хэш; валидация логина и пароля; старый secrets.json без блока auth читается", () => {
    const salt = newSalt();
    expect(verifySecret("Password123", salt, hashSecret("Password123", salt))).toBe(true);
    expect(verifySecret("Other123456", salt, hashSecret("Password123", salt))).toBe(false);
    expect(validateLogin("ann.petrova")).toBe("ann.petrova");
    expect(() => validateLogin("ab")).toThrow();
    expect(validatePassword("Password123")).toBe("Password123");
    expect(() => validatePassword("nodigits-here")).toThrow();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(dataDir, "secrets.json"), JSON.stringify({ version: 1, credentials: {} }));
    expect(readAuthBlock()).toBeNull();
    expect(guardApi(get("/api/leads"))).toBeNull();
  });
});
