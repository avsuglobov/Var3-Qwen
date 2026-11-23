/* Запрет хардкод-цветов в компонентах и страницах: hex, rgb()/hsl(), палитра Tailwind (bg-white, text-gray-500 …).
   Цвета живут только в токенах (styles/globals.css, блоки :root и .dark). Код выхода 1, если нашлись нарушения. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIRS = ["app", "components", "lib"];
const PALETTE = "white|black|gray|grey|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, "hex-цвет"],
  [/\b(?:rgb|rgba|hsl|hsla|oklch)\(/, "функция цвета"],
  [new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|accent|caret|decoration)-(?:${PALETTE})(?:-\\d{2,3})?\\b`), "цвет палитры Tailwind"]
];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "fonts") out.push(...walk(p)); }
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const bad = [];
for (const d of DIRS) {
  for (const file of walk(path.join(ROOT, d))) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      for (const [re, what] of RULES) if (re.test(code)) bad.push(`${path.relative(ROOT, file)}:${i + 1}  ${what}: ${line.trim().slice(0, 100)}`);
    });
  }
}

// globals.css: hex только внутри блоков токенов :root и .dark
const css = fs.readFileSync(path.join(ROOT, "styles/globals.css"), "utf8");
let rest = css;
for (const sel of [":root", ".dark"]) {
  const s = rest.indexOf(`${sel} {`);
  let depth = 0, end = s;
  for (let i = rest.indexOf("{", s); i < rest.length; i++) { if (rest[i] === "{") depth++; else if (rest[i] === "}" && --depth === 0) { end = i; break; } }
  rest = rest.slice(0, s) + rest.slice(end + 1);
}
rest.split("\n").forEach((line, i) => { if (/#[0-9a-fA-F]{3,8}\b/.test(line)) bad.push(`styles/globals.css (вне токенов): ${line.trim().slice(0, 100)}`); });

if (bad.length) { console.error("Хардкод-цвета найдены:\n" + bad.map((b) => "  " + b).join("\n")); process.exit(1); }
console.log("check:colors — хардкод-цветов нет");
