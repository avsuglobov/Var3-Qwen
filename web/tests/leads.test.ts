import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { buildImportedLeads, collectRows, IMPORT_TEMPLATE_CSV, IMPORT_TEMPLATE_NAME, importedLeads, importedLeadEvent } from "@/lib/selectors/leads";

/**
 * Чистая логика группы «Лиды и автокасания» — поведение doImport()/createLeads() прототипа:
 * сбор строк по сопоставлению, заметка из колонок, дедупликация, пакетное создание, счётчик импорта.
 */

describe("collectRows: сбор строк по сопоставлению", () => {
  const rows = [
    ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "2025-09-01", "Хочет демо"],
    ["", "+7 900 000-00-03", "", "", "без имени"],
    ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "", ""],
    ["Анна Смирнова", "", "anna@demo.test", "", ""]
  ];
  const mapping = ["name", "phone", "email", "lastContact", "note"] as const;

  it("заметка собирается из сопоставленных колонок через « · »", () => {
    const r = collectRows(rows, [...mapping]);
    expect(r.list[0]).toEqual({
      name: "Иван Петров",
      note: "Телефон: +7 900 000-00-01 · Email: ivan@demo.test · Последний контакт: 2025-09-01 · Хочет демо"
    });
  });
  it("строки без имени пропускаются и считаются (noName)", () => {
    const r = collectRows(rows, [...mapping]);
    expect(r.noName).toBe(1);
    expect(r.list.some((x) => x.name === "")).toBe(false);
  });
  it("повторы по «имя|телефон|email» без учёта регистра пропускаются (dup)", () => {
    const r = collectRows(rows, [...mapping]);
    expect(r.dup).toBe(1);
    expect(r.list.filter((x) => x.name === "Иван Петров").length).toBe(1);
  });
  it("колонка «не использовать» не попадает в заметку", () => {
    const r = collectRows([["Ольга", "+7 5", "o@demo.test"]], ["name", "skip", "email"]);
    expect(r.list[0]).toEqual({ name: "Ольга", note: "Email: o@demo.test" });
  });
  it("все строки без сопоставленного имени — импортировать нечего", () => {
    const r = collectRows([["x", "y"]], ["skip", "skip"]);
    expect(r.list.length).toBe(0);
    expect(r.noName).toBe(1);
  });
  it("вход не мутируется", () => {
    const before = JSON.stringify(rows);
    collectRows(rows, [...mapping]);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("buildImportedLeads: пакетное создание", () => {
  const rows = [
    { name: "Иван Петров", note: "Телефон: +7 900 000-00-01" },
    { name: "Анна Смирнова", note: "" }
  ];

  it("сквозные id после сида (LD-1043, LD-1044), стадия «new», воронка/агент/канал", () => {
    const made = buildImportedLeads({
      rows,
      leads: SEED_DATA.LEADS,
      funnelId: "fn-support",
      agentId: "ag-support",
      channel: "email",
      time: "14:05"
    });
    expect(made.map((l) => l.id)).toEqual(["LD-1043", "LD-1044"]);
    for (const l of made) {
      expect(l.stageId).toBe("new");
      expect(l.funnelId).toBe("fn-support");
      expect(l.agentId).toBe("ag-support");
      expect(l.channel).toBe("email");
      expect(l.value).toBeNull();
      expect(l.lastActivity).toBe("14:05");
    }
  });
  it("событие «Импортирован из файла», актор — человек, UTC-время", () => {
    const made = buildImportedLeads({ rows, leads: SEED_DATA.LEADS, funnelId: "fn-sales", agentId: "ag-sales", channel: "site", time: "09:30" });
    expect(made[0]?.events).toEqual([{ t: "09:30", ts: expect.any(Number), actor: "human", text: "Импортирован из файла" }]);
  });
  it("имя до 300, заметка до 1900 символов (как createLeads прототипа)", () => {
    const longName = "И".repeat(400);
    const longNote = "З".repeat(2000);
    const made = buildImportedLeads({
      rows: [{ name: longName, note: longNote }],
      leads: SEED_DATA.LEADS,
      funnelId: "fn-sales",
      agentId: "ag-sales",
      channel: "site"
    });
    expect(made[0]?.name.length).toBe(300);
    expect(made[0]?.note?.length).toBe(1900);
  });
  it("importedLeadEvent и счётчик импорта: сид — 0, после импорта — созданные", () => {
    expect(importedLeadEvent("10:10")).toEqual({ t: "10:10", ts: expect.any(Number), actor: "human", text: "Импортирован из файла" });
    expect(importedLeads(SEED_DATA.LEADS).length).toBe(0);
    const made = buildImportedLeads({ rows, leads: SEED_DATA.LEADS, funnelId: "fn-sales", agentId: "ag-sales", channel: "site", time: "10:00" });
    expect(importedLeads([...SEED_DATA.LEADS, ...made]).length).toBe(2);
  });
});

describe("шаблон CSV", () => {
  it("BOM, разделитель «;», колонки как в прототипе", () => {
    expect(IMPORT_TEMPLATE_CSV.startsWith("\uFEFF")).toBe(true);
    expect(IMPORT_TEMPLATE_CSV).toContain("Имя;Телефон;Email;Последний контакт");
    expect(IMPORT_TEMPLATE_NAME).toBe("шаблон-импорта-лидов.csv");
  });
});
