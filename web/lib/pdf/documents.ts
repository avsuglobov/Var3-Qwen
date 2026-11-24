import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { STATUS_PRINT, docNum, itemsFor, money, totalOf } from "@/lib/selectors/documents";
import type { Document } from "@/lib/schemas";

/**
 * Генерация PDF документа (счёт/КП/акт) — порт `../download/pdf.js` generateNow().
 * Кириллица: встроен шрифт Liberation Sans (`lib/pdf/pdf-font.ts`, base64 из прототипа) —
 * стандартные шрифты jsPDF кириллицу не содержат. jsPDF и шрифт импортируются динамически
 * (по первому запросу PDF), поэтому старт раздела остаётся быстрым.
 * Палитра печатных форм: документы печатаются на белой бумаге независимо от темы интерфейса,
 * значения фиксированы здесь (как PAL pdf.js), а не разбросаны по коду.
 */
import type { jsPDF } from "jspdf";

export const PAL = {
  accent: [184, 67, 26],
  ink: [20, 20, 20],
  ink2: [30, 30, 30],
  ink3: [60, 60, 60],
  mute: [110, 110, 110],
  faint: [150, 150, 150],
  rule: [200, 200, 200],
  hair: [225, 225, 225],
  head: [244, 244, 244],
  zebra: [249, 249, 249]
} as const;

/** Заголовок типа документа на печатной форме (TYPE_LABEL pdf.js). */
export const TYPE_LABEL: Record<Document["type"], string> = {
  invoice: "СЧЁТ",
  offer: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ",
  act: "АКТ"
};

/** Имя файла: «счёт-DOC-205.pdf» (как fname pdf.js). */
export function pdfFilename(doc: Document): string {
  return (TYPE_LABEL[doc.type] || "Документ").toLowerCase().replace(/\s+/g, "-") + "-" + doc.id + ".pdf";
}

/** Подключение шрифта с кириллицей к документу (как в pdf.js generateNow). */
function applyLiberationSans(pdf: jsPDF, F: { regular?: string; bold?: string }): boolean {
  if (!F.regular) return false;
  pdf.addFileToVFS("LSans-Regular.ttf", F.regular);
  pdf.addFont("LSans-Regular.ttf", "LSans", "normal");
  if (F.bold) {
    pdf.addFileToVFS("LSans-Bold.ttf", F.bold);
    pdf.addFont("LSans-Bold.ttf", "LSans", "bold");
  }
  pdf.setFont("LSans", "normal");
  return true;
}

