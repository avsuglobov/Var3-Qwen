import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { FUNNELS, INTEGRATIONS, STAGES } from "@/lib/mock-data/reference";
import {
  ACTOR_META,
  CRM_SORTS,
  buildLead,
  conversationForLead,
  crmSyncLabel,
  crmSyncOk,
  crmSyncRows,
  createdLeadEvent,
  filterByStage,
  funnelLeads,
  funnelStages,
  isCritical,
  journalEvents,
  moveStagePatch,
  nextLeadId,
  nextSort,
  sortTableLeads
} from "@/lib/selectors/crm";

describe("селекторы «CRM»: журнал смены", () => {
  const leads = SEED_DATA.LEADS;
  it("journalEvents собирает события лида воронки с ссылкой на лид", () => {
    const rows = journalEvents(leads, "fn-sales");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.leadId).toMatch(/^LD-/);
    expect(rows.every((r) => funnelLeads(leads, "fn-sales").some((l) => l.id === r.leadId))).toBe(true);
  });
  it("новые события (с ts) выше демо-событий; внутри группы — по времени по убыванию", () => {
    const demo = [
      { id: "LD-1", funnelId: "f", stageId: "new", events: [{ t: "10:00", actor: "ai", text: "демо утро" }, { t: "09:00", actor: "ai", text: "демо раньше" }] },
      { id: "LD-2", funnelId: "f", stageId: "new", events: [{ t: "12:00", ts: 1700000000000, actor: "human", text: "новое" }] }
    ] as unknown as Parameters<typeof journalEvents>[0];
    const rows = journalEvents(demo, "f");
    expect(rows.map((r) => r.text)).toEqual(["новое", "демо утро", "демо раньше"]);
  });
  it("авторы журнала: ИИ / Менеджер", () => {
    expect(ACTOR_META.ai).toBe("ИИ");
    expect(ACTOR_META.human).toBe("Менеджер");
  });
});

describe("канбан: стадии и критичность", () => {
  it("funnelStages отдаёт стадии воронки в порядке order", () => {
    const stages = funnelStages(FUNNELS[0], STAGES);
    expect(stages.map((s) => s.id)).toEqual(["new", "work", "qual", "deal"]);
    expect(stages.map((s) => s.order)).toEqual([...stages.map((s) => s.order)].sort((a, b) => a - b));
  });
  it("isCritical: заметка с «Эскалация» помечает карточку (демо-лид Е)", () => {
    expect(isCritical("Эскалация")).toBe(true);
    expect(isCritical("Вопрос по возврату")).toBe(false);
    expect(isCritical(null)).toBe(false);
    const escalated = SEED_DATA.LEADS.find((l) => isCritical(l.note));
    expect(escalated?.id).toBe("LD-1035");
  });
});

describe("таблица: фильтр и сортировки", () => {
  const fLeads = funnelLeads(SEED_DATA.LEADS, "fn-sales");
  it("filterByStage: «all» и по стадии", () => {
    expect(filterByStage(fLeads, "all").length).toBe(fLeads.length);
    expect(filterByStage(fLeads, "new").every((l) => l.stageId === "new")).toBe(true);
  });
  it("сортировка ID — числовой порядок (LD-1037 перед LD-1042)", () => {
    const ids = sortTableLeads(fLeads, "id").map((l) => l.id);
    expect(ids.indexOf("LD-1037")).toBeLessThan(ids.indexOf("LD-1042"));
  });
  it("сортировка Имя — по ru-локали, Активность — по убыванию", () => {
    expect(sortTableLeads(fLeads, "name").map((l) => l.name)).toEqual([...fLeads.map((l) => l.name)].sort((a, b) => a.localeCompare(b, "ru")));
    const act = sortTableLeads(fLeads, "activity").map((l) => l.lastActivity ?? "");
    expect(act).toEqual([...act].sort((a, b) => b.localeCompare(a, "ru")));
  });
  it("вход сортировки не мутируется; цикл кнопки: ID → Имя → Активность → ID", () => {
    const before = [...fLeads];
    sortTableLeads(fLeads, "name");
    expect(fLeads).toEqual(before);
    expect(nextSort("id")).toBe("name");
    expect(nextSort("name")).toBe("activity");
    expect(nextSort("activity")).toBe("id");
    expect(CRM_SORTS.map((s) => s.label)).toEqual(["ID", "Имя", "Активность"]);
  });
});

