import { describe, expect, it } from "vitest";
import { ApiError, createLocalApi, createMemoryStorage } from "@/lib/api";
import { INTEGRATIONS } from "@/lib/mock-data/reference";
import { SEED_DATA } from "@/lib/mock-data/seed";
import type { CompanyProfile } from "@/lib/schemas";
import {
  DEFAULT_SETTINGS_TAB,
  DEFAULT_TARIFF,
  HELP_INITIAL,
  HELP_WHO,
  NOTIFICATION_TOGGLES,
  ROLE_ACCESS,
  SETTINGS_DEFAULTS,
  SETTINGS_TABS,
  TARIFFS,
  applyConnectionStates,
  importFeedback,
  integrationStatusText
} from "@/lib/selectors/system";

/* Финальная группа этапа 3 — «Интеграции, Настройки, Помощь» (sections2.js прототипа):
   справочник интеграций, вкладки «Настроек», переключатели уведомлений, экспорт/импорт/сброс
   данных, тексты чата обучения. */

describe("api: reference.integrations — справочник карточек (read-only, как в прототипе)", () => {
  it("8 интеграций, порядок и статусы совпадают с data.js INTEGRATIONS", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const list = await api.reference.integrations();
    expect(list).toEqual(INTEGRATIONS);
    expect(list.map((i) => i.id)).toEqual(["int-amocrm", "int-bitrix", "int-tg", "int-wa", "int-cal", "int-api", "int-docs", "int-phone"]);
    expect(list.filter((i) => i.connected).map((i) => i.name)).toEqual(["amoCRM", "Bitrix24", "Telegram", "REST API"]);
    expect(list.filter((i) => !i.connected).map((i) => i.name)).toEqual(["WhatsApp", "Календари", "Документы", "Телефония"]);
  });
  it("бейдж статуса: «Подключено» / «Не подключено»", () => {
    expect(integrationStatusText(true)).toBe("Подключено");
    expect(integrationStatusText(false)).toBe("Не подключено");
  });
});

describe("селекторы «Настроек» — вкладки и фикстуры прототипа", () => {
  it("7 вкладок в порядке прототипа, по умолчанию «Профиль»", () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(["profile", "company", "roles", "channels", "notifications", "tariff", "data"]);
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual(["Профиль", "Компания", "Роли", "Каналы", "Уведомления", "Тариф", "Данные"]);
    expect(DEFAULT_SETTINGS_TAB).toBe("profile");
  });
  it("роли и доступ: Владелец/Менеджер/Бухгалтерия", () => {
    expect(ROLE_ACCESS).toEqual([
      { role: "Владелец", access: "Полный" },
      { role: "Менеджер", access: "Диалоги, CRM" },
      { role: "Бухгалтерия", access: "Документы" }
    ]);
  });
  it("переключатели уведомлений: три включены, «Ошибка агента (КРИТИЧНО)» выключен", () => {
    expect(NOTIFICATION_TOGGLES.map((t) => [t.key, t.def])).toEqual([
      ["Новый лид", true],
      ["Передача менеджеру", true],
      ["Согласование документа", true],
      ["Ошибка агента (КРИТИЧНО)", false]
    ]);
  });
  it("демо-значения полей профиля и компании — как fieldRow прототипа", () => {
    expect(SETTINGS_DEFAULTS).toMatchObject({
      profileName: "ВВ",
      profileEmail: "demo@ai-workspace",
      profileTz: "UTC+3 Москва",
      companyName: "Демо-компания",
      companySite: "demo.site",
      companyAbout: "Демо-описание."
    });
  });
});

