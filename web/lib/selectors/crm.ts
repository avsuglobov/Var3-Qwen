import type { Funnel, Lead, LeadEvent, Stage } from "@/lib/schemas";
import type { Actor } from "@/lib/types";

/**
 * Чистые функции раздела «CRM» (этап 3, группа 3). Поведение перенесено из прототипа
 * (`../download/sections.js` crm()/crmJournal()/crmKanban()/crmTable(), `db.js` LEADS):
 * журнал смены по воронке, канбан стадий, таблица с фильтром и сортировкой,
 * правила создания/перемещения/удаления лида.
 */

/** Виды раздела: переключатель в шапке (как segmented в прототипе). */
export type CrmView = "journal" | "kanban" | "table";

export const VIEW_META: Record<CrmView, { label: string }> = {
  journal: { label: "Журнал" },
  kanban: { label: "Канбан" },
  table: { label: "Таблица" }
};

/** Сортировки таблицы и цикл кнопки «Сортировка»: ID → Имя → Активность (как CRM_SORTS прототипа). */
export type TableSort = "id" | "name" | "activity";

export const CRM_SORTS: readonly { id: TableSort; label: string }[] = [
  { id: "id", label: "ID" },
  { id: "name", label: "Имя" },
  { id: "activity", label: "Активность" }
];

export function nextSort(current: TableSort): TableSort {
  const i = CRM_SORTS.findIndex((s) => s.id === current);
  return CRM_SORTS[(i + 1) % CRM_SORTS.length].id;
}

/** Подпись автора события журнала (как actor-ai/actor-human прототипа): ИИ / Менеджер. */
export const ACTOR_META: Record<Actor, string> = { ai: "ИИ", human: "Менеджер" };

/** Строка «Журнала смены»: событие любого лида воронки. */
export interface JournalRow {
  t: string;
  /** Метка времени (мс); у демо-событий нет — новые события всегда выше демо-событий. */
  ts?: number;
  actor: Actor;
  text: string;
  leadId: string;
}

/**
 * Новые события выше демо-событий; внутри группы — по времени ЧЧ:ММ по убыванию,
 * равные не меняют порядок (как evNewestFirst прототипа). Вход не мутируется.
 */
function evNewestFirst(a: JournalRow, b: JournalRow): number {
  const x = a.ts ?? 0;
  const y = b.ts ?? 0;
  if (x !== y) return y - x;
  return a.t < b.t ? 1 : a.t > b.t ? -1 : 0;
}

/** Лиды воронки в порядке хранилища. */
export function funnelLeads(leads: readonly Lead[], funnelId: string): Lead[] {
  return leads.filter((l) => l.funnelId === funnelId);
}

/** Все события лидов воронки, новейшие сверху (как crmJournal прототипа). */
export function journalEvents(leads: readonly Lead[], funnelId: string): JournalRow[] {
  const rows: JournalRow[] = [];
  for (const lead of funnelLeads(leads, funnelId)) {
    for (const e of lead.events) rows.push({ t: e.t, ts: e.ts, actor: e.actor, text: e.text, leadId: lead.id });
  }
  return rows.sort(evNewestFirst);
}

/** Карточка «КРИТИЧНО» на канбане: заметка содержит «Эскалация» (как в прототипе). */
export function isCritical(note: string | null | undefined): boolean {
  return !!note && note.includes("Эскалация");
}

/** Фильтр таблицы: «all» или стадия (как chip-фильтр crmTable). */
export function filterByStage(leads: readonly Lead[], stageId: string): Lead[] {
  return leads.filter((l) => stageId === "all" || l.stageId === stageId);
}

/**
 * Сортировка таблицы: ID — числовой порядок; Имя — ru-локаль; Активность — по убыванию
 * времени (как в прототипе). Вход не мутируется.
 */
export function sortTableLeads(leads: readonly Lead[], sort: TableSort): Lead[] {
  const copy = [...leads];
  if (sort === "name") copy.sort((x, y) => x.name.localeCompare(y.name, "ru"));
  else if (sort === "activity") copy.sort((x, y) => String(y.lastActivity ?? "").localeCompare(String(x.lastActivity ?? ""), "ru"));
  else copy.sort((x, y) => x.id.localeCompare(y.id, "ru", { numeric: true }));
  return copy;
}

