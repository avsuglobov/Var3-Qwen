import { describe, expect, it } from "vitest";
import { ApiError, FAIL_FLAG_KEY, STORAGE_KEY, createLocalApi, createMemoryStorage, type StorageLike } from "@/lib/api";
import { SEED_DATA } from "@/lib/mock-data/seed";

const snapshotWith = (mut: (s: Record<string, unknown>) => void): string => {
  const s = { version: 1, ...structuredClone(SEED_DATA) } as unknown as Record<string, unknown>;
  mut(s);
  return JSON.stringify(s);
};
const withStorage = (raw: string): StorageLike => { const st = createMemoryStorage(); st.setItem(STORAGE_KEY, raw); return st; };

describe("адаптер localStorage: загрузка", () => {
  it("пустое хранилище → демо-данные, снимок сразу сохраняется", async () => {
    const st = createMemoryStorage();
    const api = createLocalApi({ storage: st });
    expect(await api.leads.list()).toEqual(SEED_DATA.LEADS);
    expect(JSON.parse(st.getItem(STORAGE_KEY) as string).version).toBe(1);
  });
  it("повреждённая коллекция (LEADS: \"oops\") → демо-лиды, остальные коллекции сохранены", async () => {
    const api = createLocalApi({ storage: withStorage(snapshotWith((s) => { s["LEADS"] = "oops"; (s["TASKS"] as { title: string }[])[0]!.title = "Моя задача"; })) });
    expect(await api.leads.list()).toEqual(SEED_DATA.LEADS);
    expect((await api.tasks.list())[0]?.title).toBe("Моя задача");
  });
  it("невалидный JSON и чужая версия → демо-данные", async () => {
    expect(await createLocalApi({ storage: withStorage("{not json") }).leads.list()).toEqual(SEED_DATA.LEADS);
    expect(await createLocalApi({ storage: withStorage(JSON.stringify({ version: 99, LEADS: [] })) }).leads.list()).toEqual(SEED_DATA.LEADS);
  });
  it("битые записи отбрасываются: XSS-id, неизвестный статус, неполные", async () => {
    const api = createLocalApi({ storage: withStorage(snapshotWith((s) => {
      (s["TASKS"] as unknown[]).push({ id: "TK-99" }, null, { ...SEED_DATA.TASKS[0], id: "x\"><b id=\"pwn\">" });
      (s["DOCUMENTS"] as { status: string }[])[0]!.status = "hacked";
      (s["AGENTS"] as unknown[]).push({ ...SEED_DATA.AGENTS[0], id: "ag-bad", role: "hacker" });
    })) });
    expect(await api.tasks.list()).toHaveLength(SEED_DATA.TASKS.length);
    expect(await api.documents.list()).toHaveLength(SEED_DATA.DOCUMENTS.length - 1);
    expect(await api.agents.list()).toHaveLength(SEED_DATA.AGENTS.length);
  });
  it("хранилище недоступно (бросает исключения) → работаем в памяти", async () => {
    const broken: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); } };
    const api = createLocalApi({ storage: broken });
    expect(await api.leads.list()).toEqual(SEED_DATA.LEADS);
    await api.onboarding.update("reg", { done: false });
    expect((await api.onboarding.get("reg"))?.done).toBe(false);
  });
});

