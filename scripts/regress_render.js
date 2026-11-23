/* regress_render.js — пункты 7–10 и целевой рендер (jsdom): режим диалога, палитра ⌘K, KPI, иконка корзины,
   сохранение скролла/фокуса/ввода при перерисовке. Запуск: node scripts/regress_render.js */
const { load } = require("./jsdom_harness");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);
const KEY = "aiws-db-v2";
const chip = (d) => (d.querySelector(".chat-thread-head .chip") || {}).textContent;
const type = (w, input, v) => { input.value = v; input.dispatchEvent(new w.Event("input", { bubbles: true })); };

(async () => {
  let w = load().window, d = w.document; await wait(30); let A = w.AIWS;

  // ---------- 7. режим диалога
  A.navigate("dialogs"); await wait(15);
  check("7: cv-1 (ai) -> 'ИИ отвечает', ввод заблокирован", /ИИ отвечает/.test(chip(d)) && d.getElementById("msgInput").disabled);
  d.querySelector('[data-conv="cv-2"]').click(); await wait(10);
  check("7: cv-2 (human) -> 'Менеджер отвечает', ввод доступен", /Менеджер отвечает/.test(chip(d)) && !d.getElementById("msgInput").disabled);
  d.querySelector('[data-conv="cv-3"]').click(); await wait(10);
  check("7: cv-3 (reading) -> 'ИИ в режиме чтения'", /режиме чтения/.test(chip(d)));
  d.querySelector('[data-conv="cv-1"]').click(); await wait(10);
  d.getElementById("takeOver").click(); await wait(10);
  check("7: 'Передать менеджеру' меняет и сохраняет режим разговора", A.data.CONVERSATIONS[0].mode === "human" && JSON.parse(w.localStorage.getItem(KEY)).CONVERSATIONS[0].mode === "human");
  d.querySelector('[data-conv="cv-2"]').click(); await wait(10); d.querySelector('[data-conv="cv-1"]').click(); await wait(10);
  check("7: режим не сбрасывается при переключении диалогов", /Менеджер отвечает/.test(chip(d)));
  const inp = d.getElementById("msgInput"); inp.focus(); inp.value = "Здравствуйте"; d.getElementById("msgSend").click(); await wait(10);
  const m = A.data.CONVERSATIONS[0]; const last = m.messages[m.messages.length - 1];
  check("7: ответ менеджера -> режим 'reading'", m.mode === "reading" && /режиме чтения/.test(chip(d)));
  check("7: время сообщения HH:MM, не 'сейчас'", /^\d\d:\d\d$/.test(last.time) && m.lastTime === last.time);
  check("7: фокус остаётся в поле ввода после отправки", d.activeElement && d.activeElement.id === "msgInput");
  check("7: статус в контексте 'С менеджером'", /С менеджером/.test(d.querySelector(".chat-context").textContent));
  d.getElementById("giveBack").click(); await wait(10);
  check("7: 'Вернуть ИИ' -> ai", A.data.CONVERSATIONS[0].mode === "ai" && !!d.getElementById("takeOver"));
  A.db.setConvMode("cv-1", "human"); await wait(5);
  const w2 = load({ storage: { [KEY]: w.localStorage.getItem(KEY) } }).window; await wait(30); w2.AIWS.navigate("dialogs"); await wait(15);
  check("7: режим переживает перезагрузку", /Менеджер отвечает/.test(chip(w2.document)));
  // автоскролл вниз у нового диалога / новых сообщений
  const tm = d.getElementById("threadMsgs"); check("7: чат помечен data-autoscroll", tm.hasAttribute("data-autoscroll"));

  // ---------- 8. палитра
  w = load().window; d = w.document; await wait(30); A = w.AIWS;
  let themeWrites = 0; const sp = w.Storage.prototype.setItem; w.Storage.prototype.setItem = function (k, v) { if (k === "aiws-theme") themeWrites++; return sp.call(this, k, v); };
  A.setState({ paletteOpen: true, paletteQuery: "", paletteIndex: 0 }); await wait(5);
  const input = d.getElementById("paletteInput");
  type(w, input, "т"); type(w, input, "тем");
  check("8: поле ввода не пересоздаётся при наборе", d.getElementById("paletteInput") === input && d.activeElement === input);
  input.value = "тест"; input.setSelectionRange(1, 1); input.dispatchEvent(new w.Event("input")); 
  check("8: каретка не прыгает в конец", input.selectionStart === 1 && input.value === "тест");
  type(w, input, "");
  type(w, input, "т");
  const was = d.documentElement.classList.contains("dark");
  [...d.querySelectorAll("#paletteRoot .palette-item")].find((x) => /Переключить тему/.test(x.textContent)).dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await wait(10);
  check("8: клик по 'Переключить тему' срабатывает ровно один раз", themeWrites === 1 && d.documentElement.classList.contains("dark") !== was);
  check("8: палитра закрылась", !d.getElementById("paletteRoot"));
  A.setState({ paletteOpen: true, paletteQuery: "", paletteIndex: 0 }); await wait(5);
  const i2 = d.getElementById("paletteInput"); type(w, i2, "Демо-клиент А");
  check("8: поиск находит лидов", [...d.querySelectorAll("#paletteRoot .palette-item")].some((x) => /LD-1042/.test(x.textContent)));
  i2.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(15);
  check("8: Enter по лиду открывает CRM с этим лидом", A.store.route === "crm" && A.store.selectedLead === "LD-1042" && !d.getElementById("paletteRoot"));
  A.setState({ paletteOpen: true, paletteQuery: "", paletteIndex: 0 }); await wait(5);
  type(w, d.getElementById("paletteInput"), "Поддержка");
  check("8: поиск находит сотрудников", [...d.querySelectorAll("#paletteRoot .palette-item")].some((x) => /Сотрудник/.test(x.textContent)));
  d.getElementById("paletteInput").dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  check("8: ArrowDown двигает выбор и не ломает список", d.querySelectorAll("#paletteRoot .palette-item").length > 0);
  A.setState({ paletteOpen: false });

  // ---------- 9. KPI
  A.navigate("overview"); await wait(15);
  const cards = [...d.querySelectorAll("#view .grid-4 .card")].map((c) => c.textContent.replace(/\s+/g, " "));
  check("9: 'Передано менеджеру' показывает число, не '—'", /Передано менеджеру.*\d/.test(cards[3]) && !/—/.test(cards[3]) && !/Нет данных за период/.test(cards[3]));
  check("9: эскалация подсвечена (иконка alert + текст КРИТИЧНО)", /Есть эскалация \(КРИТИЧНО\)/.test(cards[3]));
  check("9: подсказка лидов динамическая", /В базе сейчас: 6/.test(cards[0]));
  A.db.createLead({ name: "Новый" }); await wait(10);
  check("9: после создания лида подсказка = 7", /В базе сейчас: 7/.test(d.querySelector("#view .grid-4 .card").textContent));

  // ---------- 10. иконка
  A.navigate("crm"); await wait(15);
  const svg = d.getElementById("delLeadBtn").querySelector("svg").outerHTML;
  check("10: 'Удалить' рисуется корзиной, не кружком", /M3 6h18/.test(svg) && !/<circle/.test(svg));
  A.navigate("docs"); await wait(15);
  check("10: удаление документа — корзина", /M3 6h18/.test(d.querySelector("[data-docdel] svg").outerHTML));

  // ---------- рендер: скролл, фокус, ввод, узлы
  A.navigate("tasks"); await wait(15);
  const content = d.getElementById("content"); const nav0 = d.querySelector("#sidebar .nav-item"); const side0 = d.getElementById("sidebar"); const top0 = d.getElementById("topbar");
  content.scrollTop = 250;
  const btn = d.querySelector('[data-tasktoggle="TK-1"]'); btn.focus();
  A.db.toggleTask("TK-1"); await wait(10);
  check("рендер: #content не заменяется, скролл сохранён", d.getElementById("content") === content && content.scrollTop === 250);
  check("рендер: сайдбар не перестраивается (узлы те же)", d.getElementById("sidebar") === side0 && d.querySelector("#sidebar .nav-item") === nav0);
  check("рендер: фокус возвращается на ту же кнопку", d.activeElement && d.activeElement.getAttribute("data-tasktoggle") === "TK-1");
  const headNode = d.querySelector("#view .page-head"); A.setState({ notifOpen: true }); await wait(5);
  check("рендер: открытие уведомлений не трогает вид", d.querySelector("#view .page-head") === headNode && !!d.querySelector(".notif-panel"));
  A.setState({ notifOpen: false }); A.navigate("calendar"); await wait(15);
  check("рендер: смена раздела сбрасывает скролл вверх", content.scrollTop === 0);

  // ввод в поле при перерисовке
  A.navigate("dialogs"); await wait(15); A.setState({ selectedConv: "cv-2" }); await wait(10);
  const mi = d.getElementById("msgInput"); mi.focus(); mi.value = "черновик"; mi.setSelectionRange(3, 3);
  A.db.markNotifRead("NT-1"); await wait(10);
  const mi2 = d.getElementById("msgInput");
  check("рендер: введённый текст и каретка сохраняются", mi2.value === "черновик" && d.activeElement === mi2 && mi2.selectionStart === 3);
  A.setState({ selectedConv: "cv-3" }); await wait(10);
  check("рендер: при смене диалога черновик не переносится", d.getElementById("msgInput").value === "");

  // демо-чат: переживает перерисовку, ответ не теряется
  A.navigate("agents"); await wait(15); d.querySelector("[data-agent='ag-sales']").click(); await wait(10);
  d.querySelector('[data-tab="test"]').click(); await wait(10);
  d.getElementById("testInput").value = "тариф"; d.getElementById("testSend").click();
  A.db.markNotifRead("NT-2"); await wait(10);
  check("рендер: переписка тест-чата сохраняется при перерисовке", /тариф/.test(d.getElementById("testChat").textContent) && /печатает/.test(d.getElementById("testChat").textContent));
  await wait(1000);
  check("рендер: ответ ИИ доходит в новый DOM", /каталог тарифов/.test(d.getElementById("testChat").textContent) && !/печатает/.test(d.getElementById("testChat").textContent));

  check("нет ошибок в консоли", w.__errors.length === 0);
  console.log("PASS (" + pass.length + ")"); console.log("FAIL (" + fail.length + "): " + (fail.length ? "\n - " + fail.join("\n - ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
