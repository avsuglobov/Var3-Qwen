/* =========================================================================
   importer.js — разбор .xlsx и .csv для импорта лидов (без внешних библиотек).
   .xlsx = ZIP: читаем центральный каталог, распаковываем deflate через DecompressionStream,
   парсим sharedStrings и первый лист. Лимиты защищают от огромных файлов и «zip-бомб».
   API: AIWS.importer.parseFile(file) -> Promise<{headers, rows, total, truncated}>,
        AIWS.importer.guessMapping(headers) -> массив id полей по колонкам.
   Ошибки приходят с понятным русским сообщением в error.userMessage.
   ========================================================================= */
(function (global) {
  "use strict";
  var AIWS = (global.AIWS = global.AIWS || {});

  var MAX_BYTES = 5 * 1024 * 1024;      // размер файла
  var MAX_UNZIP = 20 * 1024 * 1024;     // размер распакованной части (защита от zip-бомб)
  var MAX_ROWS = 2000, MAX_COLS = 30;

  var FIELDS = [
    ["name", "Имя клиента"], ["phone", "Телефон"], ["email", "Email"],
    ["lastContact", "Последний контакт"], ["note", "Комментарий"], ["skip", "— не использовать —"]
  ];

  function fail(msg, cause) { var e = new Error(msg); e.userMessage = msg; e.cause = cause; return e; }

  /* ---------------------------------------------------------------- чтение файла */
  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fail("Не удалось прочитать файл")); };
      fr.readAsArrayBuffer(file);
    });
  }
  function decodeUtf8(u8) { return new (global.TextDecoder || TextDecoder)("utf-8").decode(u8); }

  /* ---------------------------------------------------------------- CSV */
  function decodeCsv(u8) {
    var utf = decodeUtf8(u8);
    if (utf.charCodeAt(0) === 0xFEFF) utf = utf.slice(1);
    if (utf.indexOf("\uFFFD") < 0) return utf;
    try { return new (global.TextDecoder || TextDecoder)("windows-1251").decode(u8); } catch (e) { return utf; }   // Excel (RU) часто сохраняет CSV в cp1251
  }
  function parseCSV(text) {
    var first = text.split(/\r?\n/)[0] || "";
    var delims = [";", ",", "\t"], delim = ";", best = -1;
    delims.forEach(function (d) { var n = first.split(d).length - 1; if (n > best) { best = n; delim = d; } });
    var rows = [], row = [], cell = "", q = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
      i++;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* ---------------------------------------------------------------- ZIP / XLSX */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function readZip(u8) {
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) { if (u32(u8, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw fail("Файл не похож на Excel (.xlsx): не найден ZIP-каталог");
    var count = u16(u8, eocd + 10), off = u32(u8, eocd + 16);
    if (count === 0xFFFF || off === 0xFFFFFFFF) throw fail("Файлы ZIP64 не поддерживаются");
    var entries = {};
    for (var n = 0; n < count; n++) {
      if (u32(u8, off) !== 0x02014b50) throw fail("Повреждён ZIP-каталог файла");
      var nameLen = u16(u8, off + 28), extraLen = u16(u8, off + 30), commentLen = u16(u8, off + 32);
      var name = decodeUtf8(u8.subarray(off + 46, off + 46 + nameLen));
      entries[name] = { method: u16(u8, off + 10), csize: u32(u8, off + 20), usize: u32(u8, off + 24), local: u32(u8, off + 42) };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }
  function inflateRaw(raw) {
    var DS = global.DecompressionStream || (typeof DecompressionStream !== "undefined" ? DecompressionStream : null);
    if (!DS) return Promise.reject(fail("Браузер не поддерживает распаковку .xlsx. Сохраните файл как CSV и загрузите его"));
    var ds = new DS("deflate-raw"), writer = ds.writable.getWriter(), reader = ds.readable.getReader();
    writer.write(raw).catch(function () {}); writer.close().catch(function () {});
    var chunks = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { var out = new Uint8Array(total), p = 0; chunks.forEach(function (c) { out.set(c, p); p += c.length; }); return out; }
        total += r.value.length;
        if (total > MAX_UNZIP) { reader.cancel().catch(function () {}); throw fail("Файл слишком большой после распаковки"); }
        chunks.push(r.value); return pump();
      });
    }
    return pump().catch(function (e) { throw e.userMessage ? e : fail("Файл повреждён: не удалось распаковать", e); });
  }
  function entryBytes(u8, entries, name) {
    var e = entries[name]; if (!e) return Promise.resolve(null);
    if (e.usize > MAX_UNZIP) return Promise.reject(fail("Файл слишком большой после распаковки"));
    var lo = e.local;
    if (u32(u8, lo) !== 0x04034b50) return Promise.reject(fail("Повреждён ZIP-файл"));
    var start = lo + 30 + u16(u8, lo + 26) + u16(u8, lo + 28);
    var raw = u8.subarray(start, start + e.csize);
    if (e.method === 0) return Promise.resolve(raw);
    if (e.method === 8) return inflateRaw(raw);
    return Promise.reject(fail("Неподдерживаемый способ сжатия в .xlsx"));
  }
  function parseXml(bytes, what) {
    var doc = new (global.DOMParser || DOMParser)().parseFromString(decodeUtf8(bytes), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw fail("Повреждён XML внутри .xlsx (" + what + ")");
    return doc;
  }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ""); if (!m) return -1;
    var n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  function textOf(node) {   // весь текст <si>/<is>, без фонетических подсказок <rPh>
    var out = "", ts = node.getElementsByTagName("t");
    for (var i = 0; i < ts.length; i++) { if (ts[i].parentNode && ts[i].parentNode.nodeName === "rPh") continue; out += ts[i].textContent; }
    return out;
  }
  function firstSheetPath(entries, wbDoc, relsDoc) {
    if (wbDoc && relsDoc) {
      var sh = wbDoc.getElementsByTagName("sheet")[0];
      var rid = sh && (sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
      var rels = relsDoc.getElementsByTagName("Relationship");
      for (var i = 0; i < rels.length; i++) {
        if (rels[i].getAttribute("Id") === rid) { var t = rels[i].getAttribute("Target") || ""; t = t.charAt(0) === "/" ? t.slice(1) : "xl/" + t; if (entries[t]) return t; }
      }
    }
    var names = Object.keys(entries).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
      .sort(function (a, b) { return parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10); });
    return names[0] || null;
  }
  function parseXLSX(buf) {
    var u8 = new Uint8Array(buf), entries = readZip(u8);
    if (!entries["xl/workbook.xml"] && !firstSheetPath(entries)) throw fail("В файле нет листов Excel");
    return Promise.all([entryBytes(u8, entries, "xl/workbook.xml"), entryBytes(u8, entries, "xl/_rels/workbook.xml.rels"), entryBytes(u8, entries, "xl/sharedStrings.xml")]).then(function (r) {
      var path = firstSheetPath(entries, r[0] && parseXml(r[0], "workbook"), r[1] && parseXml(r[1], "rels"));
      if (!path) throw fail("В файле нет листов Excel");
      var sst = [];
      if (r[2]) { var sis = parseXml(r[2], "sharedStrings").getElementsByTagName("si"); for (var i = 0; i < sis.length; i++) sst.push(textOf(sis[i])); }
      return entryBytes(u8, entries, path).then(function (sheet) {
        var doc = parseXml(sheet, "лист"), rows = [], rowEls = doc.getElementsByTagName("row");
        for (var ri = 0; ri < rowEls.length && rows.length <= MAX_ROWS + 50; ri++) {
          var cells = rowEls[ri].getElementsByTagName("c"), row = [], any = false;
          for (var ci = 0; ci < cells.length; ci++) {
            var c = cells[ci], idx = colIndex(c.getAttribute("r")); if (idx < 0) idx = row.length;
            if (idx >= MAX_COLS) continue;
            var t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0], val = "";
            if (t === "s") val = v ? (sst[parseInt(v.textContent, 10)] || "") : "";
            else if (t === "inlineStr") { var is = c.getElementsByTagName("is")[0]; val = is ? textOf(is) : ""; }
            else val = v ? v.textContent : "";
            while (row.length <= idx) row.push("");
            row[idx] = val; if (String(val).trim() !== "") any = true;
          }
          if (any) rows.push(row);
        }
        return rows;
      });
    });
  }

  /* ---------------------------------------------------------------- общий вход */
  function excelSerialToISO(n) { var d = new Date(Math.round((n - 25569) * 86400000)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  function normalize(matrix) {
    var hi = -1;
    for (var i = 0; i < matrix.length; i++) { if (matrix[i].some(function (c) { return String(c).trim() !== ""; })) { hi = i; break; } }
    if (hi < 0) throw fail("В файле нет данных");
    var width = Math.min(MAX_COLS, Math.max.apply(null, matrix.slice(hi).map(function (r) { return r.length; })));
    var headers = [];
    for (var c = 0; c < width; c++) { var h = String(matrix[hi][c] == null ? "" : matrix[hi][c]).trim(); headers.push(h || "Колонка " + (c + 1)); }
    var body = matrix.slice(hi + 1).filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
    var total = body.length, truncated = total > MAX_ROWS; if (truncated) body = body.slice(0, MAX_ROWS);
    var dateCols = headers.map(function (h) { return /дат|date/i.test(h); });
    var rows = body.map(function (r) {
      var out = [];
      for (var c = 0; c < width; c++) {
        var v = String(r[c] == null ? "" : r[c]).trim();
        if (dateCols[c] && /^\d{5}(\.\d+)?$/.test(v)) v = excelSerialToISO(parseFloat(v)) || v;   // серийная дата Excel -> ГГГГ-ММ-ДД
        out.push(v);
      }
      return out;
    });
    if (!rows.length) throw fail("В файле только заголовки, строк с данными нет");
    return { headers: headers, rows: rows, total: total, truncated: truncated };
  }
  function parseFile(file) {
    if (!file) return Promise.reject(fail("Файл не выбран"));
    var name = String(file.name || ""), ext = (/\.([A-Za-z0-9]+)$/.exec(name) || [])[1];
    ext = ext && ext.toLowerCase();
    if (ext !== "xlsx" && ext !== "csv") return Promise.reject(fail("Поддерживаются файлы .xlsx и .csv (старый формат .xls — сохраните как .xlsx)"));
    if (file.size > MAX_BYTES) return Promise.reject(fail("Файл больше 5 МБ"));
    if (file.size === 0) return Promise.reject(fail("Файл пустой"));
    return readBuffer(file).then(function (buf) {
      if (ext === "csv") return normalize(parseCSV(decodeCsv(new Uint8Array(buf))));
      return parseXLSX(buf).then(normalize);
    }).catch(function (e) { throw e && e.userMessage ? e : fail("Не удалось разобрать файл", e); });
  }

  /* ---------------------------------------------------------------- сопоставление колонок */
  var GUESS = [
    ["email", /e-?mail|почт/i], ["phone", /телефон|phone|\bтел\b|моб/i], ["lastContact", /дат|date|последн/i],
    ["note", /коммент|примеч|note|заметк/i], ["name", /^(имя|фио|клиент|контакт|name|компания|company|организац)|имя|фио/i]
  ];
  function guessMapping(headers) {
    var used = {}, map = headers.map(function () { return "skip"; });
    GUESS.forEach(function (g) {
      for (var i = 0; i < headers.length; i++) { if (!used[g[0]] && map[i] === "skip" && g[1].test(headers[i])) { map[i] = g[0]; used[g[0]] = true; break; } }
    });
    if (!used.name && headers.length) { for (var j = 0; j < headers.length; j++) { if (map[j] === "skip") { map[j] = "name"; break; } } }
    return map;
  }

  AIWS.importer = { parseFile: parseFile, parseCSV: parseCSV, guessMapping: guessMapping, FIELDS: FIELDS, limits: { MAX_BYTES: MAX_BYTES, MAX_ROWS: MAX_ROWS, MAX_COLS: MAX_COLS, MAX_UNZIP: MAX_UNZIP } };
})(window);
