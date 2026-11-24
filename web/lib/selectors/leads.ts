import type { Channel, Lead, LeadEvent } from "@/lib/schemas";
import { nextLeadId, nowHM } from "@/lib/selectors/crm";
import type { MappingColumn } from "@/lib/importer";

/**
 * Чистые функции раздела «Лиды и автокасания» (этап 3, группа 4). Поведение перенесено
 * из прототипа (`../download/sections2.js` leads()/doImport(), `db.js` createLeads):
 * сбор строк из файла по сопоставлению колонок, дедупликация, пакетное создание лидов,
 * счётчик импортированных контактов для сценария реактивации.
 */

/** Строка файла после сопоставления колонок: имя и собранная заметка. */
export interface ImportRow {
  name: string;
  note: string;
}

export interface CollectResult {
  list: ImportRow[];
  /** Строк без имени клиента — пропущены. */
  noName: number;
  /** Повторов (та же пара имя|телефон|email без учёта регистра) — пропущены. */
  dup: number;
}

/** Поле импорта по колонке; "" — колонка не сопоставлена («не использовать»). */
function mappedCell(row: readonly string[], mapping: readonly MappingColumn[], id: MappingColumn): string {
  const i = mapping.indexOf(id);
  return i < 0 ? "" : String(row[i] ?? "").trim();
}

/**
 * Сбор лидов из строк файла (поведение doImport прототипа): без имени — пропуск;
 * заметка — «Телефон: …», «Email: …», «Последний контакт: …», комментарий через « · »;
 * повторы по ключу «имя|телефон|email» в нижнем регистре. Вход не мутируется.
 */
export function collectRows(rows: readonly (readonly string[])[], mapping: readonly MappingColumn[]): CollectResult {
  const list: ImportRow[] = [];
  const seen = new Set<string>();
  let noName = 0;
  let dup = 0;
  for (const row of rows) {
    const name = mappedCell(row, mapping, "name");
    if (!name) {
      noName++;
      continue;
    }
    const phone = mappedCell(row, mapping, "phone");
    const email = mappedCell(row, mapping, "email");
    const last = mappedCell(row, mapping, "lastContact");
    const noteRaw = mappedCell(row, mapping, "note");
    const parts: string[] = [];
    if (phone) parts.push(`Телефон: ${phone}`);
    if (email) parts.push(`Email: ${email}`);
    if (last) parts.push(`Последний контакт: ${last}`);
    if (noteRaw) parts.push(noteRaw);
    const key = `${name}|${phone}|${email}`.toLowerCase();
    if (seen.has(key)) {
      dup++;
      continue;
    }
    seen.add(key);
    list.push({ name, note: parts.join(" · ") });
  }
  return { list, noName, dup };
}

/** Лиды, попавшие в базу импортом (как счётчик «Импортировано контактов» прототипа). */
export function importedLeads(leads: readonly Lead[]): Lead[] {
  return leads.filter((l) => l.events.some((e) => e.text.includes("Импортирован")));
}

/** Событие импортированного лида (как db.createLeads прототипа): актор — человек, UTC-время. */
export function importedLeadEvent(time: string = nowHM()): LeadEvent {
  return { t: time, ts: Date.now(), actor: "human", text: "Импортирован из файла" };
}

export interface ImportLeadsInput {
  rows: readonly ImportRow[];
  /** Все лиды хранилища — для сквозной нумерации LD-NNNN. */
  leads: readonly Lead[];
  funnelId: string;
  agentId: string;
  channel: Lead["channel"];
  time?: string;
}

/**
 * Пакет лидов из файла (поведение db.createLeads прототипа): сквозные id, имя до 300 символов,
 * заметка до 1900, стадия «new», канал по умолчанию; события «Импортирован из файла».
 */
export function buildImportedLeads(input: ImportLeadsInput): Lead[] {
  const time = input.time ?? nowHM();
  const out: Lead[] = [];
  let nextNum = Number(nextLeadId(input.leads).slice(3));
  for (const row of input.rows) {
    out.push({
      id: `LD-${String(nextNum).padStart(4, "0")}`,
      name: row.name.slice(0, 300),
      channel: input.channel,
      stageId: "new",
      funnelId: input.funnelId,
      agentId: input.agentId,
      value: null,
      lastActivity: time,
      note: row.note.slice(0, 1900),
      events: [importedLeadEvent(time)]
    });
    nextNum++;
  }
  return out;
}

/** CSV-шаблон импорта: BOM и «;» — корректно открывается в русскоязычном Excel (как в прототипе). */
export const IMPORT_TEMPLATE_CSV = "\uFEFFИмя;Телефон;Email;Последний контакт\r\n";
export const IMPORT_TEMPLATE_NAME = "шаблон-импорта-лидов.csv";

/** Скачивание шаблона через Blob + <a download> (работает в браузере; в тестах проверяется тост). */
export function downloadImportTemplate(): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([IMPORT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = IMPORT_TEMPLATE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/** Подпись канала по умолчанию в селекте импорта (справочник каналов прототипа). */
export function channelName(channels: readonly Channel[], id: string): string {
  return channels.find((c) => c.id === id)?.name ?? id;
}
