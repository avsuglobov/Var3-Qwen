import { buildPrintHtml } from "@/styles/print-form";
import type { Document } from "@/lib/schemas";

/**
 * Печать документа через window.print — порт `../download/pdf.js` printDoc().
 * Альтернатива PDF без встроенного шрифта: кириллицу рендерит сам браузер.
 * Документ собирается в скрытый iframe, чтобы не затрагивать основной интерфейс;
 * iframe удаляется после вызова печати.
 */
export function printDocument(doc: Document, opts: { onUnavailable?: () => void } = {}): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const fd = frame.contentWindow?.document;
  if (!fd) {
    frame.remove();
    opts.onUnavailable?.();
    return;
  }
  fd.open(); fd.write(buildPrintHtml(doc)); fd.close();
  setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      opts.onUnavailable?.();
    }
    setTimeout(() => frame.parentNode?.removeChild(frame), 1500);
  }, 250);
}