/** Время событий — UTC ЧЧ:ММ (как db.nowHM прототипа и часы в шапке). */
export function nowHM(): string {
  const d = new Date();
  const pad = (x: number): string => String(x).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Следующий номер лида: max числовой части «LD-NNNN» + 1, ведущие нули до 4 знаков
 * (как nextNum("LD-") прототипа; у сида максимум LD-1042 → новый LD-1043).
 */
export function nextLeadId(leads: readonly Lead[]): string {
  let max = 0;
  for (const lead of leads) {
    const m = /^LD-(\d+)$/.exec(lead.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `LD-${String(max + 1).padStart(4, "0")}`;
}

/** Первое событие созданного вручную лида (как db.createLead прототипа). */
export function createdLeadEvent(time: string = nowHM()): LeadEvent {
  return { t: time, ts: Date.now(), actor: "human", text: "Лид создан вручную" };
}

export interface NewLeadInput {
  name: string;
  channel: Lead["channel"];
  funnelId: string;
  agentId: string;
  note?: string;
}

/**
 * Новый лид из модалки создания: стадия «new», пустая заметка → пусто, пустое имя →
 * «Новый лид» (как в прототипе); событие «Лид создан вручную» и время UTC.
 */
export function buildLead(input: NewLeadInput, leads: readonly Lead[], time: string = nowHM()): Lead {
  return {
    id: nextLeadId(leads),
    name: input.name.trim() || "Новый лид",
    channel: input.channel,
    stageId: "new",
    funnelId: input.funnelId,
    agentId: input.agentId,
    value: null,
    lastActivity: time,
    note: input.note?.trim() ?? "",
    events: [createdLeadEvent(time)]
  };
}

/**
 * Патч перемещения лида на стадию (поведение db.moveLeadStage прототипа): стадия меняется,
 * добавляется событие «Перемещён в стадию „…"», обновляется активность. Тот же стадия —
 * изменения нет (null), как и в прототипе.
 */
export function moveStagePatch(lead: Lead, stageId: string, stages: readonly Stage[], time: string = nowHM()): Partial<Lead> | null {
  if (lead.stageId === stageId) return null;
  const stageName = stages.find((s) => s.id === stageId)?.name ?? stageId;
  return {
    stageId,
    lastActivity: time,
    events: [...lead.events, { t: time, ts: Date.now(), actor: "human", text: `Перемещён в стадию «${stageName}»` }]
  };
}

/** Диалог лида: контакт диалога совпадает с именем лида (как в прототипе). */
export function conversationForLead(lead: Lead, conversations: readonly { id: string; contactName: string }[]): { id: string } | undefined {
  return conversations.find((c) => c.contactName === lead.name);
}

/** Стадии воронки по справочнику стадий в порядке order (колонки канбана). */
export function funnelStages(funnel: Funnel, stages: readonly Stage[]): Stage[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  return funnel.stages.map((id) => byId.get(id)).filter((s): s is Stage => !!s).sort((a, b) => a.order - b.order);
}

/* ---------------------------------------------------------------- синхронизация с внешними CRM (этап 6) */

/** Внешние CRM из справочника интеграций (id записей INTEGRATIONS, генерируются gen:seed). */
export const CRM_SYNC_IDS = ["int-amocrm", "int-bitrix"] as const;

export interface CrmSyncRow {
  id: string;
  name: string;
  connected: boolean;
}

/** Строки статуса синхронизации: внешние CRM из справочника интеграций в его порядке. Вход не мутируется. */
export function crmSyncRows(integrations: readonly { id: string; name: string; connected: boolean }[]): CrmSyncRow[] {
  return CRM_SYNC_IDS.map((id) => integrations.find((i) => i.id === id))
    .filter((i): i is { id: string; name: string; connected: boolean } => !!i)
    .map((i) => ({ id: i.id, name: i.name, connected: i.connected }));
}

/**
 * Текст бейджа синхронизации в шапке CRM: «Синхр. amoCRM: ОК · Bitrix24: ОК»;
 * у неподключённой — «нет связи»; без внешних CRM в справочнике — «нет подключения».
 * Статусы берутся из справочника интеграций (демо-данные), время синхронизации не выдумывается.
 */
export function crmSyncLabel(rows: readonly CrmSyncRow[]): string {
  if (rows.length === 0) return "Синхр. с CRM: нет подключения";
  return "Синхр. " + rows.map((r) => `${r.name}: ${r.connected ? "ОК" : "нет связи"}`).join(" · ");
}

/** Есть ли хотя бы одна подключённая внешняя CRM (точка бейджа не только цветом — текст рядом). */
export function crmSyncOk(rows: readonly CrmSyncRow[]): boolean {
  return rows.some((r) => r.connected);
}
