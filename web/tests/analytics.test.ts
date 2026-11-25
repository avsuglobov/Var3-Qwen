import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { DIALOG_REVIEW, analyticsKpis, reviewIsOk } from "@/lib/selectors/analytics";
import type { Lead } from "@/lib/schemas";

/* KPI «Аналитики» (этап 7) — правила согласования:
   «Качество цепочки» — доля строк разбора без нарушений; «Нарушений скрипта» — строки
   разбора с нарушением; «Эскалаций к человеку» — лиды с «Эскалация» в заметке
   (единое правило с «КРИТИЧНО» на канбане CRM). */

describe("аналитика: разбор диалогов (этап 3)", () => {
  it("reviewIsOk: «Нет (…)» — в рамках скрипта, остальное — нарушение", () => {
    expect(reviewIsOk(DIALOG_REVIEW[1])).toBe(true);
    expect(reviewIsOk(DIALOG_REVIEW[0])).toBe(false);
    expect(reviewIsOk(DIALOG_REVIEW[2])).toBe(false);
  });
});

describe("пересчёт KPI аналитики (этап 7)", () => {
  const leads: Lead[] = [
    { id: "LD-1", name: "А", channel: "site", stageId: "st-1", funnelId: "fn-sales", agentId: "ag-sales", value: null, note: "Эскалация", events: [] },
    { id: "LD-2", name: "Б", channel: "site", stageId: "st-1", funnelId: "fn-sales", agentId: "ag-sales", value: null, note: "Эскалация в ночную смену", events: [] },
    { id: "LD-3", name: "В", channel: "site", stageId: "st-1", funnelId: "fn-sales", agentId: "ag-sales", value: null, note: null, events: [] }
  ];
  it("демо-разбор: 2 нарушения из 3 → качество 33%, нарушений 2", () => {
    const k = analyticsKpis(DIALOG_REVIEW, []);
    expect(k.quality).toBe("33%");
    expect(k.violations).toBe(2);
  });
  it("эскалации: лиды с «Эскалация» в заметке (то же правило, что isCritical)", () => {
    const k = analyticsKpis(DIALOG_REVIEW, leads);
    expect(k.escalations).toBe(2);
  });
  it("на демо-сиде: эскалаций 1 (лид с note «Эскалация»), качество и нарушения — из разбора", () => {
    const k = analyticsKpis(DIALOG_REVIEW, SEED_DATA.LEADS);
    expect(k.escalations).toBe(1);
    expect(k.violations).toBe(2);
    expect(k.quality).toBe("33%");
  });
  it("без строк разбора качество — «—»", () => {
    expect(analyticsKpis([], SEED_DATA.LEADS).quality).toBe("—");
  });
});
