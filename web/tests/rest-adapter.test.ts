import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { ApiError, createRestApi } from "@/lib/api";
import { SEED_DATA } from "@/lib/mock-data/seed";

/** REST-адаптер против MSW: маршруты, тела запросов и разворачивание HTTP-ошибок в ApiError (этап 4). */

const BASE = "http://api.local";
const api = createRestApi({ baseUrl: BASE });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const lead = { ...SEED_DATA.LEADS[0]!, id: "LD-7000", name: "Тестовый лид" };
const captured = { method: "", url: "", body: "" };

describe("адаптер REST: чтение", () => {
  it("list → GET /api/collections/leads, записи разбираются", async () => {
    server.use(
      http.get(`${BASE}/api/collections/leads`, async ({ request }) => {
        captured.method = request.method;
        captured.url = request.url;
        return HttpResponse.json(SEED_DATA.LEADS);
      })
    );
    expect(await api.leads.list()).toEqual(SEED_DATA.LEADS);
    expect(captured.method).toBe("GET");
    expect(captured.url).toBe(`${BASE}/api/collections/leads`);
  });

  it("get → запись; 404 → undefined (не ошибка)", async () => {
    server.use(http.get(`${BASE}/api/collections/leads/LD-1`, () => HttpResponse.json(lead)));
    expect(await api.leads.get("LD-1")).toEqual(lead);
    server.use(http.get(`${BASE}/api/collections/leads/missing`, () => HttpResponse.json({ code: "not_found", message: "нет" }, { status: 404 })));
    expect(await api.leads.get("missing")).toBeUndefined();
  });

  it("справочники по своим маршрутам: channels массив, quizzes — {pass, quizzes}", async () => {
    server.use(http.get(`${BASE}/api/reference/channels`, () => HttpResponse.json([{ id: "c1" }, { id: "c2" }])));
    await expect(api.reference.channels()).resolves.toEqual([{ id: "c1" }, { id: "c2" }]);
    server.use(http.get(`${BASE}/api/reference/quizzes`, () => HttpResponse.json({ pass: 0.7, quizzes: { "q-1": [] } })));
    expect(await api.reference.quizzes()).toEqual({ pass: 0.7, quizzes: { "q-1": [] } });
    server.use(http.get(`${BASE}/api/reference/integrations`, () => HttpResponse.json([{ id: "int-1" }])));
    await expect(api.reference.integrations()).resolves.toEqual([{ id: "int-1" }]);
  });

  it("экспорт — текст снимка; импорт отправляет текст как есть; reset — POST", async () => {
    server.use(http.get(`${BASE}/api/data/export`, () => HttpResponse.text('{"version":1,"LEADS":[]}')));
    expect(await api.data.exportJSON()).toBe('{"version":1,"LEADS":[]}');
    let imported = "";
    server.use(
      http.post(`${BASE}/api/data/import`, async ({ request }) => {
        imported = await request.text();
        return HttpResponse.json({ imported: ["LEADS"], dropped: 0 });
      })
    );
    expect(await api.data.importJSON('{"version":1,"LEADS":[]}')).toEqual({ imported: ["LEADS"], dropped: 0 });
    expect(imported).toBe('{"version":1,"LEADS":[]}');
    let resetMethod = "";
    server.use(
      http.post(`${BASE}/api/data/reset`, ({ request }) => {
        resetMethod = request.method;
        return HttpResponse.json({ ok: true });
      })
    );
    await api.data.reset();
    expect(resetMethod).toBe("POST");
  });
});

