import type { Lead } from "@/lib/schemas";
import { externalLeadSchema, type ExternalLead } from "./types";

/**
 * Маппинг сущностей внешних сервисов в формат приложения и импорт лидов в снимок (этап 9).
 * Идентификатор лида снимка детерминирован по внешнему id (ext-amo-123): повторная
 * синхронизация обновляет записи, а не создаёт дубликаты. Стадию/канал/агента у уже
 * существующего лида импорт не трогает — пользователь мог перенести его по канбану руками.
 */

/** Лид amoCRM (API v4 /api/v4/leads: { id, name, price, … }); битые записи отбрасываются. */
export function amocrmLead(raw: unknown): ExternalLead | null {
  const lead = (raw ?? {}) as { id?: unknown; name?: unknown; price?: unknown };
  const externalId = typeof lead.id === "number" || typeof lead.id === "string" ? String(lead.id).trim() : "";
  const name = typeof lead.name === "string" ? lead.name.trim() : "";
  if (!externalId || !name) return null;
  const value = typeof lead.price === "number" && Number.isFinite(lead.price) && lead.price >= 0 ? lead.price : null;
  return externalLeadSchema.safeParse({ externalId: externalId.slice(0, 100), name: name.slice(0, 300), value }).data ?? null;
}

/** Лид Bitrix24 (crm.lead.list: { ID, TITLE, OPPORTUNITY }); битые записи отбрасываются. */
export function bitrixLead(raw: unknown): ExternalLead | null {
  const lead = (raw ?? {}) as { ID?: unknown; TITLE?: unknown; OPPORTUNITY?: unknown };
  const externalId = typeof lead.ID === "number" || typeof lead.ID === "string" ? String(lead.ID).trim() : "";
  const name = typeof lead.TITLE === "string" ? lead.TITLE.trim() : "";
  if (!externalId || !name) return null;
  const rawValue = typeof lead.OPPORTUNITY === "string" ? Number(lead.OPPORTUNITY.replace(",", ".")) : lead.OPPORTUNITY;
  const value = typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : null;
  return externalLeadSchema.safeParse({ externalId: externalId.slice(0, 100), name: name.slice(0, 300), value }).data ?? null;
}

/**
 * Детерминированный id лида снимка. Символы вне формата id (ID_RE) вырезаются —
 * внешние сервисы с неалфавитными идентификаторами не должны ломать снимок.
 */
export function externalLeadId(sourceSlug: string, externalId: string): string {
  return `ext-${sourceSlug}-${externalId}`.slice(0, 40).replace(/[^A-Za-z0-9_-]/g, "");
}

/** Время «ЧЧ:ММ» — формат lastActivity и событий демо-сида. */
function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Минимальный интерфейс репозитория лидов, которого хватает импорту (совпадает с Repository<"LEADS">). */
export interface LeadsRepoLike {
  get(id: string): Promise<Lead | undefined>;
  create(item: Lead): Promise<Lead>;
  update(id: string, patch: Partial<Lead>): Promise<Lead>;
}

export interface ImportConfig {
  funnelId: string;
  stageId: string;
  agentId: string;
  /** Подпись источника для note и событий, например «amoCRM». */
  sourceLabel: string;
  now: number;
}

/** Импорт выборки внешних лидов в снимок: возвращает число созданных и обновлённых записей. */
export async function importExternalLeads(
  repo: LeadsRepoLike,
  sourceSlug: string,
  leads: readonly ExternalLead[],
  config: ImportConfig
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const ext of leads) {
    const id = externalLeadId(sourceSlug, ext.externalId);
    const stamp = hhmm(config.now);
    const note = `${config.sourceLabel} · запись ${ext.externalId} · импорт ${stamp}`;
    const existing = await repo.get(id);
    if (!existing) {
      await repo.create({
        id,
        name: ext.name,
        channel: "site",
        stageId: config.stageId,
        funnelId: config.funnelId,
        agentId: config.agentId,
        value: ext.value,
        lastActivity: stamp,
        note,
        events: [{ t: stamp, actor: "ai", text: `Лид импортирован (${config.sourceLabel})` }]
      });
      created += 1;
    } else {
      await repo.update(id, { name: ext.name, value: ext.value, lastActivity: stamp, note });
      updated += 1;
    }
  }
  return { created, updated };
}
