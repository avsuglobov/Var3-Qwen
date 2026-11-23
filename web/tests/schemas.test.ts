import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ACTIVITY, CHANNELS, FUNNELS, STAGES } from "@/lib/mock-data/reference";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { CHANNEL_IDS, COLLECTION_NAMES, ID_RE, agentSchema, certificateSchema, courseSchema, leadSchema, parseCollection } from "@/lib/schemas";
import { ROOT } from "./helpers";

function loadPrototypeData(): Record<string, unknown> {
  const src = fs.readFileSync(path.join(ROOT, "..", "download", "data.js"), "utf8");
  const win: Record<string, unknown> = { AIWS: { config: { APP_NAME: "AI Workspace", APP_TAGLINE: "x", APP_TAGLINE_SHORT: "x" } } };
  win["window"] = win;
  vm.runInNewContext(src, win);
  return (win["AIWS"] as { data: Record<string, unknown> }).data;
}

describe("демо-данные ↔ прототип", () => {
  const proto = loadPrototypeData();
  it("сид совпадает с данными прототипа (иначе перегенерируйте: node scripts/gen-seed.mjs)", () => {
    for (const name of COLLECTION_NAMES) expect(SEED_DATA[name], name).toEqual(proto[name]);
    expect(ACTIVITY).toEqual(proto["ACTIVITY"]);
    expect(STAGES).toEqual(proto["STAGES"]);
    expect(FUNNELS).toEqual(proto["FUNNELS"]);
    expect(CHANNELS).toEqual(proto["CHANNELS"]);
  });
  it("каналы справочника = допустимые id каналов в схемах", () => {
    expect(Object.keys(CHANNELS).sort()).toEqual([...CHANNEL_IDS].sort());
  });
});

describe("схемы принимают весь демо-набор (паритет с валидаторами db.js)", () => {
  for (const name of COLLECTION_NAMES) {
    it(`${name}: ни одна демо-запись не отбрасывается`, () => {
      const r = parseCollection(name, SEED_DATA[name]);
      expect(r).not.toBeNull();
      expect(r?.dropped).toBe(0);
      expect(r?.items).toHaveLength(SEED_DATA[name].length);
    });
  }
});

describe("безопасный id (id попадает в атрибуты и URL)", () => {
  it("допустимы латиница, цифры, _ и -, длина 1–40", () => {
    for (const ok of ["LD-1042", "ag-new-3", "a", "x".repeat(40), "A_b-9"]) expect(ID_RE.test(ok), ok).toBe(true);
    for (const bad of ["", "x".repeat(41), "a b", "id\"><b>", "кириллица", "a/b", "a'b", "<x>"]) expect(ID_RE.test(bad), bad).toBe(false);
  });
});

describe("parseCollection: битые данные из недоверенного источника", () => {
  const lead = SEED_DATA.LEADS[0]!;
  it("не массив → null (коллекция заменяется демо-данными)", () => {
    for (const v of ["oops", null, undefined, 42, {}]) expect(parseCollection("LEADS", v)).toBeNull();
  });
  it("пустой массив допустим (пользователь удалил всё)", () => {
    expect(parseCollection("LEADS", [])).toEqual({ items: [], dropped: 0 });
  });
  it("битые записи отбрасываются, валидные остаются; счётчик dropped", () => {
    const r = parseCollection("LEADS", [lead, { id: "TK-99" }, null, 7, { ...lead, id: "x\"><b id=\"pwn\">" }, { ...lead, id: "LD-2", channel: "zzz" }]);
    expect(r?.items.map((l) => l.id)).toEqual([lead.id]);
    expect(r?.dropped).toBe(5);
  });
  it("дубли id отбрасываются (остаётся первая запись)", () => {
    const r = parseCollection("LEADS", [lead, { ...lead, name: "Другое" }]);
    expect(r?.items).toHaveLength(1);
    expect(r?.items[0]?.name).toBe(lead.name);
  });
  it("во входе были записи, но ни одна не валидна → null", () => {
    expect(parseCollection("LEADS", [{ id: "x" }, 1])).toBeNull();
  });
  it("лишние поля отбрасываются, ts у события сохраняется", () => {
    const r = leadSchema.parse({ ...lead, extra: "x", events: [{ t: "10:00", ts: 5, actor: "human", text: "ok" }] });
    expect("extra" in r).toBe(false);
    expect(r.events[0]?.ts).toBe(5);
  });
});

describe("правила полей (из db.js)", () => {
  const agent = SEED_DATA.AGENTS[0]!;
  it("агент: неизвестная роль, статус, канал и длинная инструкция отклоняются", () => {
    expect(agentSchema.safeParse({ ...agent, role: "hacker" }).success).toBe(false);
    expect(agentSchema.safeParse({ ...agent, status: "hacked" }).success).toBe(false);
    expect(agentSchema.safeParse({ ...agent, channels: ["telegram", "zzz"] }).success).toBe(false);
    expect(agentSchema.safeParse({ ...agent, instruction: "x".repeat(5001) }).success).toBe(false);
    expect(agentSchema.safeParse({ ...agent, monogram: "TOOLONGX" }).success).toBe(false);
    expect(agentSchema.safeParse({ ...agent, funnelId: null }).success).toBe(true);
  });
  it("курс и сертификат: прогресс и оценка в диапазоне 0..1", () => {
    const course = SEED_DATA.COURSES[0]!;
    expect(courseSchema.safeParse({ ...course, progress: 1.01 }).success).toBe(false);
    expect(courseSchema.safeParse({ ...course, progress: -0.1 }).success).toBe(false);
    expect(courseSchema.safeParse({ ...course, lessons: 201 }).success).toBe(false);
    const cert = SEED_DATA.CERTIFICATES[0]!;
    expect(certificateSchema.safeParse({ ...cert, score: 1.2 }).success).toBe(false);
    expect(certificateSchema.safeParse({ ...cert, score: 0.8 }).success).toBe(true);
  });
  it("документ: сумма не выдумывается — допускается null/отсутствие", () => {
    expect(SEED_DATA.DOCUMENTS.every((d) => d.amount == null)).toBe(true);
  });
});
