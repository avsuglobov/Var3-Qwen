/* regress_docs.js — регрессии пунктов 2–4 (документы): формат сумм, отсутствие выдуманных цен, номер документа.
   Запуск: node scripts/regress_docs.js (jsdom; PDF-текст перехватывается через jsPDF.API.text) */
const fs = require("fs"), path = require("path");
const { load, DL } = require("./jsdom_harness");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);
(async () => {
  const w = load().window; const d = w.document; await wait(30); const P = w.AIWS.pdf;
  // 2. money
  const m = P._money;
  check("2: money(12000)='12 000 ₽'", m(12000) === "12 000 ₽");
  check("2: 999 / 1000 / 9000 / 1234567", m(999) === "999 ₽" && m(1000) === "1 000 ₽" && m(9000) === "9 000 ₽" && m(1234567) === "1 234 567 ₽");
  check("2: 0, дробные округляются, нет суммы -> '—'", m(0) === "0 ₽" && m(1499.6) === "1 500 ₽" && m(null) === "—" && m(undefined) === "—" && m(NaN) === "—");
  // 3. без выдуманных цен
  const src = fs.readFileSync(path.join(DL, "pdf.js"), "utf8");
  check("3: в pdf.js нет захардкоженных цен и тарифов", !/12000|3000|9000|19000|Старт|Бизнес|Лицензия ИИ/.test(src));
  w.AIWS.data.DOCUMENTS.forEach((doc) => {
    const it = P._itemsFor(doc);
    check("3: " + doc.id + " без суммы -> без цены и итог null", it.every((x) => x.price === null) && P._totalOf(it) === null);
  });
  const withAmount = { id: "DOC-1", type: "invoice", number: "Счёт №1", amount: 5000 };
  check("3: заданная amount используется как есть", P._totalOf(P._itemsFor(withAmount)) === 5000);
  check("3: items с ценами суммируются", P._totalOf(P._itemsFor({ type: "act", items: [{ name: "a", qty: 2, price: 100 }, { name: "b", qty: 1, price: 50 }] })) === 250);
  check("3: items с пропущенной ценой -> итог null (не угадываем)", P._totalOf(P._itemsFor({ type: "act", items: [{ name: "a", qty: 2, price: 100 }, { name: "b" }] })) === null);
  // 4. номер
  const N = P._docNum;
  check("4: 'Демо-счёт №204' -> '204'", N({ number: "Демо-счёт №204" }) === "204");
  check("4: 'Счёт №205' -> '205'; без № -> id", N({ number: "Счёт №205" }) === "205" && N({ number: "x", id: "DOC-7" }) === "DOC-7");
  // печать: содержимое iframe
  w.AIWS.navigate("docs"); await wait(10);
  w.AIWS.pdf.printDoc("DOC-204"); await wait(30);
  const fr = d.querySelector("iframe"); const txt = fr.contentWindow.document.body.textContent.replace(/\s+/g, " ");
  check("4: печать: 'СЧЁТ № 204 (демо)' без дубля №", /СЧЁТ № 204 \(демо\)/.test(txt) && !/№ счёт/.test(txt));
  check("3: печать: нет '₽ ' с выдуманными суммами, есть пометка", !/\d ?₽/.test(txt) && /суммы не заданы/.test(txt));
  // PDF: перехват текста jsPDF
  w.eval(fs.readFileSync(path.join(DL, "vendor/jspdf.umd.min.js"), "utf8")); w.eval(fs.readFileSync(path.join(DL, "pdf-font.js"), "utf8"));
  // deps уже выполнены через eval — «загрузку» script-тегов имитируем мгновенным onload
  const oa = d.head.appendChild.bind(d.head); d.head.appendChild = (el) => { if (el.tagName === "SCRIPT") { setTimeout(() => el.onload && el.onload(), 0); return el; } return oa(el); };
  const texts = []; const Orig = w.jspdf.jsPDF;
  w.jspdf.jsPDF = function () {
    const doc = new Orig(...arguments); const t = doc.text.bind(doc);
    doc.text = (x, ...r) => { texts.push(Array.isArray(x) ? x.join(" ") : String(x)); return t(x, ...r); };
    doc.save = () => doc; return doc;
  };
  w.AIWS.pdf.generate("DOC-204"); await wait(300);
  const all = texts.join(" | ");
  check("4: PDF: '№ 204 (демо)', нет '№ счёт'", texts.includes("№ 204 (демо)") && !/№ счёт/.test(all));
  check("3: PDF: нет ₽-сумм, итог '—'", !/\d ?₽/.test(all) && texts.includes("—") && /Суммы не заданы/.test(all));
  // с заданной суммой — корректный формат в PDF
  w.AIWS.data.DOCUMENTS[0].amount = 12000; texts.length = 0; w.AIWS.pdf.generate("DOC-204"); await wait(300);
  check("2: PDF с amount=12000 содержит '12 000 ₽'", texts.includes("12 000 ₽"));
  console.log("PASS (" + pass.length + "): " + pass.join("; ")); console.log("FAIL (" + fail.length + "): " + (fail.length ? fail.join("; ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