describe("api: data — экспорт/импорт/сброс вкладки «Данные» (db.js прототипа)", () => {
  it("экспорт: version 1 + коллекции; повторный импорт того же файла идемпотентен (dropped = 0)", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const parsed = JSON.parse(await api.data.exportJSON()) as { version: number; LEADS: unknown[] };
    expect(parsed.version).toBe(1);
    expect(parsed.LEADS).toEqual(SEED_DATA.LEADS);
    const r = await api.data.importJSON(await api.data.exportJSON());
    expect(r.dropped).toBe(0);
    expect((await api.leads.list()).length).toBe(SEED_DATA.LEADS.length);
  });
  it("импорт файла с некорректным профилем: dropped = 1, демо-профиль остаётся", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const snapshot = JSON.parse(await api.data.exportJSON()) as Record<string, unknown>;
    const r = await api.data.importJSON(JSON.stringify({ ...snapshot, COMPANY_PROFILE: { name: "" } }));
    expect(r.dropped).toBe(1);
    expect((await api.companyProfile.get()).name).toBe("Демо-компания");
  });
  it("битый файл и файл не той версии → invalid_import с понятным текстом", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    await expect(api.data.importJSON("{ не json")).rejects.toSatisfy((e: ApiError) => e.code === "invalid_import");
    await expect(api.data.importJSON(JSON.stringify({ version: 99 }))).rejects.toSatisfy(
      (e: ApiError) => e.code === "invalid_import" && /формат/.test(e.message)
    );
  });
  it("сброс к демо: профиль и правки откатываются к сиду", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    await api.companyProfile.update({ name: "ООО «Импорт»" });
    await api.data.reset();
    expect(await api.companyProfile.get()).toMatchObject({ name: "Демо-компания", about: SEED_DATA.COMPANY_PROFILE.about });
    expect(await api.leads.list()).toEqual(SEED_DATA.LEADS);
  });
});

describe("сообщения вкладки «Данные» и чата обучения", () => {
  it("импорт без пропусков и с пропусками — тексты тоста importJSON прототипа", () => {
    expect(importFeedback(0)).toBe("Данные импортированы");
    expect(importFeedback(2)).toBe("Данные импортированы, пропущено некорректных записей: 2");
  });
  it("чат обучения: приветствие переименовано по правилу «AI-» (без «ИИ-»)", () => {
    expect(HELP_INITIAL).toContain("настроить AI-сотрудника");
    expect(HELP_INITIAL).not.toContain("ИИ-");
    expect(HELP_WHO).toBe("Помощь");
  });
});

describe("тариф (этап 7)", () => {
  it("доступные тарифы: три названия без цен, по умолчанию «Демо»", () => {
    expect(TARIFFS).toEqual(["Демо", "Базовый", "Профи"]);
    expect(DEFAULT_TARIFF).toBe("Демо");
  });
  it("профиль хранит выбранный тариф (PATCH company-profile сохраняет tariff)", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const saved = await api.companyProfile.update({ tariff: "Базовый" });
    expect(saved.tariff).toBe("Базовый");
    expect(await api.companyProfile.get()).toEqual({ ...saved, tariff: "Базовый" });
  });
  it("слишком длинное название тарифа отклоняется схемой профиля", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    await expect(api.companyProfile.update({ tariff: "x".repeat(2001) })).rejects.toMatchObject({ code: "validation" });
  });
});

describe("состояния подключений интеграций (этап 7)", () => {
  const reference = INTEGRATIONS;
  it("без сохранённых состояний — статусы справочника (вход не мутируется)", () => {
    const out = applyConnectionStates(reference, null);
    expect(out).toEqual(reference);
    expect(out).not.toBe(reference);
    expect(applyConnectionStates(reference, [])).toEqual(reference);
  });
  it("сохранённое состояние перекрывает справочник, неизвестные id игнорируются", () => {
    const out = applyConnectionStates(reference, [{ id: "int-amocrm", connected: false }, { id: "no-such", connected: true }]);
    const amocrm = out.find((i) => i.id === "int-amocrm");
    expect(amocrm?.connected).toBe(false);
    expect(reference.find((i) => i.id === "int-amocrm")?.connected).toBe(true);
    const rest = out.filter((i) => i.id !== "int-amocrm");
    expect(rest).toEqual(reference.filter((i) => i.id !== "int-amocrm"));
  });
  it("переключение туда-обратно возвращает исходный статус", () => {
    const off = applyConnectionStates(reference, [{ id: "int-wa", connected: true }]);
    expect(off.find((i) => i.id === "int-wa")?.connected).toBe(true);
    const back = applyConnectionStates(reference, [{ id: "int-wa", connected: false }]);
    expect(back.find((i) => i.id === "int-wa")?.connected).toBe(false);
  });
  it("профиль хранит connections и валидирует формат id", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const saved = await api.companyProfile.update({ connections: [{ id: "int-tg", connected: false }] });
    expect(saved.connections).toEqual([{ id: "int-tg", connected: false }]);
    await expect(api.companyProfile.update({ connections: [{ id: "плохой id!", connected: true }] })).rejects.toMatchObject({ code: "validation" });
    await expect(api.companyProfile.update({ connections: [{ id: "int-tg", connected: "да" }] as unknown as CompanyProfile["connections"] })).rejects.toMatchObject({ code: "validation" });
  });
});
