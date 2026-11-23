/* xlsx_build.js — минимальный сборщик .xlsx/.zip для тестов импорта (Node). Не для продакшена. */
const zlib = require("zlib");
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  let c, crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
// entries: [{name, data:Buffer, store?:bool, claimUsize?:number, garbage?:bool}]
function buildZip(entries) {
  const locals = [], centrals = []; let off = 0;
  entries.forEach((e) => {
    const name = Buffer.from(e.name, "utf8"), raw = Buffer.from(e.data);
    const method = e.store ? 0 : 8;
    const data = e.garbage ? Buffer.from("это не deflate-поток 1234567890") : method === 0 ? raw : zlib.deflateRawSync(raw);
    const crc = crc32(raw), usize = e.claimUsize != null ? e.claimUsize : raw.length;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(usize, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(usize, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    centrals.push(ch, name);
    off += 30 + name.length + data.length;
  });
  const cd = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colName = (i) => String.fromCharCode(65 + i);
// rows: матрица; ячейка: строка | число | {rich:[..]} | {inline:"..."} | "" (пропуск)
function buildXlsx(rows, o = {}) {
  const sst = []; const sstIdx = (s) => { let i = sst.indexOf(s); if (i < 0) { sst.push(s); i = sst.length - 1; } return i; };
  const sheetRows = rows.map((r, ri) => "<row r=\"" + (ri + 1) + "\">" + r.map((c, ci) => {
    const ref = colName(ci) + (ri + 1);
    if (c === "" || c == null) return "";
    if (typeof c === "number") return `<c r="${ref}"><v>${c}</v></c>`;
    if (c.inline) return `<c r="${ref}" t="inlineStr"><is><t>${esc(c.inline)}</t></is></c>`;
    if (c.rich) return `<c r="${ref}" t="s"><v>${sstIdx({ rich: c.rich })}</v></c>`;
    return `<c r="${ref}" t="s"><v>${sstIdx(c)}</v></c>`;
  }).join("") + "</row>").join("");
  const sstXml = '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    sst.map((s) => typeof s === "string" ? `<si><t>${esc(s)}</t></si>` : "<si>" + s.rich.map((t) => `<r><t>${esc(t)}</t></r>`).join("") + '<rPh sb="0" eb="1"><t>ФОНЕТИКА</t></rPh></si>').join("") + "</sst>";
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const files = [
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: "xl/workbook.xml", data: `<?xml version="1.0"?><workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Лист1" sheetId="1" r:id="rId7"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: `<?xml version="1.0"?><worksheet ${NS}><sheetData>${sheetRows}</sheetData></worksheet>` },
    { name: "xl/sharedStrings.xml", data: sstXml }
  ].map((f) => Object.assign(f, o.entryOpts && o.entryOpts[f.name], { store: o.store }));
  return buildZip(files);
}
module.exports = { buildZip, buildXlsx };
