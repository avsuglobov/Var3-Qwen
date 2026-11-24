/**
 * Чистые функции раздела «Хранилище и база знаний» (этап 3, группа 7) — поведение
 * storage() прототипа: иконка источника по типу, бейдж статуса (dot у «Индексировано»).
 */

/** Тип источника → подпись для aria/цвета (srcIcon прототипа: pdf/docx → file-text, xlsx → bar-chart, web → globe, api → code). */
export type SourceType = "pdf" | "docx" | "xlsx" | "web" | "api";
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  web: "Сайт",
  api: "API"
};

/** Тон бейджа статуса: dot-status только у «Индексировано», остальные — нейтральные (как в прототипе). */
export function sourceStatusTone(status: string | null | undefined): "status" | "muted" {
  return status === "Индексировано" ? "status" : "muted";
}

export function sourceTypeOf(type: string | null | undefined): SourceType {
  return type === "pdf" || type === "docx" || type === "xlsx" || type === "web" || type === "api" ? type : "pdf";
}
