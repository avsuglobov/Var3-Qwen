import { describe, expect, it } from "vitest";
import { CHANNELS } from "@/lib/mock-data/reference";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { buildAgentFromWizard, funnelColumns, monogramFromName, nextAgentId, ROLE_LABELS, STATUS_META } from "@/lib/selectors/agents";
import { scriptedReply } from "@/lib/scripted-reply";
import { agentSchema, CHANNEL_IDS } from "@/lib/schemas";

const parses = (agent: unknown): boolean => agentSchema.safeParse(agent).success;

describe("селекторы «AI-сотрудников»: монограмма и id", () => {
  it("монограмма: первые буквы до двух слов, пунктуация отбрасывается, верхний регистр", () => {
    expect(monogramFromName("Тест Продажи")).toBe("ТП");
    expect(monogramFromName("Продажи — входящие")).toBe("ПВ");
    expect(monogramFromName("поддержка")).toBe("П");
    expect(monogramFromName("abc def")).toBe("AD");
  });
  it("монограмма: без букв и цифр — «AI» (правило этапа 3 вместо «ИИ»)", () => {
    expect(monogramFromName("«»")).toBe("AI");
    expect(monogramFromName("")).toBe("AI");
    // цифры допустимы (как в прототипе): остаются в монограмме
    expect(monogramFromName("«» 123")).toBe("1");
  });
  it("id: длина списка + 1, конфликты пропускаются", () => {
    expect(nextAgentId([])).toBe("ag-new-1");
    expect(nextAgentId([{ id: "ag-sales" }, { id: "ag-hr" }])).toBe("ag-new-3");
    expect(nextAgentId([{ id: "ag-sales" }, { id: "ag-new-3" }, { id: "ag-new-1" }])).toBe("ag-new-4");
  });
  it("сотрудник из мастера: демо-значения как в прототипе (idle, без воронки и правил)", () => {
    const made = buildAgentFromWizard({ name: "Тест Продажи", role: "support", instruction: "  Отвечать вежливо  ", knowledge: ["Демо-описание продукта.pdf"], channels: ["email"] }, SEED_DATA.AGENTS);
    expect(made).toMatchObject({
      id: `ag-new-${SEED_DATA.AGENTS.length + 1}`,
      name: "Тест Продажи",
      role: "support",
      status: "idle",
      monogram: "ТП",
      summary: "Создан в мастере.",
      instruction: "Отвечать вежливо",
      knowledge: ["Демо-описание продукта.pdf"],
      channels: ["email"],
      funnelId: null,
      funnel: [],
      approvals: []
    });
  });
  it("сотрудник из мастера: пустая инструкция → «Инструкция не задана.»", () => {
    const made = buildAgentFromWizard({ name: "X", role: "sales", instruction: "   ", knowledge: [], channels: [] }, SEED_DATA.AGENTS);
    expect(made.instruction).toBe("Инструкция не задана.");
    expect(parses(made)).toBe(true);
  });
  it("сотрудник из мастера проходит Zod-схему целиком (в т.ч. валидные каналы)", () => {
    const made = buildAgentFromWizard({ name: "Ещё один", role: "rop", instruction: "Анализ", knowledge: ["Демо-сценарии продаж.docx"], channels: [...CHANNEL_IDS] }, SEED_DATA.AGENTS);
    expect(parses(made)).toBe(true);
  });
});

describe("селекторы: статусы и роли", () => {
  it("у всех статусов есть подпись и точка (статус не только цветом)", () => {
    for (const s of ["online", "idle", "offline", "error"] as const) {
      expect(STATUS_META[s].label.length).toBeGreaterThan(0);
      expect(STATUS_META[s].dotClass).toMatch(/^bg-/);
    }
  });
  it("подписи статусов как в прототипе", () => {
    expect(STATUS_META.online.label).toBe("В сети");
    expect(STATUS_META.idle.label).toBe("Ожидание");
    expect(STATUS_META.offline.label).toBe("Не в сети");
    expect(STATUS_META.error.label).toBe("Критично");
  });
  it("роли подписываются по словарю прототипа", () => {
    expect(ROLE_LABELS).toEqual({ sales: "Продажи", support: "Поддержка", supply: "Снабжение", hr: "HR", rop: "РОП" });
  });
});

describe("селекторы: воронка сотрудника", () => {
  const stages = [
    { id: "new", name: "Новые", order: 0 },
    { id: "work", name: "В работе", order: 1 },
    { id: "qual", name: "Квалификация", order: 2 },
    { id: "deal", name: "Сделка", order: 3 }
  ];
  it("счёт по стадиям только для воронки сотрудника", () => {
    const cols = funnelColumns("fn-sales", stages, SEED_DATA.LEADS);
    expect(cols.map((c) => c.count)).toEqual([1, 1, 1, 1]);
    expect(cols.map((c) => c.stage.name)).toEqual(["Новые", "В работе", "Квалификация", "Сделка"]);
    const support = funnelColumns("fn-support", stages, SEED_DATA.LEADS);
    expect(support.map((c) => c.count)).toEqual([1, 1, 0, 0]);
  });
  it("нет лидов — нули", () => {
    expect(funnelColumns("fn-sales", stages, []).map((c) => c.count)).toEqual([0, 0, 0, 0]);
  });
});

describe("скриптованный ответ тест-чата (демо, не LLM)", () => {
  it("ветки по ключевым словам из прототипа", () => {
    expect(scriptedReply("Сколько стоит тариф?")).toContain("каталог тарифов");
    expect(scriptedReply("Хочу вернуть деньги")).toContain("возврата");
    expect(scriptedReply("Соберите поставщиков комплектующих")).toContain("запрос поставщикам");
    expect(scriptedReply("Здравствуйте!")).toContain("Здравствуйте");
    expect(scriptedReply("Спасибо большое")).toContain("благодарю");
    expect(scriptedReply("Кнопка не работает — ошибка")).toContain("SLA");
  });
  it("без совпадений — повтор вопроса и честная пометка «не LLM»", () => {
    const reply = scriptedReply("бла-бла");
    expect(reply).toContain("«бла-бла»");
    expect(reply).toContain("не LLM");
  });
  it("пустой ввод — нейтральный ответ без исключений", () => {
    expect(scriptedReply("")).toContain("не LLM");
  });
});

describe("справочник каналов для раздела", () => {
  it("каждый канал имеет иконку с известным именем (чип не останется без подписи)", () => {
    for (const c of Object.values(CHANNELS)) {
      expect(c.icon.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(0);
    }
    // имена иконок, используемые в CHANNEL_ICONS (components/agents/channel-icon.tsx)
    expect(new Set(Object.values(CHANNELS).map((c) => c.icon))).toEqual(new Set(["send-paper-plane", "message-circle", "globe", "mail", "phone"]));
  });
});
