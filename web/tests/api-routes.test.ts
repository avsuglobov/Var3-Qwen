import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getServerStore } from "@/lib/server/store";
import { SEED_DATA } from "@/lib/mock-data/seed";

/**
 * Маршруты app/api (этап 4) против настоящего серверного хранилища: файл во временном каталоге,
 * те же обработчики, что вызываются `next start`. Проверяются коды ответов, валидация, пакетные
 * операции, завершение курса, экспорт/импорт/сброс и панель сбоев /api/debug.
 */

// Каталог данных задаётся до первого обращения хранилища (пути вычисляются лениво при каждой операции).
process.env.AIWS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-api-routes-"));
const dataFile = (): string => path.join(process.env.AIWS_DATA_DIR as string, "db.json");

import { GET as listRoute, POST as createRoute } from "@/app/api/collections/[collection]/route";
import { DELETE as removeRoute, GET as itemRoute, PUT as updateRoute } from "@/app/api/collections/[collection]/[id]/route";
import { POST as batchRoute } from "@/app/api/collections/[collection]/batch/route";
import { POST as completeRoute } from "@/app/api/collections/[collection]/[id]/complete/route";
import { GET as profileGet, PUT as profilePut } from "@/app/api/company-profile/route";
import { GET as referenceRoute } from "@/app/api/reference/[name]/route";
import { GET as exportRoute } from "@/app/api/data/export/route";
import { POST as importRoute } from "@/app/api/data/import/route";
import { POST as resetRoute } from "@/app/api/data/reset/route";
import { GET as debugGet, POST as debugPost } from "@/app/api/debug/route";

const json = async (res: Response): Promise<{ status: number; body: unknown }> => {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const colCtx = (collection: string) => ({ params: Promise.resolve({ collection }) });
const itemCtx = (collection: string, id: string) => ({ params: Promise.resolve({ collection, id }) });
const jsonRequest = (url: string, method: string, body: unknown): Request => new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const lead = () => ({ ...SEED_DATA.LEADS[0]!, id: "LD-8001", name: "Маршрутный лид" });
/** Хранилище на диске: JSON «ключ → строка снимка»; снимок под ключом aiws-db-v2 — строка. */
const storedSnapshot = (): Record<string, unknown> => JSON.parse(JSON.parse(fs.readFileSync(dataFile(), "utf8"))["aiws-db-v2"] as string);

beforeEach(async () => {
  getServerStore().setFaults({ fail: false, latencyMs: 0 });
  await getServerStore().api.data.reset();
});

describe("маршруты коллекций", () => {
  it("GET списка → демо-лиды", async () => {
    const res = await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SEED_DATA.LEADS);
  });

  it("неизвестная коллекция → 404 not_found", async () => {
    const res = await listRoute(new Request("http://x/api/collections/nope"), colCtx("nope"));
    expect(await json(res)).toMatchObject({ status: 404, body: { code: "not_found" } });
  });

  it("POST создаёт запись, пишет в файл, вторая та же — 409 duplicate", async () => {
    const res = await createRoute(jsonRequest("http://x/api/collections/leads", "POST", lead()), colCtx("leads"));
    expect(res.status).toBe(201);
    expect(storedSnapshot()["LEADS"]).toContainEqual(lead());
    const again = await createRoute(jsonRequest("http://x/api/collections/leads", "POST", lead()), colCtx("leads"));
    expect(await json(again)).toMatchObject({ status: 409, body: { code: "duplicate" } });
  });

  it("битое JSON-тело → 400 validation", async () => {
    const res = await createRoute(new Request("http://x/api/collections/leads", { method: "POST", body: "{oops" }), colCtx("leads"));
    expect(await json(res)).toMatchObject({ status: 400, body: { code: "validation" } });
  });

  it("запись не по схеме → 400 validation с сообщением движка", async () => {
    const res = await createRoute(jsonRequest("http://x/api/collections/leads", "POST", { id: "LD-8002", name: "" }), colCtx("leads"));
    expect(await json(res)).toMatchObject({ status: 400, body: { code: "validation" } });
  });

  it("GET записи: есть → 200, нет → 404; PUT патчит и валидирует; DELETE удаляет (204)", async () => {
    await createRoute(jsonRequest("http://x/api/collections/leads", "POST", lead()), colCtx("leads"));
    const got = await itemRoute(new Request("http://x/api/collections/leads/LD-8001"), itemCtx("leads", "LD-8001"));
    expect(got.status).toBe(200);
    expect((await itemRoute(new Request("http://x/api/collections/leads/LD-9"), itemCtx("leads", "LD-9"))).status).toBe(404);

    const put = await updateRoute(jsonRequest("http://x/api/collections/leads/LD-8001", "PUT", { name: "Правка" }), itemCtx("leads", "LD-8001"));
    expect(put.status).toBe(200);
    expect((await put.json()) as { name: string }).toMatchObject({ name: "Правка" });
    const badPut = await updateRoute(jsonRequest("http://x/api/collections/leads/LD-8001", "PUT", { channel: "hacked" }), itemCtx("leads", "LD-8001"));
    expect(await json(badPut)).toMatchObject({ status: 400, body: { code: "validation" } });

    const del = await removeRoute(new Request("http://x/api/collections/leads/LD-8001", { method: "DELETE" }), itemCtx("leads", "LD-8001"));
    expect(del.status).toBe(204);
    expect((await itemRoute(new Request("http://x/api/collections/leads/LD-8001"), itemCtx("leads", "LD-8001"))).status).toBe(404);
    expect((await removeRoute(new Request("http://x/api/collections/leads/LD-8001", { method: "DELETE" }), itemCtx("leads", "LD-8001"))).status).toBe(404);
  });

  it("batch: массив лидов одной записью; для не-лидов и не-массива — 400", async () => {
    const items = [lead(), { ...SEED_DATA.LEADS[1]!, id: "LD-8002" }];
    const res = await batchRoute(jsonRequest("http://x/api/collections/leads/batch", "POST", { items }), colCtx("leads"));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { items: unknown[] }).items).toEqual(items);
    const wrong = await batchRoute(jsonRequest("http://x/api/collections/agents/batch", "POST", { items: [] }), colCtx("agents"));
    expect(await json(wrong)).toMatchObject({ status: 400, body: { code: "validation" } });
    const noItems = await batchRoute(jsonRequest("http://x/api/collections/leads/batch", "POST", { leads: [] }), colCtx("leads"));
    expect(await json(noItems)).toMatchObject({ status: 400 });
  });
});

