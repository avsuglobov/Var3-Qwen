/**
 * Чистые функции раздела «Аналитика» (этап 3, группа 7) — поведение analytics() прототипа:
 * разбор диалогов менеджеров (демо-фикстуры раздела), бейдж «ОК»/«Нарушение».
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
