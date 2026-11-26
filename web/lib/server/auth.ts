import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/types";
import type { AuthBlock, AuthSession } from "@/lib/integrations/types";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

/**
 * Защита API (этап 15): PIN-доступ ко всем маршрутам /api/*, кроме /api/auth/* (сам вход)
 * и /api/health (проверка живости для мониторинга). PIN задаётся при первом входе
 * (POST /api/auth/setup), scrypt-хэш и активные сессии хранятся в блоке auth файла
 * .data/secrets.json — рядом с ключами, вне снимка данных и экспорта. Сессия — случайный
 * токен в HttpOnly-cookie, TTL 30 дней; logout удаляет токен из secrets.json. Пока PIN не
 * задан, guard пропускает запросы (первичная настройка, совместимость с данными до этапа).
 * Неверный PIN отвечает с задержкой 250 мс (замедление перебора); постоянная блокировка
 * по числу попыток не делалась — демо-приложение, ограничение честно задокументировано.
 */

export const SESSION_COOKIE = "aiws_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LOGIN_DELAY_MS = 250;
export const PIN_MIN = 4;
export const PIN_MAX = 12;

/** scrypt-хэш PIN с солью (32 байта, hex). */
export function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString("hex");
}

/** Сверка PIN с хэшем — за постоянное время (timingSafeEqual). */
export function verifyPin(pin: string, auth: AuthBlock): boolean {
  const stored = Buffer.from(auth.pinHash, "hex");
  const computed = scryptSync(pin, auth.pinSalt, 32);
  return stored.length === computed.length && timingSafeEqual(stored, computed);
}

/** Валидация PIN: строка от 4 до 12 знаков; иначе ApiError validation (400). */
export function validatePin(pin: unknown): string {
  if (typeof pin !== "string" || pin.length < PIN_MIN || pin.length > PIN_MAX) {
    throw new ApiError("validation", `PIN должен быть строкой от ${PIN_MIN} до ${PIN_MAX} знаков`);
  }
  return pin;
}

/** Соль для нового PIN-хэша — 16 случайных байт, hex. */
export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

function isSessionAlive(s: AuthSession, now: number): boolean {
  return now - s.createdAt < SESSION_TTL_MS;
}

/** Создаёт сессию: новый токен добавляется в secrets.json (истёкшие вытесняются, максимум 20). */
export function createSession(auth: AuthBlock): string {
  const now = Date.now();
  const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const alive = auth.sessions.filter((s) => isSessionAlive(s, now)).slice(-19);
  writeAuthBlock({ ...auth, sessions: [...alive, { token, createdAt: now }] });
  return token;
}

/** Удаляет сессию (logout) — токен больше не открывает API. */
export function dropSession(auth: AuthBlock, token: string): void {
  writeAuthBlock({ ...auth, sessions: auth.sessions.filter((s) => s.token !== token) });
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

/** Разблокирован ли запрос: PIN не задан (первичная настройка) или сессия живая. */
export function isUnlocked(req: Request): boolean {
  const auth = readAuthBlock();
  if (!auth) return true;
  const token = sessionTokenOf(req);
  if (!token) return false;
  const now = Date.now();
  return auth.sessions.some((s) => s.token === token && isSessionAlive(s, now));
}

/** Guard маршрута: null — запрос разрешён; Response 401 — вход не выполнен. */
export function guardApi(req: Request): Response | null {
  if (isUnlocked(req)) return null;
  return Response.json({ message: "Требуется вход — сессия не найдена или истекла" }, { status: 401 });
}

/** Заголовки Set-Cookie для выданной сессии (HttpOnly, SameSite=Lax, 30 дней). */
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
