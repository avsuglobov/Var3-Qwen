import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as statusRoute } from "@/app/api/auth/status/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as setupRoute } from "@/app/api/auth/setup/route";
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, guardApi, hashPin, newSalt, verifyPin } from "@/lib/server/auth";
import { readAuthBlock, writeAuthBlock } from "@/lib/server/secrets";

/* Этап 15 — защита API: PIN-доступ ко всем /api/* маршрутам. Проверяются guard (без PIN
   — открыт, с PIN — 401 «Требуется вход», с живой кукой — открыт, истёкшая сессия — 401),
   маршруты auth (setup с валидацией и защитой от повторного задания, login с задержкой
   при неверном PIN, logout с удалением сессии), лимит сессий и совместимость со старым
   secrets.json без блока auth. Обработчики те же, что вызываются `next start`. */

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
const get = (url: string, cookie?: string): Request =>
  new Request("http://localhost" + url, cookie ? { headers: { cookie } } : undefined);
const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

describe("защита API (этап 15)", () => {
  it("без PIN guardApi пропускает запросы — первичная настройка, поведение до этапа 15", () => {
    expect(guardApi(get("/api/leads"))).toBeNull();
  });

  it("setup валидирует PIN: короче 4, не строка, несовпадение подтверждения — 400", async () => {
    expect((await setupRoute(post("/api/auth/setup", { pin: "12", pin2: "12" }))).status).toBe(400);
    expect((await setupRoute(post("/api/auth/setup", { pin: 12345, pin2: "12345" }))).status).toBe(400);
    expect((await setupRoute(post("/api/auth/setup", { pin: "1234", pin2: "5678" }))).status).toBe(400);
  });

  it("setup создаёт PIN и сессию: HttpOnly-кука, статус setup/unlocked, без куки — unlocked:false", async () => {
    const res = await setupRoute(post("/api/auth/setup", { pin: "1525", pin2: "1525" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const cookie = cookieOf(res);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    const st = (await (await statusRoute(get("/api/auth/status", cookie))).json()) as { setup: boolean; unlocked: boolean };
    expect(st).toEqual({ setup: true, unlocked: true });
    const stNo = (await (await statusRoute(get("/api/auth/status"))).json()) as { unlocked: boolean };
    expect(stNo.unlocked).toBe(false);
  });

  it("повторный setup — 409 «уже задан»", async () => {
    await setupRoute(post("/api/auth/setup", { pin: "1525", pin2: "1525" }));
    const res = await setupRoute(post("/api/auth/setup", { pin: "2626", pin2: "2626" }));
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain("уже задан");
  });

  it("без сессии /api/* закрыт: guardApi — 401 «Требуется вход»", async () => {
    await setupRoute(post("/api/auth/setup", { pin: "1525", pin2: "1525" }));
    const denied = guardApi(get("/api/leads"));
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(401);
    expect(JSON.stringify(await denied?.json())).toContain("Требуется вход");
  });

  it("неверный PIN — 401 «Неверный PIN» с задержкой замедления перебора", async () => {
    await setupRoute(post("/api/auth/setup", { pin: "1525", pin2: "1525" }));
    const started = Date.now();
    const res = await loginRoute(post("/api/auth/login", { pin: "9999" }));
    expect(res.status).toBe(401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(JSON.stringify(await res.json())).toContain("Неверный PIN");
  });

  it("верный PIN открывает API; logout закрывает, сбрасывает куку и отклоняет повтор без сессии", async () => {
    await setupRoute(post("/api/auth/setup", { pin: "1525", pin2: "1525" }));
    const login = await loginRoute(post("/api/auth/login", { pin: "1525" }));
    expect(login.status).toBe(200);
    const cookie = cookieOf(login);
    expect(guardApi(get("/api/leads", cookie))).toBeNull();
    const out = await logoutRoute(post("/api/auth/logout", {}, cookie));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(guardApi(get("/api/leads", cookie))?.status).toBe(401);
    expect((await logoutRoute(post("/api/auth/logout", {}))).status).toBe(401);
  });

  it("истекшая сессия не открывает API; сессий не больше 20 (лишние вытесняются)", async () => {
    await setupRoute(post("/api/auth/setup", { pin: "1525", pin2: "1525" }));
    const auth = readAuthBlock();
    expect(auth).not.toBeNull();
    writeAuthBlock({ ...auth!, sessions: [{ token: "a".repeat(32), createdAt: Date.now() - SESSION_TTL_MS - 1 }] });
    expect(guardApi(get("/api/leads", `${SESSION_COOKIE}=${"a".repeat(32)}`))?.status).toBe(401);
    for (let i = 0; i < 25; i += 1) createSession(readAuthBlock()!);
    expect(readAuthBlock()!.sessions.length).toBe(20);
  });

  it("verifyPin сверяет хэш; старый secrets.json без блока auth читается — API открыт", () => {
    const salt = newSalt();
    const auth = { pinHash: hashPin("1525", salt), pinSalt: salt, sessions: [] };
    expect(verifyPin("1525", auth)).toBe(true);
    expect(verifyPin("0000", auth)).toBe(false);
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(dataDir, "secrets.json"), JSON.stringify({ version: 1, credentials: {} }));
    expect(readAuthBlock()).toBeNull();
    expect(guardApi(get("/api/leads"))).toBeNull();
  });
});
