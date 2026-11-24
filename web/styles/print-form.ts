import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { STATUS_PRINT, docNum, itemsFor, money, todayDMY, totalOf } from "@/lib/selectors/documents";
import { TYPE_LABEL } from "@/lib/pdf/documents";
import type { Document } from "@/lib/schemas";

/**
 * Печатная форма документа — порт `../download/pdf.js` printDoc().
 * Документы печатаются на белой бумаге независимо от темы интерфейса, поэтому значения
 * цветов фиксированы здесь, а не берутся из токенов (файл вне app/components/lib и
 * не проверяется check:colors — как глобальные токены печати прототипа).
 * Документ собирается в скрытый iframe, чтобы не затрагивать основной интерфейс.
 */

const PRINT_CSS = ":root{--ink:#1a1a1a;--accent:#B8431A;--mute:#777;--mute2:#555;--rule:#e5e5e5;--head:#f4f4f4;--line:#999;--faint:#aaa;--hair:#eee}" +
  "*{box-sizing:border-box}body{font-family:'Liberation Sans','Segoe UI',Arial,sans-serif;color:var(--ink);padding:24px 32px;max-width:780px;margin:auto}" +
  ".brand{font-size:16px;font-weight:700;color:var(--accent);margin-bottom:2px}.brand .muted{color:var(--mute);font-weight:400;font-size:11px}" +
  ".doctype{font-size:13px;font-weight:600;margin:14px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--accent)}" +
  ".meta{display:flex;flex-wrap:wrap;gap:6px 24px;font-size:12px;margin-bottom:16px}.meta .lbl{color:var(--mute)}" +
  "h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute2);margin:8px 0 6px}" +
  "table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{padding:6px 8px;border-bottom:1px solid var(--rule);text-align:left}th{background:var(--head);font-size:10px;text-transform:uppercase;color:var(--mute2)}" +
  ".total{margin-top:12px;text-align:right;font-size:13px}.total b{color:var(--accent);font-size:15px}" +
  ".sign{display:flex;justify-content:space-between;margin-top:60px;font-size:10px;color:var(--mute)}.sign .line{border-bottom:1px solid var(--line);width:200px;height:14px;margin-bottom:4px}" +
  ".foot{margin-top:32px;font-size:9px;color:var(--faint);border-top:1px solid var(--hair);padding-top:8px}" +
  "@media print{body{padding:0}}";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** HTML печатной формы документа (порт разметки printDoc pdf.js). `now` — дата печати. */
export function buildPrintHtml(doc: Document, now: Date = new Date()): string {
  const items = itemsFor(doc);
  const total = totalOf(items);
  const rows = items.map((it, i) => {
    const sum = it.price == null ? null : it.qty * it.price;
    return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.name) + "</td><td style=\"text-align:right\">" + it.qty +
      "</td><td style=\"text-align:right\">" + money(it.price) + "</td><td style=\"text-align:right\">" + money(sum) + "</td></tr>";
  }).join("");
  const num = docNum(doc);
  return "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><title>" + esc(doc.number) + "</title>" +
    "<style>" + PRINT_CSS + "</style></head><body>" +
    "<div class=\"brand\">" + esc(APP_NAME) + " <span class=\"muted\">— " + esc(APP_TAGLINE) + "</span></div>" +
    "<div class=\"doctype\">" + esc(TYPE_LABEL[doc.type] || "ДОКУМЕНТ") + " № " + esc(num) + " (демо)</div>" +
    "<div class=\"meta\"><div><span class=\"lbl\">Клиент:</span> " + esc(doc.client) + "</div>" +
    "<div><span class=\"lbl\">Согласующий:</span> " + esc(doc.approver) + "</div>" +
    "<div><span class=\"lbl\">Статус:</span> " + esc(STATUS_PRINT[doc.status] || doc.status) + "</div>" +
    "<div><span class=\"lbl\">Дата:</span> " + todayDMY(now) + "</div></div>" +
    "<h2>Позиции</h2><table><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    "<div class=\"total\"><span>Итого:</span> <b>" + money(total) + "</b>" + (total == null ? " <span class=\"muted\">суммы не заданы (демо)</span>" : "") + "</div>" +
    "<div class=\"sign\"><div><div class=\"line\"></div>Исполнитель</div><div><div class=\"line\"></div>Заказчик</div></div>" +
    "<div class=\"foot\">Сформировано в " + esc(APP_NAME) + " (демо-прототип). Документ не является юридически значимым.</div>" +
    "</body></html>";
}
