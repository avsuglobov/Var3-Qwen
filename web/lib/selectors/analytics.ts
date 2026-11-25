import { isCritical } from "@/lib/selectors/crm";
import type { Lead } from "@/lib/schemas";

/**
 * Чистые функции раздела «Аналитика» (этап 3, группа 7) — поведение analytics() прототипа:
 * разбор диалогов менеджеров (демо-фикстуры раздела), бейдж «ОК»/«Нарушение».
 * Этап 7 добавил пересчёт KPI из данных приложения.
 */

export interface DialogReviewRow {
  id: string;
  manager: string;
  violation: string;
}

/** Разбор диалогов: данные захардкожены в разделе прототипа (не в сиде data.js) — портируем как есть. */
export const DIALOG_REVIEW: readonly DialogReviewRow[] = [
  { id: "cv-1", manager: "Демо-менеджер 1", violation: "Пропущен уточняющий вопрос" },
  { id: "cv-2", manager: "Демо-менеджер 2", violation: "Нет (в рамках скрипта)" },
  { id: "cv-3", manager: "Демо-менеджер 1", violation: "Не предложен доп. тариф" }
];

/** Строка в рамках скрипта (бейдж «ОК») или нарушение (бейдж + текст). */
export function reviewIsOk(row: DialogReviewRow): boolean {
  return row.violation.indexOf("Нет") === 0;
}

export interface AnalyticsKpis {
  /** Доля диалогов разбора без нарушений, % («33%»); без строк разбора — «—». */
  quality: string;
  /** Строки разбора с нарушением скрипта. */
  violations: number;
  /** Лиды с пометкой «Эскалация» в заметке. */
  escalations: number;
}

/**
 * Пересчёт KPI из данных приложения (этап 7). Правила согласования:
 * - «Качество цепочки» — доля строк разбора без нарушений (разбор — демо-выборка, помечен «Демо»);
 * - «Нарушений скрипта» — строки разбора с нарушением;
 * - «Эскалаций к человеку» — лиды с пометкой «Эскалация» в заметке: то же правило, что
 *   карточка «КРИТИЧНО» на канбане CRM (isCritical), единый источник правила.
 */
export function analyticsKpis(review: readonly DialogReviewRow[], leads: readonly Lead[]): AnalyticsKpis {
  const total = review.length;
  const violations = review.filter((r) => !reviewIsOk(r)).length;
  const ok = total - violations;
  return {
    quality: total === 0 ? "—" : `${Math.round((ok / total) * 100)}%`,
    violations,
    escalations: leads.filter((l) => isCritical(l.note)).length
  };
}
