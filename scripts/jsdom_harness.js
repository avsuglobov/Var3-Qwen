const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const DL = path.join(__dirname, "..", "download");
function load(opts = {}) {
  let html = fs.readFileSync(path.join(DL, "index.html"), "utf8");
  html = html.replace(/<link[^>]*fonts[^>]*>/g, "");
  // inline scripts except pdf deps
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(DL, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]);
      w.matchMedia = w.matchMedia || (q => ({ matches: !!opts.dark, addEventListener() {}, removeEventListener() {} }));
      w.__errors = [];
      w.TextDecoder = global.TextDecoder; w.TextEncoder = global.TextEncoder; w.DecompressionStream = global.DecompressionStream;
      if (opts.breakStorage) {   // имитация недоступного localStorage (приватный режим / запрет cookies)
        Object.defineProperty(w, "localStorage", { get() { throw new w.DOMException("denied", "SecurityError"); } });
      }
      if (opts.trackListeners) {   // для аудита: какие элементы имеют обработчики
        const seen = new w.WeakMap(); w.__listeners = seen;
        const add = w.EventTarget.prototype.addEventListener;
        w.EventTarget.prototype.addEventListener = function (type, fn, o) { let s = seen.get(this); if (!s) { s = new w.Set(); seen.set(this, s); } s.add(type); return add.call(this, type, fn, o); };
      }
      w.addEventListener("error", e => w.__errors.push(String(e.message)));
      w.URL.createObjectURL = (b) => { w.__lastBlob = b; return "blob:fake"; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
    } });
  return dom;
}
module.exports = { load, DL };
