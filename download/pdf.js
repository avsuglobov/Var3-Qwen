/* =========================================================================
   pdf.js — генерация PDF документов (счёт/КП/акт) в браузере через jsPDF.
   Кириллица: встроен шрифт Liberation Sans (pdf-font.js, base64) — стандартные
   шрифты jsPDF (Helvetica) кириллицу не содержат. Без сети, без сборки.
   ========================================================================= */
(function (global) {
  "use strict";
  var AIWS = global.AIWS;
  var D = AIWS.data;
  var toast = AIWS.toast;
  var esc = AIWS.helpers.esc;
  var CFG = AIWS.config;
  // Палитра печатных форм (PDF и печать). Документы печатаются на белой бумаге независимо от темы интерфейса,
  // поэтому значения фиксированы здесь, а не разбросаны по коду.
  var PAL = { accent: [184, 67, 26], ink: [20, 20, 20], ink2: [30, 30, 30], ink3: [60, 60, 60], mute: [110, 110, 110], faint: [150, 150, 150], rule: [200, 200, 200], hair: [225, 225, 225], head: [244, 244, 244], zebra: [249, 249, 249] };


  var TYPE_LABEL = { invoice: "СЧЁТ", offer: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", act: "АКТ" };
  var STATUS = { pending: "На согласовании", approved: "Одобрен", rejected: "Отклонён" };

  function money(n) {
    // пример: 12 тыс. -> "12 000 ₽"; нет суммы -> "—" (ничего не выдумываем)
    if (typeof n !== "number" || !isFinite(n)) return "—";
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
  }
  // Номер документа без типа и «Демо-»: "Демо-счёт №204" -> "204"
  function docNum(doc) {
    var m = /№\s*(\S+)/.exec(String(doc.number || ""));
    return m ? m[1] : String(doc.id || "");
  }
  function todayDMY() {
    var t = new Date();
    var p = function (n) { return n < 10 ? "0" + n : "" + n; };
    return p(t.getDate()) + "." + p(t.getMonth() + 1) + "." + t.getFullYear();
  }

  // Позиции документа. Цены и тарифы НЕ выдумываем: если у документа нет суммы (doc.amount),
  // строка показывается без цены, итог — «—». Реальные позиции придут с бэкенда (doc.items).
  var ITEM_NAME = { invoice: "Услуги по счёту", offer: "Предложение по услугам", act: "Оказанные услуги" };
  function itemsFor(doc) {
    if (Array.isArray(doc.items) && doc.items.length) {
      return doc.items.map(function (it) {
        return { name: String(it.name || "Позиция"), qty: Number(it.qty) || 1, price: typeof it.price === "number" ? it.price : null };
      });
    }
    return [{ name: (ITEM_NAME[doc.type] || "Позиция") + " (состав не задан, демо)", qty: 1,
      price: typeof doc.amount === "number" ? doc.amount : null }];
  }
  function totalOf(items) {
    var t = 0;
    for (var i = 0; i < items.length; i++) { if (items[i].price == null) return null; t += items[i].qty * items[i].price; }
    return t;
  }

  // Ленивая загрузка jsPDF + шрифта (по первому запросу PDF) — старт приложения остаётся быстрым.
  var _depsReady = false, _depsQ = null;
  function loadDeps(cb) {
    if (_depsReady) { cb(); return; }
    if (_depsQ) { _depsQ.push(cb); return; }
    _depsQ = [cb];
    function done(ok) {
      var q = _depsQ; _depsQ = null;
      if (!ok) { toast("Не удалось загрузить PDF-библиотеку"); return; }
      _depsReady = true; q.forEach(function (f) { f(); });
    }
    var s1 = document.createElement("script"); s1.src = "vendor/jspdf.umd.min.js";
    s1.onload = function () {
      var s2 = document.createElement("script"); s2.src = "pdf-font.js";
      s2.onload = function () { done(true); };
      s2.onerror = function () { done(false); };
      document.head.appendChild(s2);
    };
    s1.onerror = function () { done(false); };
    document.head.appendChild(s1);
  }

  // Именной сертификат (альбомная A4). Демо: без юридической силы, пометка в подвале.
  function certificate(c) { loadDeps(function () { certificateNow(c); }); }
  function certificateNow(c) {
    if (!global.jspdf || !global.jspdf.jsPDF) { toast("PDF-библиотека не загружена"); return; }
    var pdf = new global.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    var F = global.AIWS_PDF_FONTS || {};
    if (F.regular) { pdf.addFileToVFS("LSans-Regular.ttf", F.regular); pdf.addFont("LSans-Regular.ttf", "LSans", "normal"); }
    if (F.bold) { pdf.addFileToVFS("LSans-Bold.ttf", F.bold); pdf.addFont("LSans-Bold.ttf", "LSans", "bold"); }
    var PW = 297, PH = 210, cx = PW / 2;
    pdf.setDrawColor.apply(pdf, PAL.accent); pdf.setLineWidth(1); pdf.rect(10, 10, PW - 20, PH - 20);
    pdf.setLineWidth(0.3); pdf.rect(14, 14, PW - 28, PH - 28);
    pdf.setFont("LSans", "bold"); pdf.setFontSize(34); pdf.setTextColor.apply(pdf, PAL.accent); pdf.text("СЕРТИФИКАТ", cx, 55, { align: "center" });
    pdf.setFont("LSans", "normal"); pdf.setFontSize(13); pdf.setTextColor.apply(pdf, PAL.mute); pdf.text("подтверждает, что", cx, 75, { align: "center" });
    pdf.setFont("LSans", "bold"); pdf.setFontSize(26); pdf.setTextColor.apply(pdf, PAL.ink); pdf.text(String(c.name), cx, 95, { align: "center", maxWidth: PW - 60 });
    pdf.setFont("LSans", "normal"); pdf.setFontSize(13); pdf.setTextColor.apply(pdf, PAL.mute); pdf.text("успешно завершил(а) обучение по программе", cx, 112, { align: "center" });
    pdf.setFont("LSans", "bold"); pdf.setFontSize(17); pdf.setTextColor.apply(pdf, PAL.ink);
    pdf.text(pdf.splitTextToSize(String(c.course), PW - 70), cx, 128, { align: "center" });
    pdf.setFont("LSans", "normal"); pdf.setFontSize(11); pdf.setTextColor.apply(pdf, PAL.mute); pdf.text(String(c.date || ""), cx, 160, { align: "center" });
    pdf.setFontSize(8.5); pdf.text(CFG.APP_NAME + " · демо-прототип · документ не имеет юридической силы", cx, PH - 20, { align: "center" });
    pdf.save("сертификат-" + String(c.name).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "") + ".pdf");
    toast("Сертификат сохранён (PDF)");
  }

  function generate(docId) {
    loadDeps(function () { generateNow(docId); });
  }
  function generateNow(docId) {
    if (!global.jspdf || !global.jspdf.jsPDF) { toast("PDF-библиотека не загружена"); return; }
    var doc = D.DOCUMENTS.filter(function (d) { return d.id === docId; })[0];
    if (!doc) { toast("Документ не найден"); return; }

    var jsPDF = global.jspdf.jsPDF;
    var pdf = new jsPDF({ unit: "mm", format: "a4" });
    var F = global.AIWS_PDF_FONTS || {};
    if (F.regular) { pdf.addFileToVFS("LSans-Regular.ttf", F.regular); pdf.addFont("LSans-Regular.ttf", "LSans", "normal"); }
    if (F.bold) { pdf.addFileToVFS("LSans-Bold.ttf", F.bold); pdf.addFont("LSans-Bold.ttf", "LSans", "bold"); }
    pdf.setFont("LSans", "normal");

    var PW = 210, M = 18, CW = PW - 2 * M; // контент = 174мм
    var y = 20;

    // Шапка
    pdf.setFont("LSans", "bold"); pdf.setFontSize(16); pdf.setTextColor.apply(pdf, PAL.accent); // accent
    pdf.text(CFG.APP_NAME, M, y);
    pdf.setFont("LSans", "normal"); pdf.setFontSize(9); pdf.setTextColor.apply(pdf, PAL.mute);
    pdf.text(CFG.APP_TAGLINE, M, y + 5);
    // Тип документа — справа
    pdf.setFont("LSans", "bold"); pdf.setFontSize(12); pdf.setTextColor.apply(pdf, PAL.ink);
    pdf.text(TYPE_LABEL[doc.type] || "ДОКУМЕНТ", PW - M, y, { align: "right" });
    pdf.setFont("LSans", "normal"); pdf.setFontSize(10); pdf.setTextColor.apply(pdf, PAL.mute);
    pdf.text("№ " + docNum(doc) + " (демо)", PW - M, y + 5, { align: "right" });

    // Линия
    y += 12;
    pdf.setDrawColor.apply(pdf, PAL.hair); pdf.setLineWidth(0.3); pdf.line(M, y, PW - M, y);
    y += 10;

    // Реквизиты
    pdf.setFontSize(10); pdf.setTextColor.apply(pdf, PAL.ink);
    function kv(label, val, xx) {
      pdf.setFont("LSans", "normal"); pdf.setTextColor.apply(pdf, PAL.mute); pdf.setFontSize(8);
      pdf.text(label, xx, y);
      pdf.setFont("LSans", "bold"); pdf.setTextColor.apply(pdf, PAL.ink); pdf.setFontSize(10);
      pdf.text(val, xx, y + 5);
    }
    kv("Клиент", doc.client, M);
    kv("Согласующий", doc.approver, M + 90);
    kv("Статус", STATUS[doc.status] || doc.status, PW - M - 40);
    y += 14;

    // Таблица позиций
    pdf.setFont("LSans", "bold"); pdf.setFontSize(11); pdf.setTextColor.apply(pdf, PAL.ink);
    pdf.text("Позиции", M, y);
    y += 5;

    var cols = [M, M + 10, M + 90, M + 114, M + 144]; // x позиций
    var colW = [10, 80, 24, 30, 30];
    var heads = ["№", "Наименование", "Кол-во", "Цена", "Сумма"];

    // заголовок таблицы
    pdf.setFillColor.apply(pdf, PAL.head); pdf.rect(M, y, CW, 8, "F");
    pdf.setFont("LSans", "bold"); pdf.setFontSize(8.5); pdf.setTextColor.apply(pdf, PAL.ink3);
    for (var c = 0; c < heads.length; c++) {
      pdf.text(heads[c], cols[c] + (c >= 2 ? colW[c] - 2 : 2), y + 5.5, { align: c >= 2 ? "right" : "left", maxWidth: colW[c] - 4 });
    }
    y += 8;

    var items = itemsFor(doc);
    var total = totalOf(items);
    pdf.setFont("LSans", "normal"); pdf.setFontSize(9.5); pdf.setTextColor.apply(pdf, PAL.ink2);
    items.forEach(function (it, i) {
      var sum = it.price == null ? null : it.qty * it.price;
      if (i % 2 === 1) { pdf.setFillColor.apply(pdf, PAL.zebra); pdf.rect(M, y, CW, 8, "F"); }
      pdf.text(String(i + 1), cols[0] + 2, y + 5.5);
      pdf.text(it.name, cols[1] + 2, y + 5.5, { maxWidth: colW[1] - 4 });
      pdf.text(String(it.qty), cols[2] + colW[2] - 2, y + 5.5, { align: "right" });
      pdf.text(money(it.price == null ? null : it.price), cols[3] + colW[3] - 2, y + 5.5, { align: "right" });
      pdf.text(money(sum), cols[4] + colW[4] - 2, y + 5.5, { align: "right" });
      y += 8;
    });
    // линия
    pdf.setDrawColor.apply(pdf, PAL.hair); pdf.line(M, y, PW - M, y); y += 6;

    // Итого
    pdf.setFont("LSans", "bold"); pdf.setFontSize(11); pdf.setTextColor.apply(pdf, PAL.ink);
    pdf.text("Итого:", PW - M - 50, y);
    pdf.setTextColor.apply(pdf, PAL.accent); pdf.text(money(total), PW - M, y, { align: "right" });
    pdf.setFont("LSans", "normal"); pdf.setFontSize(8.5); pdf.setTextColor.apply(pdf, PAL.mute);
    pdf.text(total == null ? "Суммы не заданы (демо-режим)." : "Без НДС (демо-режим).", PW - M, y + 4, { align: "right" });
    y += 18;

    // Подписи
    pdf.setDrawColor.apply(pdf, PAL.rule); pdf.setLineWidth(0.3);
    pdf.line(M, y + 8, M + 70, y + 8); pdf.line(PW - M - 70, y + 8, PW - M, y + 8);
    pdf.setFontSize(8.5); pdf.setTextColor.apply(pdf, PAL.mute);
    pdf.text("Исполнитель", M, y + 12); pdf.text("Заказчик", PW - M - 70, y + 12);

    // Футер
    pdf.setFontSize(7.5); pdf.setTextColor.apply(pdf, PAL.faint);
    pdf.text("Сформировано в " + CFG.APP_NAME + " (демо-прототип). Документ не является юридически значимым.",
      M, 287, { maxWidth: CW });

    var fname = (TYPE_LABEL[doc.type] || "Документ").toLowerCase().replace(/\s+/g, "-") + "-" + doc.id + ".pdf";
    pdf.save(fname);
    if (toast) toast("PDF сформирован: " + fname);
  }

  var PRINT_CSS = ":root{--ink:#1a1a1a;--accent:#B8431A;--mute:#777;--mute2:#555;--rule:#e5e5e5;--head:#f4f4f4;--line:#999;--faint:#aaa;--hair:#eee}" +
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

  // Печать через window.print (альтернатива PDF без встроенного шрифта: кириллицу рендерит сам браузер).
  // Документ собирается в скрытый iframe, чтобы не затрагивать основной интерфейс.
  function printDoc(docId) {
    var doc = D.DOCUMENTS.filter(function (d) { return d.id === docId; })[0];
    if (!doc) { toast("Документ не найден"); return; }
    var items = itemsFor(doc);
    var total = totalOf(items);
    var rows = items.map(function (it, i) {
      var sum = it.price == null ? null : it.qty * it.price;
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.name) + '</td><td style="text-align:right">' + it.qty +
        '</td><td style="text-align:right">' + money(it.price) + '</td><td style="text-align:right">' + money(sum) + '</td></tr>';
    }).join("");
    var num = docNum(doc);
    var html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>' + esc(doc.number) + '</title>' +
      '<style>' + PRINT_CSS + '</style></head><body>' +
      '<div class="brand">' + esc(CFG.APP_NAME) + ' <span class="muted">— ' + esc(CFG.APP_TAGLINE) + '</span></div>' +
      '<div class="doctype">' + esc(TYPE_LABEL[doc.type] || "ДОКУМЕНТ") + ' № ' + esc(num) + ' (демо)</div>' +
      '<div class="meta"><div><span class="lbl">Клиент:</span> ' + esc(doc.client) + '</div>' +
      '<div><span class="lbl">Согласующий:</span> ' + esc(doc.approver) + '</div>' +
      '<div><span class="lbl">Статус:</span> ' + esc(STATUS[doc.status] || doc.status) + '</div>' +
      '<div><span class="lbl">Дата:</span> ' + todayDMY() + '</div></div>' +
      '<h2>Позиции</h2><table><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="total"><span>Итого:</span> <b>' + money(total) + '</b>' + (total == null ? ' <span class="muted">суммы не заданы (демо)</span>' : '') + '</div>' +
      '<div class="sign"><div><div class="line"></div>Исполнитель</div><div><div class="line"></div>Заказчик</div></div>' +
      '<div class="foot">Сформировано в ' + esc(CFG.APP_NAME) + ' (демо-прототип). Документ не является юридически значимым.</div>' +
      '</body></html>';
    var frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    var fd = frame.contentWindow.document;
    fd.open(); fd.write(html); fd.close();
    setTimeout(function () {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (e) { toast("Печать недоступна в этом окружении"); }
      setTimeout(function () { if (frame.parentNode) frame.parentNode.removeChild(frame); }, 1500);
    }, 250);
    toast("Открываю печать…");
  }

  AIWS.pdf = { certificate: certificate, generate: generate, printDoc: printDoc, _money: money, _docNum: docNum, _itemsFor: itemsFor, _totalOf: totalOf };
})(typeof window !== "undefined" ? window : this);
