import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import type { AuthBlock, AuthFail, AuthSession, UserAccount } from "@/lib/integrations/types";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

/**
 * Защита API (этап 18): вход по логину и паролю с ролями admin/manager/viewer вместо общего
 * PIN этапа 15. Учётные записи, сессии и счётчики неудачных входов хранятся в блоке auth
 * файла .data/secrets.json — рядом с ключами, вне снимка данных и экспорта. Сессия — случайный
 * токен в HttpOnly-cookie, TTL 7 дней; logout удаляет токен из secrets.json. Неверный пароль
 * отвечает с задержкой 250 мс (замедление перебора); после 5 неудач подряд логин блокируется
 * на 15 минут (lockout, снимается автоматически; успех сбрасывает счётчик).
 * Роли: viewer — только чтение (GET/HEAD), manager — всё, кроме админ-группы маршрутов,
 * admin — всё, включая /api/debug, /api/data/reset|import и управление пользователями.
 * Совместимость: при отсутствии блока auth в secrets.json API открыт (демо-режим и e2e);
 * блок с PIN-хэшем от этапов 15–17, но без пользователей — вход по PIN до создания админа
 * (POST /api/auth/bootstrap), после чего PIN-хэш удаляется. Multi-tenant не поддерживается —
 * один инстанс обслуживает одну компанию (см. README).
 */

export type Role = "admin" | "manager" | "viewer";

export const SESSION_COOKIE = "aiws_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOGIN_DELAY_MS = 250;
export const LOCKOUT_MAX_FAILS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const PASSWORD_MIN = 10;
export const LOGIN_MIN = 3;
export const LOGIN_MAX = 40;
/** PIN остаётся только как способ миграции с установок этапов 15–17. */
export const PIN_MIN = 4;
export const PIN_MAX = 12;
export const ROLES: Role[] = ["admin", "manager", "viewer"];

/* -------------------------------------------------------------- пароли и логины */

/** scrypt-хэш секрета (пароль или PIN) с солью (32 байта, hex). */
export function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 32).toString("hex");
}

/** Сверка секрета с хэшем — за постоянное время (timingSafeEqual). */
export function verifySecret(secret: string, salt: string, stored: string): boolean {
  const storedBuf = Buffer.from(stored, "hex");
  const computed = scryptSync(secret, salt, 32);
  return storedBuf.length === computed.length && timingSafeEqual(storedBuf, computed);
}

/** Соль для нового хэша — 16 случайных байт, hex. */
export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Валидация логина: 3–40 знаков, латиница/цифры/точка/подчёркивание/дефис; иначе 400. */
export function validateLogin(login: unknown): string {
  if (typeof login !== "string" || !/^[A-Za-z0-9._-]{3,40}$/.test(login)) {
    throw new ApiError("validation", `Логин: от ${LOGIN_MIN} до ${LOGIN_MAX} знаков — латиница, цифры, точка, подчёркивание, дефис`);
  }
  return login;
}

/** Валидация PIN (миграция): строка от 4 до 12 знаков; иначе 400. */
export function validatePin(pin: unknown): string {
  if (typeof pin !== "string" || pin.length < PIN_MIN || pin.length > PIN_MAX) {
    throw new ApiError("validation", `PIN должен быть строкой от ${PIN_MIN} до ${PIN_MAX} знаков`);
  }
  return pin;
}

/** Валидация пароля: от 10 знаков и хотя бы одна цифра; иначе 400. */
export function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > 100) {
    throw new ApiError("validation", `Пароль должен быть не короче ${PASSWORD_MIN} знаков`);
  }
  if (!/\d/.test(password)) throw new ApiError("validation", "Пароль должен содержать хотя бы одну цифру");
  return password;
}

/** Валидация роли из строки; иначе 400. */
export function validateRole(role: unknown): Role {
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    throw new ApiError("validation", `Роль должна быть одной из: ${ROLES.join(", ")}`);
  }
  return role as Role;
}

/* -------------------------------------------------------------- пользователи */

export function findUser(auth: AuthBlock, login: string): UserAccount | undefined {
  return auth.users.find((u) => u.login === login);
}

/** Создаёт пользователя: логин уникален (без учёта регистра), пароль по правилам; возвращает новую запись и обновлённый блок. */
export function createUser(auth: AuthBlock, login: string, password: string, role: Role): { user: UserAccount; auth: AuthBlock } {
  if (auth.users.some((u) => u.login.toLowerCase() === login.toLowerCase())) {
    throw new ApiError("duplicate", "Пользователь с таким логином уже есть");
  }
  const salt = newSalt();
  const user: UserAccount = {
    id: randomUUID(),
    login,
    passHash: hashSecret(password, salt),
    passSalt: salt,
    role,
    createdAt: Date.now()
  };
  return { user, auth: { ...auth, users: [...auth.users, user] } };
}

/* -------------------------------------------------------------- lockout */

/** Активная блокировка логина? Возвращает момент снятия или null. */
export function lockedUntilOf(auth: AuthBlock, login: string): number | null {
  const fail = auth.fails.find((f) => f.login === login);
  return fail?.lockedUntil && fail.lockedUntil > Date.now() ? fail.lockedUntil : null;
}