/** Генерация и сохранение PDF. Возвращает имя файла (для строки role="status"). */
export async function generateDocPdf(doc: Document): Promise<string> {
  const [{ jsPDF: JsPDF }, { AIWS_PDF_FONTS }] = await Promise.all([import("jspdf"), import("@/lib/pdf/pdf-font")]);
  const pdf = new JsPDF({ unit: "mm", format: "a4" });
  if (!applyLiberationSans(pdf, AIWS_PDF_FONTS)) throw new Error("Не удалось загрузить шрифт PDF");

  const PW = 210, M = 18, CW = PW - 2 * M; // контент = 174мм
  let y = 20;

  // Шапка
  pdf.setFont("LSans", "bold"); pdf.setFontSize(16); pdf.setTextColor(...PAL.accent);
  pdf.text(APP_NAME, M, y);
  pdf.setFont("LSans", "normal"); pdf.setFontSize(9); pdf.setTextColor(...PAL.mute);
  pdf.text(APP_TAGLINE, M, y + 5);
  // Тип документа — справа
  pdf.setFont("LSans", "bold"); pdf.setFontSize(12); pdf.setTextColor(...PAL.ink);
  pdf.text(TYPE_LABEL[doc.type] || "ДОКУМЕНТ", PW - M, y, { align: "right" });
  pdf.setFont("LSans", "normal"); pdf.setFontSize(10); pdf.setTextColor(...PAL.mute);
  pdf.text("№ " + docNum(doc) + " (демо)", PW - M, y + 5, { align: "right" });

  // Линия
  y += 12;
  pdf.setDrawColor(...PAL.hair); pdf.setLineWidth(0.3); pdf.line(M, y, PW - M, y);
  y += 10;

  // Реквизиты
  pdf.setFontSize(10); pdf.setTextColor(...PAL.ink);
  const kv = (label: string, val: string, xx: number): void => {
    pdf.setFont("LSans", "normal"); pdf.setTextColor(...PAL.mute); pdf.setFontSize(8);
    pdf.text(label, xx, y);
    pdf.setFont("LSans", "bold"); pdf.setTextColor(...PAL.ink); pdf.setFontSize(10);
    pdf.text(val, xx, y + 5);
  };
  kv("Клиент", doc.client, M);
  kv("Согласующий", doc.approver, M + 90);
  kv("Статус", STATUS_PRINT[doc.status] || doc.status, PW - M - 40);
  y += 14;

  // Таблица позиций
  pdf.setFont("LSans", "bold"); pdf.setFontSize(11); pdf.setTextColor(...PAL.ink);
  pdf.text("Позиции", M, y);
  y += 5;

  const cols = [M, M + 10, M + 90, M + 114, M + 144]; // x позиций
  const colW = [10, 80, 24, 30, 30];
  const heads = ["№", "Наименование", "Кол-во", "Цена", "Сумма"];

  // заголовок таблицы
  pdf.setFillColor(...PAL.head); pdf.rect(M, y, CW, 8, "F");
  pdf.setFont("LSans", "bold"); pdf.setFontSize(8.5); pdf.setTextColor(...PAL.ink3);
  for (let c = 0; c < heads.length; c++) {
    pdf.text(heads[c], cols[c] + (c >= 2 ? colW[c] - 2 : 2), y + 5.5, { align: c >= 2 ? "right" : "left", maxWidth: colW[c] - 4 });
  }
  y += 8;

  const items = itemsFor(doc);
  const total = totalOf(items);
  pdf.setFont("LSans", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...PAL.ink2);
  items.forEach((it, i) => {
    const sum = it.price == null ? null : it.qty * it.price;
    if (i % 2 === 1) { pdf.setFillColor(...PAL.zebra); pdf.rect(M, y, CW, 8, "F"); }
    pdf.text(String(i + 1), cols[0] + 2, y + 5.5);
    pdf.text(it.name, cols[1] + 2, y + 5.5, { maxWidth: colW[1] - 4 });
    pdf.text(String(it.qty), cols[2] + colW[2] - 2, y + 5.5, { align: "right" });
    pdf.text(money(it.price), cols[3] + colW[3] - 2, y + 5.5, { align: "right" });
    pdf.text(money(sum), cols[4] + colW[4] - 2, y + 5.5, { align: "right" });
    y += 8;
  });
  // линия
  pdf.setDrawColor(...PAL.hair); pdf.line(M, y, PW - M, y); y += 6;

  // Итого
  pdf.setFont("LSans", "bold"); pdf.setFontSize(11); pdf.setTextColor(...PAL.ink);
  pdf.text("Итого:", PW - M - 50, y);
  pdf.setTextColor(...PAL.accent); pdf.text(money(total), PW - M, y, { align: "right" });
  pdf.setFont("LSans", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...PAL.mute);
  pdf.text(total == null ? "Суммы не заданы (демо-режим)." : "Без НДС (демо-режим).", PW - M, y + 4, { align: "right" });
  y += 18;

  // Подписи
  pdf.setDrawColor(...PAL.rule); pdf.setLineWidth(0.3);
  pdf.line(M, y + 8, M + 70, y + 8); pdf.line(PW - M - 70, y + 8, PW - M, y + 8);
  pdf.setFontSize(8.5); pdf.setTextColor(...PAL.mute);
  pdf.text("Исполнитель", M, y + 12); pdf.text("Заказчик", PW - M - 70, y + 12);

  // Футер
  pdf.setFontSize(7.5); pdf.setTextColor(...PAL.faint);
  pdf.text("Сформировано в " + APP_NAME + " (демо-прототип). Документ не является юридически значимым.", M, 287, { maxWidth: CW });

  const fname = pdfFilename(doc);
  pdf.save(fname);
  return fname;
}