describe("адаптер: CRUD и сохранение", () => {
  it("create → второй экземпляр на том же хранилище видит запись", async () => {
    const st = createMemoryStorage();
    const lead = { ...SEED_DATA.LEADS[0]!, id: "LD-5000", name: "Новый" };
    await createLocalApi({ storage: st }).leads.create(lead);
    const again = await createLocalApi({ storage: st }).leads.list();
    expect(again.find((l) => l.id === "LD-5000")?.name).toBe("Новый");
    expect(again).toHaveLength(SEED_DATA.LEADS.length + 1);
  });
  it("create: дубль id и некорректные данные отклоняются с кодами", async () => {
    const api = createLocalApi();
    await expect(api.leads.create({ ...SEED_DATA.LEADS[0]! })).rejects.toMatchObject({ code: "duplicate" });
    await expect(api.leads.create({ ...SEED_DATA.LEADS[0]!, id: "LD-9", channel: "zzz" as never })).rejects.toMatchObject({ code: "validation" });
    await expect(api.leads.create({ ...SEED_DATA.LEADS[0]!, id: "bad id" })).rejects.toBeInstanceOf(ApiError);
  });
  it("update: слияние патча, id не меняется, некорректный патч отклоняется и ничего не портит", async () => {
    const api = createLocalApi();
    const upd = await api.agents.update("ag-sales", { instruction: "Новая", id: "hacked" } as never);
    expect(upd.id).toBe("ag-sales");
    expect(upd.instruction).toBe("Новая");
    await expect(api.agents.update("ag-sales", { role: "hacker" } as never)).rejects.toMatchObject({ code: "validation" });
    expect((await api.agents.get("ag-sales"))?.role).toBe("sales");
    await expect(api.agents.update("nope", {})).rejects.toMatchObject({ code: "not_found" });
  });
  it("remove и get несуществующего", async () => {
    const api = createLocalApi();
    await api.leads.remove("LD-1042");
    expect(await api.leads.get("LD-1042")).toBeUndefined();
    await expect(api.leads.remove("LD-1042")).rejects.toMatchObject({ code: "not_found" });
  });
  it("возвращаются копии: изменение результата не портит хранилище", async () => {
    const api = createLocalApi();
    const list = await api.leads.list();
    list[0]!.name = "ИСПОРЧЕНО";
    expect((await api.leads.list())[0]?.name).toBe(SEED_DATA.LEADS[0]?.name);
  });
});

describe("адаптер: сбой сервиса, экспорт/импорт, сброс", () => {
  it("флаг имитации сбоя: все запросы падают с unavailable и понятным текстом", async () => {
    const st = createMemoryStorage();
    st.setItem(FAIL_FLAG_KEY, "1");
    const api = createLocalApi({ storage: st });
    await expect(api.leads.list()).rejects.toMatchObject({ code: "unavailable", message: expect.stringContaining("недоступен") });
    await expect(api.reference.activity()).rejects.toBeInstanceOf(ApiError);
    st.removeItem(FAIL_FLAG_KEY);
    expect(await api.leads.list()).toHaveLength(SEED_DATA.LEADS.length);
  });
  it("экспорт в формате прототипа и импорт возвращают те же данные", async () => {
    const a = createLocalApi();
    await a.onboarding.update("reg", { done: false });
    const json = await a.data.exportJSON();
    expect(JSON.parse(json).version).toBe(1);
    const b = createLocalApi();
    const res = await b.data.importJSON(json);
    expect(res.imported).toHaveLength(10);
    expect(res.dropped).toBe(0);
    expect((await b.onboarding.get("reg"))?.done).toBe(false);
  });
  it("импорт: битые записи пропускаются со счётчиком; непригодный файл отклоняется, данные целы", async () => {
    const api = createLocalApi();
    const res = await api.data.importJSON(JSON.stringify({ version: 1, LEADS: "x", TASKS: [{ ...SEED_DATA.TASKS[0] }, { id: "x\"><i>" }] }));
    expect(res.imported).toEqual(["TASKS"]);
    expect(res.dropped).toBeGreaterThanOrEqual(2);
    expect(await api.tasks.list()).toHaveLength(1);
    expect(await api.leads.list()).toHaveLength(SEED_DATA.LEADS.length);
    await expect(api.data.importJSON("not json")).rejects.toMatchObject({ code: "invalid_import" });
    await expect(api.data.importJSON(JSON.stringify({ version: 2 }))).rejects.toMatchObject({ code: "invalid_import" });
    await expect(api.data.importJSON(JSON.stringify({ version: 1, LEADS: "x" }))).rejects.toMatchObject({ code: "invalid_import" });
    expect(await api.tasks.list()).toHaveLength(1);
  });
  it("reset возвращает демо-данные", async () => {
    const api = createLocalApi();
    await api.leads.remove("LD-1042");
    await api.data.reset();
    expect(await api.leads.list()).toEqual(SEED_DATA.LEADS);
  });
  it("задержка имитации сети соблюдается", async () => {
    const api = createLocalApi({ latencyMs: 30 });
    const t0 = Date.now();
    await api.leads.list();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });
});