describe("создание лида (buildLead)", () => {
  it("следующий id — max номера + 1 с ведущими нулями (сид: LD-1043)", () => {
    expect(nextLeadId(SEED_DATA.LEADS)).toBe("LD-1043");
    expect(nextLeadId([{ id: "LD-0007" } as never])).toBe("LD-0008");
  });
  it("лид создаётся в стадии «new» с событием «Лид создан вручную», пустое имя → «Новый лид»", () => {
    const lead = buildLead({ name: "  ", channel: "site", funnelId: "fn-sales", agentId: "ag-sales", note: " " }, SEED_DATA.LEADS, "14:05");
    expect(lead.id).toBe("LD-1043");
    expect(lead.name).toBe("Новый лид");
    expect(lead.stageId).toBe("new");
    expect(lead.lastActivity).toBe("14:05");
    expect(lead.note).toBe("");
    expect(lead.events).toEqual([{ t: "14:05", ts: expect.any(Number), actor: "human", text: "Лид создан вручную" }]);
  });
  it("createdLeadEvent — UTC ЧЧ:ММ и actor human", () => {
    const e = createdLeadEvent("09:30");
    expect(e.t).toBe("09:30");
    expect(e.actor).toBe("human");
  });
});

describe("перемещение лида (moveStagePatch)", () => {
  const lead = SEED_DATA.LEADS[0];
  it("меняет стадию, добавляет событие и обновляет активность", () => {
    const patch = moveStagePatch(lead, "work", STAGES, "15:10");
    expect(patch?.stageId).toBe("work");
    expect(patch?.lastActivity).toBe("15:10");
    expect(patch?.events?.at(-1)?.text).toBe("Перемещён в стадию «В работе»");
    expect(patch?.events?.at(-1)?.t).toBe("15:10");
    expect(patch?.events?.length).toBe(lead.events.length + 1);
  });
  it("та же стадия — изменения нет (null), вход не мутируется", () => {
    expect(moveStagePatch(lead, lead.stageId, STAGES)).toBeNull();
    expect(lead.events.length).toBe(SEED_DATA.LEADS[0].events.length);
  });
});

describe("связи с диалогами и демо-данные", () => {
  it("диалог лида ищется по имени контакта (как в прототипе)", () => {
    const lead = SEED_DATA.LEADS[0];
    const conv = conversationForLead(lead, SEED_DATA.CONVERSATIONS);
    expect(conv?.id).toBe(SEED_DATA.CONVERSATIONS.find((c) => c.contactName === lead.name)?.id);
  });
  it("лиды есть в fn-sales и fn-support, стадии всех воронок существуют в справочнике", () => {
    expect(funnelLeads(SEED_DATA.LEADS, "fn-sales").length).toBeGreaterThan(0);
    expect(funnelLeads(SEED_DATA.LEADS, "fn-support").length).toBeGreaterThan(0);
    for (const f of FUNNELS) {
      for (const s of f.stages) expect(STAGES.some((st) => st.id === s), `${f.id}:${s}`).toBe(true);
    }
  });
});

describe("синхронизация с внешними CRM (этап 6)", () => {
  const ref = [
    { id: "int-amocrm", name: "amoCRM", connected: true },
    { id: "int-bitrix", name: "Bitrix24", connected: true }
  ];
  it("crmSyncRows: внешние CRM из справочника в его порядке, остальное не попадает", () => {
    expect(crmSyncRows([...ref, { id: "int-tg", name: "Telegram", connected: true }])).toEqual([
      { id: "int-amocrm", name: "amoCRM", connected: true },
      { id: "int-bitrix", name: "Bitrix24", connected: true }
    ]);
    expect(crmSyncRows([{ id: "int-tg", name: "Telegram", connected: true }])).toEqual([]);
    expect(crmSyncRows([])).toEqual([]);
  });
  it("crmSyncLabel: подключённые — «ОК», неподключённые — «нет связи», без CRM — «нет подключения»", () => {
    expect(crmSyncLabel(crmSyncRows(ref))).toBe("Синхр. amoCRM: ОК · Bitrix24: ОК");
    expect(crmSyncLabel(crmSyncRows([{ id: "int-amocrm", name: "amoCRM", connected: false }, ref[1]]))).toBe("Синхр. amoCRM: нет связи · Bitrix24: ОК");
    expect(crmSyncLabel(crmSyncRows([]))).toBe("Синхр. с CRM: нет подключения");
  });
  it("crmSyncOk: есть подключённая CRM — true; все отключены — false", () => {
    expect(crmSyncOk(crmSyncRows(ref))).toBe(true);
    expect(crmSyncOk(crmSyncRows([{ id: "int-amocrm", name: "amoCRM", connected: false }]))).toBe(false);
    expect(crmSyncOk([])).toBe(false);
  });
  it("демо-сид: обе внешние CRM подключены (бейдж шапки честно отражает справочник)", () => {
    const rows = crmSyncRows(INTEGRATIONS);
    expect(rows.length).toBe(2);
    expect(crmSyncLabel(rows)).toBe("Синхр. amoCRM: ОК · Bitrix24: ОК");
  });
});
