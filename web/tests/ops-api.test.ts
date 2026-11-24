import { describe, expect, it } from "vitest";
import { ApiError, createLocalApi, createMemoryStorage } from "@/lib/api";
import { CHAIN_TEMPLATES, KNOWLEDGE_SOURCES, SUPPLY_OFFERS, SUPPLY_REQUESTS } from "@/lib/mock-data/reference";
import { SEED_DATA } from "@/lib/mock-data/seed";

/* Слой данных группы «Хранилище, Команда, Снабжение, Обучение» (этап 3, группа 7):
   завершение курса сертификатом (db.js completeCourse), описание компании, справочники. */

describe("api: courses.complete — сертификат за тест (regress_learn)", () => {
  it("успех: cert-2, имя обрезается, курс завершён, дата ГГГГ-ММ-ДД", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const cert = await api.courses.complete("crs-2", { name: "  Тестов Тест  ", score: 0.75 });
    expect(cert.id).toBe("cert-2");
    expect(cert.name).toBe("Тестов Тест");
    expect(cert.course).toBe("Демо-курс «Скрипты продаж»");
    expect(cert.date).toBe(new Date().toISOString().slice(0, 10));
    expect(cert.score).toBe(0.75);
    const course = (await api.courses.list()).find((c) => c.id === "crs-2");
    expect(course).toMatchObject({ progress: 1, status: "Завершён" });
    expect((await api.certificates.list()).some((c) => c.id === "cert-2")).toBe(true);
  });
  it("сохранение переживает пересоздание адаптера с тем же хранилищем", async () => {
    const st = createMemoryStorage();
    const api = createLocalApi({ storage: st });
    await api.courses.complete("crs-2", { name: "Аня", score: 1 });
    const api2 = createLocalApi({ storage: st });
    expect((await api2.courses.list()).find((c) => c.id === "crs-2")?.progress).toBe(1);
    expect((await api2.certificates.list()).some((c) => c.name === "Аня")).toBe(true);
  });
  it("пустое имя → validation, неизвестный курс → not_found; данные не меняются", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    await expect(api.courses.complete("crs-2", { name: "   ", score: 1 })).rejects.toSatisfy((e: ApiError) => e.code === "validation");
    await expect(api.courses.complete("nope", { name: "Аня", score: 1 })).rejects.toSatisfy((e: ApiError) => e.code === "not_found");
    expect((await api.certificates.list()).length).toBe(1);
    expect((await api.courses.list()).find((c) => c.id === "crs-2")?.progress).toBe(0);
  });
});

describe("api: companyProfile — описание компании в «Хранилище»", () => {
  it("get возвращает демо-профиль; update сохраняет и переживает пересоздание", async () => {
    const st = createMemoryStorage();
    const api = createLocalApi({ storage: st });
    expect(await api.companyProfile.get()).toMatchObject({ name: "Демо-компания" });
    const saved = await api.companyProfile.update({ name: "ООО «Демо»" });
    expect(saved.name).toBe("ООО «Демо»");
    const api2 = createLocalApi({ storage: st });
    expect((await api2.companyProfile.get()).name).toBe("ООО «Демо»");
    expect((await api2.companyProfile.get()).about).toBe(SEED_DATA.COMPANY_PROFILE.about);
  });
  it("экспорт → импорт того же файла идемпотентен (профиль перезаписывается, dropped = 0)", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    await api.companyProfile.update({ name: "ООО «Демо»" });
    const json = await api.data.exportJSON();
    const r = await api.data.importJSON(json);
    expect(r.dropped).toBe(0);
    expect((await api.companyProfile.get()).name).toBe("ООО «Демо»");
  });
  it("битый профиль в файле импорта отбрасывается (dropped = 1), демо-профиль остаётся", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const json = JSON.stringify({ version: 1, ...SEED_DATA, COMPANY_PROFILE: { name: "" } });
    const r = await api.data.importJSON(json);
    expect(r.dropped).toBe(1);
    expect((await api.companyProfile.get()).name).toBe("Демо-компания");
  });
});

describe("api: reference-справочники группы (read-only, как в прототипе)", () => {
  it("источники знаний, шаблоны цепочек, снабжение — совпадают с сидом прототипа", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    expect(await api.reference.knowledgeSources()).toEqual(KNOWLEDGE_SOURCES);
    expect(await api.reference.chainTemplates()).toEqual(CHAIN_TEMPLATES);
    expect(await api.reference.supplyRequests()).toEqual(SUPPLY_REQUESTS);
    expect(await api.reference.supplyOffers()).toEqual(SUPPLY_OFFERS);
  });
  it("quizzes: pass 0.7, три курса с вопросами", async () => {
    const { pass, quizzes } = await createLocalApi({ storage: createMemoryStorage() }).reference.quizzes();
    expect(pass).toBe(0.7);
    expect(Object.keys(quizzes).sort()).toEqual(["crs-1", "crs-2", "crs-3"]);
  });
});