describe("адаптер REST: запись", () => {
  it("create → POST с JSON-телом, ответ 201 разбирается", async () => {
    server.use(
      http.post(`${BASE}/api/collections/leads`, async ({ request }) => {
        captured.body = await request.text();
        return HttpResponse.json(lead, { status: 201 });
      })
    );
    expect(await api.leads.create(lead)).toEqual(lead);
    expect(JSON.parse(captured.body)).toEqual(lead);
  });

  it("update → PUT патчем по id; remove → DELETE и 204 без тела", async () => {
    server.use(http.put(`${BASE}/api/collections/leads/LD-7000`, async ({ request }) => HttpResponse.json({ ...lead, name: "Правка" }, { headers: { "x-method": request.method } })));
    expect(await api.leads.update("LD-7000", { name: "Правка" })).toEqual({ ...lead, name: "Правка" });
    server.use(http.delete(`${BASE}/api/collections/leads/LD-7000`, () => new HttpResponse(null, { status: 204 })));
    await expect(api.leads.remove("LD-7000")).resolves.toBeUndefined();
  });

  it("createMany → POST /leads/batch с {items}, ответ {items}", async () => {
    server.use(
      http.post(`${BASE}/api/collections/leads/batch`, async ({ request }) => {
        const body = (await request.json()) as { items: unknown[] };
        return HttpResponse.json({ items: body.items }, { status: 201 });
      })
    );
    expect(await api.leads.createMany([lead])).toEqual([lead]);
  });

  it("courses.complete → POST /courses/[id]/complete, ответ — сертификат", async () => {
    const cert = { id: "cert-9", name: "Иван", course: "Курс", date: "2026-11-24", score: 0.95 };
    server.use(
      http.post(`${BASE}/api/collections/courses/course-1/complete`, async ({ request }) => {
        const info = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...info, ...cert }, { status: 201 });
      })
    );
    expect(await api.courses.complete("course-1", { name: "Иван", score: 0.95 })).toMatchObject(cert);
  });

  it("companyProfile: get и update по /api/company-profile", async () => {
    const profile = SEED_DATA.COMPANY_PROFILE;
    server.use(http.get(`${BASE}/api/company-profile`, () => HttpResponse.json(profile)));
    expect(await api.companyProfile.get()).toEqual(profile);
    server.use(http.put(`${BASE}/api/company-profile`, () => HttpResponse.json({ ...profile, about: "Новое" })));
    expect(await api.companyProfile.update({ about: "Новое" })).toMatchObject({ about: "Новое" });
  });
});

describe("адаптер REST: ошибки", () => {
  it.each([
    [503, { code: "unavailable", message: "сервис недоступен (имитация сбоя)." }, "unavailable", "сервис недоступен (имитация сбоя)."],
    [409, { code: "duplicate", message: "Запись LD-7000 уже существует" }, "duplicate", "Запись LD-7000 уже существует"],
    [400, { code: "validation", message: "Некорректные данные: name" }, "validation", "Некорректные данные: name"],
    [422, { code: "invalid_import", message: "Неподдерживаемый формат файла" }, "invalid_import", "Неподдерживаемый формат файла"],
    [404, { code: "not_found", message: "Запись LD-9 не найдена" }, "not_found", "Запись LD-9 не найдена"]
  ] as const)("HTTP %i → ApiError %s", async (status, body, code, message) => {
    server.use(http.post(`${BASE}/api/collections/leads`, () => HttpResponse.json(body, { status })));
    const err = await api.leads.create(lead).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    expect((err as ApiError).message).toBe(message);
  });

  it("ошибка без JSON-тела → код по статусу, запасное сообщение", async () => {
    server.use(http.post(`${BASE}/api/collections/leads`, () => new HttpResponse(null, { status: 500 })));
    const err = await api.leads.create(lead).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe("unavailable");
    expect((err as ApiError).message).toBe("Сервис вернул ошибку 500");
  });

  it("сетевой сбой (fetch reject) → ApiError unavailable с понятным текстом", async () => {
    server.use(http.post(`${BASE}/api/collections/leads`, () => HttpResponse.error()));
    const err = await api.leads.create(lead).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe("unavailable");
    expect((err as ApiError).message).toContain("сеть недоступна");
  });
});
