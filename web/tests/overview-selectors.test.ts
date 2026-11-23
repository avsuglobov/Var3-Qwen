import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { compareNewestFirst, computeKpis, onboardingProgress, recentJournal } from "@/lib/selectors/overview";

describe("KPI обзора", () => {
  const k = computeKpis(SEED_DATA.LEADS, SEED_DATA.DOCUMENTS, SEED_DATA.CONVERSATIONS);
  it("значения на демо-данных совпадают с прототипом", () => {
    expect(k).toEqual({ leads: 6, documents: 4, aiMessages: 4, handedOff: 2, escalated: 1 });
  });
  it("перенос карточки менеджером не считается «передачей»", () => {
    const leads = structuredClone(SEED_DATA.LEADS);
    leads[0]!.events.push({ t: "10:00", ts: 1, actor: "human", text: "Перемещён в стадию «В работе»" });
    expect(computeKpis(leads, [], []).handedOff).toBe(k.handedOff);
    leads[0]!.events.push({ t: "10:01", ts: 2, actor: "human", text: "Передано менеджеру на закрытие" });
    expect(computeKpis(leads, [], []).handedOff).toBe(k.handedOff + 1);
  });
  it("пустые данные → нули (интерфейс покажет «—»)", () => {
    expect(computeKpis([], [], [])).toEqual({ leads: 0, documents: 0, aiMessages: 0, handedOff: 0, escalated: 0 });
  });
});

describe("журнал смены", () => {
  it("демо-события отсортированы по времени, новые события (ts) всегда выше", () => {
    const rows = recentJournal(SEED_DATA.LEADS, 8);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ t: "13:02", actor: "ai" });
    const times = rows.map((r) => r.t);
    expect([...times].sort().reverse()).toEqual(times);
    const leads = structuredClone(SEED_DATA.LEADS);
    leads[3]!.events.push({ t: "07:35", ts: Date.now(), actor: "human", text: "Лид создан вручную" });
    expect(recentJournal(leads, 8)[0]?.text).toBe("Лид создан вручную");
  });
  it("лимит и равные времена не переставляют порядок", () => {
    expect(recentJournal(SEED_DATA.LEADS, 3)).toHaveLength(3);
    const a = { t: "10:00", actor: "ai" as const, text: "a" };
    const b = { t: "10:00", actor: "ai" as const, text: "b" };
    expect(compareNewestFirst(a, b)).toBe(0);
  });
});

describe("прогресс онбординга", () => {
  it("4 из 7 → 57%; пусто → 0%", () => {
    expect(onboardingProgress(SEED_DATA.ONBOARDING)).toEqual({ done: 4, total: 7, percent: 57 });
    expect(onboardingProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});
