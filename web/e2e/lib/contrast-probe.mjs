/* Проба контраста WCAG для page.evaluate: для каждого видимого текста считает контраст с эффективным фоном
   (4.5:1; для крупного текста 3:1). Возвращает { "<класс | цвет on фон>": { n, ratio, need, sample } } для пар ниже порога. */
export function contrastProbe() {
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    const chain = []; for (let n = el; n; n = n.parentElement) chain.push(n);
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) { const c = parse(getComputedStyle(chain[i]).backgroundColor); if (c && c.a > 0) bg = over(c, bg); }
    return bg;
  };
  const res = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || el.closest("script,style,svg,[aria-hidden='true']")) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const bg = bgOf(el); let fg = parse(cs.color); if (!fg) continue; fg = over({ ...fg, a: fg.a * (+cs.opacity || 1) }, bg);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5, cr = ratio(fg, bg);
    if (cr < need) {
      const key = ((el.className && String(el.className).split(" ")[0]) || el.tagName) + " | " + cs.color + " on rgb(" + [bg.r, bg.g, bg.b].map(Math.round).join(",") + ")";
      (res[key] = res[key] || { n: 0, ratio: +cr.toFixed(2), need, sample: t.slice(0, 30) }).n++;
    }
  }
  return res;
}