describe("маршруты курсов, профиля и справочников", () => {
  it("complete: сертификат 201, курс «Завершён», счёт cert-N корректен (в сиде один cert-1)", async () => {
    const first = await completeRoute(jsonRequest("http://x/api/collections/courses/crs-1/complete", "POST", { name: "Иван", score: 0.95 }), itemCtx("courses", "crs-1"));
    expect(first.status).toBe(201);
    const cert = (await first.json()) as { id: string; score: number };
    expect(cert.id).toBe("cert-2");
    expect(cert.score).toBe(0.95);
    const courses = (await (await listRoute(new Request("http://x/api/collections/courses"), colCtx("courses"))).json()) as { id: string; status: string }[];
    expect(courses.find((c) => c.id === "crs-1")?.status).toBe("Завершён");
    const missing = await completeRoute(jsonRequest("http://x/api/collections/courses/crs-99/complete", "POST", { name: "Иван", score: 1 }), itemCtx("courses", "crs-99"));
    expect(await json(missing)).toMatchObject({ status: 404, body: { code: "not_found" } });
    const wrong = await completeRoute(jsonRequest("http://x/api/collections/leads/LD-1/complete", "POST", { name: "Иван", score: 1 }), itemCtx("leads", "LD-1"));
    expect(wrong.status).toBe(404);
  });

  it("company-profile: get и update", async () => {
    const got = await profileGet();
    expect(got.status).toBe(200);
    const put = await profilePut(jsonRequest("http://x/api/company-profile", "PUT", { about: "Новое описание" }));
    expect(put.status).toBe(200);
    const after = await profileGet();
    expect(((await after.json()) as { about: string }).about).toBe("Новое описание");
  });

  it("справочники: channels — массив, неизвестный слаг — 404", async () => {
    const res = await referenceRoute(new Request("http://x/api/reference/channels"), { params: Promise.resolve({ name: "channels" }) });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
    const missing = await referenceRoute(new Request("http://x/api/reference/nope"), { params: Promise.resolve({ name: "nope" }) });
    expect(missing.status).toBe(404);
  });
});

describe("данные и панель сбоев", () => {
  it("export → снимок с version:1; import заменяет коллекции и считает пропуски; битый JSON → 422", async () => {
    const text = await (await exportRoute()).text();
    expect(JSON.parse(text)).toMatchObject({ version: 1, LEADS: SEED_DATA.LEADS });
    const snapshot = JSON.stringify({ version: 1, LEADS: [lead(), "битая"], NOTIFICATIONS: [] });
    const imp = await importRoute(new Request("http://x/api/data/import", { method: "POST", body: snapshot }));
    expect(await json(imp)).toMatchObject({ status: 200, body: { imported: ["LEADS", "NOTIFICATIONS"], dropped: 1 } });
    const bad = await importRoute(new Request("http://x/api/data/import", { method: "POST", body: "{nope" }));
    expect(await json(bad)).toMatchObject({ status: 422, body: { code: "invalid_import" } });
  });

  it("reset возвращает демо-данные после изменений", async () => {
    await createRoute(jsonRequest("http://x/api/collections/leads", "POST", lead()), colCtx("leads"));
    expect((await resetRoute()).status).toBe(200);
    const leads = (await (await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"))).json()) as unknown[];
    expect(leads).toEqual(SEED_DATA.LEADS);
  });

  it("debug: fail → 503 unavailable на всех запросах данных; обратно false → работает", async () => {
    expect(await (await debugGet()).json()).toEqual({ fail: false, latencyMs: 0 });
    const on = await debugPost(jsonRequest("http://x/api/debug", "POST", { fail: true }));
    expect(await on.json()).toEqual({ fail: true, latencyMs: 0 });
    const res = await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"));
    expect(await json(res)).toMatchObject({ status: 503, body: { code: "unavailable" } });
    await debugPost(jsonRequest("http://x/api/debug", "POST", { fail: false }));
    expect((await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"))).status).toBe(200);
  });

  it("debug: latencyMs реально задерживает ответ сервера", async () => {
    await debugPost(jsonRequest("http://x/api/debug", "POST", { latencyMs: 700 }));
    const started = Date.now();
    await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"));
    expect(Date.now() - started).toBeGreaterThanOrEqual(650);
    await debugPost(jsonRequest("http://x/api/debug", "POST", { latencyMs: 0 }));
    const quickStart = Date.now();
    await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"));
    expect(Date.now() - quickStart).toBeLessThan(400);
  });

  it("debug: corrupt пишет битый снимок, следующий запрос восстанавливает демо-данные и файл", async () => {
    await debugPost(jsonRequest("http://x/api/debug", "POST", { corrupt: true }));
    expect(fs.readFileSync(dataFile(), "utf8")).toContain("pwn");
    const res = await listRoute(new Request("http://x/api/collections/leads"), colCtx("leads"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SEED_DATA.LEADS);
    expect(storedSnapshot()["LEADS"]).toEqual(SEED_DATA.LEADS);
  });
});
