import { APP_NAME } from "@/lib/config";
import { PAL } from "@/lib/pdf/documents";

/**
 * PDF-сертификат по итогам демо-теста (этап 3, группа 7) — порт `../download/pdf.js` certificateNow():
 * альбомный A4, двойная рамка, «СЕРТИФИКАТ», имя слушателя, программа курса, дата.
 * Кириллица — встроенный Liberation Sans (lib/pdf/pdf-font.ts). Печатается на белой бумаге
 * независимо от темы, как и документы (см. lib/pdf/documents.ts).
 */
import type { jsPDF } from "jspdf";

export interface CertificatePdfInput {
  name: string;
  course: string;
  date: string;
}

/** Имя файла: «сертификат-анна-смирнова.pdf» (как в pdf.js certificate). */
export function certificateFilename(name: string): string {
  return "сертификат-" + String(name).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "") + ".pdf";
}

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

/** Генерация и сохранение сертификата. Возвращает имя файла (для строки role="status"). */
export async function generateCertificatePdf(c: CertificatePdfInput): Promise<string> {
  const [{ jsPDF: JsPDF }, { AIWS_PDF_FONTS }] = await Promise.all([import("jspdf"), import("@/lib/pdf/pdf-font")]);
  const pdf = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  if (!applyLiberationSans(pdf, AIWS_PDF_FONTS)) throw new Error("Не удалось загрузить шрифт PDF");

  const PW = 297, PH = 210, cx = PW / 2;
  pdf.setDrawColor(...PAL.accent); pdf.setLineWidth(1); pdf.rect(10, 10, PW - 20, PH - 20);
  pdf.setLineWidth(0.3); pdf.rect(14, 14, PW - 28, PH - 28);
  pdf.setFont("LSans", "bold"); pdf.setFontSize(34); pdf.setTextColor(...PAL.accent);
  pdf.text("СЕРТИФИКАТ", cx, 55, { align: "center" });
  pdf.setFont("LSans", "normal"); pdf.setFontSize(13); pdf.setTextColor(...PAL.mute);
  pdf.text("подтверждает, что", cx, 75, { align: "center" });
  pdf.setFont("LSans", "bold"); pdf.setFontSize(26); pdf.setTextColor(...PAL.ink);
  pdf.text(String(c.name), cx, 95, { align: "center", maxWidth: PW - 60 });
  pdf.setFont("LSans", "normal"); pdf.setFontSize(13); pdf.setTextColor(...PAL.mute);
  pdf.text("успешно завершил(а) обучение по программе", cx, 112, { align: "center" });
  pdf.setFont("LSans", "bold"); pdf.setFontSize(17); pdf.setTextColor(...PAL.ink);
  pdf.text(pdf.splitTextToSize(String(c.course), PW - 70), cx, 128, { align: "center" });
  pdf.setFont("LSans", "normal"); pdf.setFontSize(11); pdf.setTextColor(...PAL.mute);
  pdf.text(String(c.date || ""), cx, 160, { align: "center" });
  pdf.setFontSize(8.5);
  pdf.text(APP_NAME + " · демо-прототип · документ не имеет юридической силы", cx, PH - 20, { align: "center" });

  const filename = certificateFilename(c.name);
  pdf.save(filename);
  return filename;
}