/** Регистрирует неудачный вход: 5-я подряд ставит блокировку на 15 минут. */
export function registerFail(auth: AuthBlock, login: string): AuthBlock {
  const now = Date.now();
  const rest = auth.fails.filter((f) => f.login !== login);
  const count = restCount(auth, login) + 1;
  const next: AuthFail = {
    login,
    count,
    ...(count >= LOCKOUT_MAX_FAILS ? { lockedUntil: now + LOCKOUT_MS } : {})
  };
  return { ...auth, fails: [...rest, next].slice(-50) };
}

function restCount(auth: AuthBlock, login: string): number {
  const fail = auth.fails.find((f) => f.login === login);
  return fail && (!fail.lockedUntil || fail.lockedUntil > Date.now()) ? fail.count : 0;
}

/** Успешный вход — счётчик неудач логина сбрасывается. */
export function clearFails(auth: AuthBlock, login: string): AuthBlock {
  return { ...auth, fails: auth.fails.filter((f) => f.login !== login) };
}

/* -------------------------------------------------------------- сессии */

function isSessionAlive(s: AuthSession, now: number): boolean {
  return now - s.createdAt < SESSION_TTL_MS;
}

/** Создаёт сессию пользователя: новый токен добавляется в secrets.json (истёкшие вытесняются, максимум 20). */
export function createSession(auth: AuthBlock, userId: string): string {
  const now = Date.now();
  const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const alive = auth.sessions.filter((s) => isSessionAlive(s, now)).slice(-19);
  writeAuthBlock({ ...auth, sessions: [...alive, { token, userId, createdAt: now }] });
  return token;
}

/** Удаляет сессию (logout) — токен больше не открывает API. */
export function dropSession(auth: AuthBlock, token: string): void {
  writeAuthBlock({ ...auth, sessions: auth.sessions.filter((s) => s.token !== token) });
}

/** Удаляет все сессии пользователя (например, при смене роли или удалении учётной записи). */
export function dropUserSessions(auth: AuthBlock, userId: string): AuthBlock {
  return { ...auth, sessions: auth.sessions.filter((s) => s.userId !== userId) };
}

/** Токен сессии из cookie-заголовка; null — куки нет. */
export function sessionTokenOf(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE && rest.length > 0) return rest.join("=");
  }
  return null;
}

export interface SessionContext {
  auth: AuthBlock;
  session: AuthSession;
  user: UserAccount;
}

/**
 * Живая сессия запроса: токен в куке, TTL не истёк, пользователь существует и не удалён.
 * null — входа нет. Блок auth отсутствует → открытый режим (демо/e2e), null.
 */
export function sessionContextOf(req: Request): SessionContext | null {
  const auth = readAuthBlock();
  if (!auth) return null;
  const token = sessionTokenOf(req);
  if (!token) return null;
  const now = Date.now();
  const session = auth.sessions.find((s) => s.token === token && isSessionAlive(s, now));
  if (!session) return null;
  const user = auth.users.find((u) => u.id === session.userId);
  if (!user) {
    // Миграционная сессия по PIN (этапы 15–17 → 18): права админа, живёт только пока
    // пользователи не созданы и PIN-хэш на месте; после bootstrap гаснет сама.
    if (session.userId === "pending-pin" && auth.users.length === 0 && auth.pinHash) {
      return { auth, session, user: { id: "pending-pin", login: "migration", passHash: "", passSalt: "", role: "admin", createdAt: session.createdAt } };
    }
    return null;
  }
  return { auth, session, user };
}

/** Разблокирован ли запрос: блока auth нет (открытый режим) или сессия живая и пользователь существует. */
export function isUnlocked(req: Request): boolean {
  return sessionContextOf(req) !== null;
}

const unauthorized = (): Response =>
  Response.json({ message: "Требуется вход — сессия не найдена или истекла" }, { status: 401 });

/**
 * Guard маршрута: null — запрос разрешён; Response — 401 (нет входа) или 403 (роль не подходит).
 * required === "admin" — только админ (админ-группа: debug, reset, import, пользователи).
 * Без required: viewer допускается только на чтение (GET/HEAD), manager и admin — на всё.
 * В открытом режиме (нет блока auth) разрешает всё — так живут демо и e2e.
 */
export function guardApi(req: Request, required?: "admin"): Response | null {
  if (readAuthBlock() === null) return null; // открытый режим (демо и e2e): блока auth нет
  const ctx = sessionContextOf(req);
  if (!ctx) return unauthorized();
  if (required && ctx.user.role !== "admin") {
    return Response.json({ message: "Недостаточно прав — нужно быть администратором" }, { status: 403 });
  }
  if (!required && ctx.user.role === "viewer" && req.method !== "GET" && req.method !== "HEAD") {
    return Response.json({ message: "Роль «наблюдатель» — доступно только чтение" }, { status: 403 });
  }
  return null;
}

/** Заголовки Set-Cookie для выданной сессии (HttpOnly, SameSite=Lax, 7 дней). */
export function sessionCookieHeaders(token: string): Headers {
  const headers = new Headers();
  headers.append("set-cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  return headers;
}

/** Заголовок сброса куки (logout). */
export function clearCookieHeaders(): Headers {
  const headers = new Headers();
  headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return headers;
}
