/* regress_rest.js — прочие исправления ревью: журнал событий, навигация по агентам, недоступный localStorage,
   доступность (aria, модалки, клавиатура), одна главная кнопка на экране, цвета/статусы, единый конфиг названия,
   состояние ошибки раздела. Запуск: node scripts/regress_rest.js (jsdom) */
const fs = require("fs"), path = require("path");
const { load, DL } = require("./jsdom_harness");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);

(async () => {
  let w = load().window, d = w.document; await wait(30); let A = w.AIWS;

  // ---------- 11. журнал: новые события выше демо, актор, равные времена
  A.db.createLead({ name: "Журнал-тест", funnelId: "fn-sales" }); await wait(10);
  A.navigate("overview"); await wait(15);
  const rows = [...d.querySelectorAll(".journal-row")].map((r) => r.textContent.replace(/\s+/g, " "));
  check("11: только что созданное событие — первое в журнале обзора", /Лид создан вручную/.test(rows[0]));
  check("11: ручное создание лида записано как действие менеджера", /Менеджер/.test(rows[0]) && A.data.LEADS.slice(-1)[0].events[0].actor === "human");
  check("11: время событий в UTC (как часы в шапке)", A.data.LEADS.slice(-1)[0].events[0].t === new Date().toISOString().slice(11, 16));
  A.db.moveLeadStage("LD-1042", "work"); await wait(10);
  check("11: перенос карточки — новое событие сверху", /Перемещён/.test(d.querySelector(".journal-row").textContent));
  A.navigate("crm"); await wait(15); A.setState({ crmFunnel: "fn-sales", crmView: "journal" }); await wait(10);
  check("11: журнал CRM тоже сортирует новые события сверху", /Перемещён|Лид создан/.test(d.querySelector("#view .journal-row").textContent));
  const kpi = [...d.querySelectorAll(".card")].length; A.navigate("overview"); await wait(15);
  const hand = d.body.textContent.match(/Передано менеджеру\s*Демо\s*(\d+)/); const before = hand && +hand[1];
  A.db.moveLeadStage("LD-1041", "qual"); await wait(10);
  const after = d.body.textContent.match(/Передано менеджеру\s*Демо\s*(\d+)/);
  check("11: перенос карточки не считается «передачей менеджеру»", before != null && after && +after[1] === before);

  // ---------- 12. навигация по агентам
  A.navigate("agents"); await wait(15); d.querySelector("[data-agent='ag-sales']").click(); await wait(10);
  check("12: открыта страница агента", /Инструкция/.test(d.querySelector("#view").textContent) && !!d.getElementById("backToAgents"));
  d.querySelector('.nav-item[data-route="agents"]').click(); await wait(20);
  check("12: клик «ИИ-сотрудники» в сайдбаре возвращает к списку", !d.getElementById("backToAgents") && !!d.getElementById("newAgentBtn"));
  d.querySelector("[data-agent='ag-sales']").click(); await wait(10); A.navigate("crm"); await wait(20); A.navigate("agents"); await wait(20);
  check("12: возврат в раздел показывает список, а не прошлого агента", !d.getElementById("backToAgents") && !!d.getElementById("newAgentBtn"));
  A.setState({ agentDetail: "ag-nope" }); await wait(10);
  check("12: несуществующий агент — показывается список, не пустой экран", d.getElementById("view").children.length > 0 && !!d.getElementById("newAgentBtn"));

  // ---------- недоступный localStorage
  const dom2 = load({ breakStorage: true }); const w2 = dom2.window; await wait(40);
  check("storage: приложение стартует без доступа к localStorage", w2.document.getElementById("view") && w2.document.getElementById("view").children.length > 0 && w2.__errors.length === 0);
  w2.AIWS.navigate("tasks"); await wait(15); w2.AIWS.db.toggleTask("TK-1"); await wait(10);
  w2.document.getElementById("themeBtn").click(); await wait(5); w2.document.querySelector("[data-theme-val='dark']").click(); await wait(10);
  check("storage: действия (задача, тема) не падают", w2.__errors.length === 0 && w2.document.documentElement.classList.contains("dark"));

  // ---------- доступность
  w = load().window; d = w.document; await wait(30); A = w.AIWS;
  const cur = d.querySelector('.nav-item[aria-current="page"]');
  check("a11y: активный пункт меню имеет aria-current=page", !!cur && cur.getAttribute("data-route") === "overview" && d.querySelectorAll('.nav-item[aria-current]').length === 1);
  A.navigate("crm"); await wait(15);
  check("a11y: aria-current переезжает при смене раздела", d.querySelector('.nav-item[aria-current="page"]').getAttribute("data-route") === "crm");
  A.navigate("agents"); await wait(15); d.querySelector("[data-agent='ag-sales']").click(); await wait(10);
  const tabs = d.querySelector(".tabs"), tab0 = d.querySelector(".tab.active");
  check("a11y: вкладки — tablist/tab/aria-selected", tabs.getAttribute("role") === "tablist" && tab0.getAttribute("role") === "tab" && tab0.getAttribute("aria-selected") === "true" && d.querySelectorAll('.tab[aria-selected="false"]').length >= 1);
  A.navigate("dialogs"); await wait(15);
  const item = d.querySelector("[data-conv]"); const convBefore = A.store.selectedConv;
  const other = d.querySelectorAll("[data-conv]")[1];
  check("a11y: элементы списка диалогов фокусируемы и имеют role=button", item.getAttribute("tabindex") === "0" && item.getAttribute("role") === "button");
  other.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(10);
  check("a11y: Enter по элементу списка выбирает диалог", A.store.selectedConv === other.getAttribute("data-conv") && A.store.selectedConv !== convBefore);
  A.navigate("crm"); await wait(15); A.setState({ crmView: "kanban", crmFunnel: "fn-sales" }); await wait(10);
  const card = d.querySelector(".kanban-card");
  card.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(10);
  check("a11y: Enter по карточке канбана открывает лид (альтернатива перетаскиванию)", A.store.crmView === "journal" && A.store.selectedLead === card.getAttribute("data-lead"));
  const sel = d.getElementById("leadStageSel"); const lid = sel.getAttribute("data-lead-id");
  sel.value = "deal"; sel.dispatchEvent(new w.Event("change")); await wait(10);
  check("a11y: стадию можно сменить списком в инспекторе (клавиатура/тач)", A.data.LEADS.find((l) => l.id === lid).stageId === "deal");
  d.getElementById("newLeadBtn").focus(); d.getElementById("newLeadBtn").click(); await wait(15);   // в браузере клик фокусирует кнопку
  const modal = d.querySelector(".modal-card");
  check("a11y: при открытии модалки фокус внутри неё", modal && modal.contains(d.activeElement));
  const focusables = [...modal.querySelectorAll("button,input,select,textarea")].filter((n) => !n.disabled);
  focusables[focusables.length - 1].focus();
  const tabEv = new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); d.dispatchEvent(tabEv);
  check("a11y: Tab с последнего элемента переходит на первый (ловушка фокуса)", tabEv.defaultPrevented && d.activeElement === focusables[0]);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(10);
  check("a11y: Esc закрывает модалку и возвращает фокус", !d.querySelector(".modal-card") && d.activeElement && d.activeElement.id === "newLeadBtn");
  A.navigate("agents"); await wait(15); d.getElementById("newAgentBtn").focus(); d.getElementById("newAgentBtn").click(); await wait(10);
  check("a11y: мастер агента — aria-modal, фокус внутри", d.querySelector("#wizardRoot [aria-modal='true']") && d.getElementById("wizardRoot").contains(d.activeElement));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(10);
  check("a11y: Esc закрывает мастер, фокус возвращается", !d.getElementById("wizardRoot") && d.activeElement.id === "newAgentBtn");
  A.navigate("settings"); await wait(10);
  w.AIWS.toast("Проверка"); const toast = d.getElementById("aiwsToast");
  check("a11y: тост — role=status, aria-live=polite, не накапливается", toast.getAttribute("role") === "status" && toast.getAttribute("aria-live") === "polite" && (w.AIWS.toast("Второй"), d.querySelectorAll("#aiwsToast").length === 1));

  // ---------- мобильные диалоги: список доступен кнопкой «назад»
  A.navigate("dialogs"); await wait(15);
  const lay = () => d.querySelector(".chat-layout");
  check("мобильные диалоги: есть кнопка «К списку диалогов», список по умолчанию закрыт", !!d.getElementById("chatBack") && !lay().classList.contains("list-open"));
  d.getElementById("chatBack").click(); await wait(10);
  check("мобильные диалоги: «назад» открывает список (list-open)", lay().classList.contains("list-open"));
  d.querySelector('[data-conv="cv-2"]').click(); await wait(10);
  check("мобильные диалоги: выбор диалога закрывает список и открывает переписку", !lay().classList.contains("list-open") && A.store.selectedConv === "cv-2");

  // ---------- задачи: статус не только цветом, критичный цвет не в тексте
  A.data.TASKS[0].due = "2020-01-01"; A.data.TASKS[0].done = false; A.navigate("tasks"); await wait(15);
  const txt = d.getElementById("view").textContent;
  check("статус: просрочка помечена текстом «Просрочено», не только цветом", /Просрочено · 2020-01-01/.test(txt));
  const src3 = fs.readFileSync(path.join(DL, "sections3.js"), "utf8");
  check("цвет: нет color:var(--critical) в тексте (тёмная тема)", !/color:var\(--critical\)/.test(src3));
  check("цвет: «Высокий» приоритет — не critical", !/tag-critical"><span class="dot dot-critical"><\/span>Высокий/.test(src3) && /Высокий/.test(txt));

  // ---------- одна главная кнопка на экране
  const multi = [];
  const primaries = () => [...d.querySelectorAll("#view .btn-primary")].filter((b) => !b.closest(".modal-overlay"));
  for (const n of A.NAV) { A.setState({ agentDetail: null }); A.navigate(n.id); await wait(12); if (primaries().length > 1) multi.push(n.id + ":" + primaries().map((b) => b.textContent.trim()).join("|")); }
  for (const v of ["journal", "kanban", "table"]) { A.navigate("crm"); await wait(8); A.setState({ crmView: v }); await wait(8); if (primaries().length > 1) multi.push("crm/" + v + ":" + primaries().map((b) => b.textContent.trim()).join("|")); }
  for (const t of ["instruction", "knowledge", "channels", "funnel", "approvals", "test"]) { A.setState({ route: "agents", agentDetail: "ag-sales", agentTab: t }); await wait(10); if (primaries().length > 1) multi.push("agent/" + t + ":" + primaries().map((b) => b.textContent.trim()).join("|")); }
  for (const t of ["profile", "company", "roles", "channels", "notifications", "tariff"]) { A.navigate("settings"); await wait(8); A.setState({ settingsTab: t }); await wait(8); if (primaries().length > 1) multi.push("settings/" + t); }
  check("не более одной главной кнопки на экране" + (multi.length ? "\n     " + multi.join("\n     ") : ""), multi.length === 0);

  // ---------- единый конфиг названия
  const lits = []; for (const f of fs.readdirSync(DL).filter((x) => x.endsWith(".js") && !/^(pdf-font|config)\.js$/.test(x))) { if (/AI Workspace/.test(fs.readFileSync(path.join(DL, f), "utf8"))) lits.push(f); }
  check("конфиг: «AI Workspace» только в config.js" + (lits.length ? " (" + lits.join(", ") + ")" : ""), lits.length === 0);
  check("конфиг: title документа и PDF берут название из config", d.title.indexOf(A.config.APP_NAME) === 0);
  A.config; 

  // ---------- состояние ошибки раздела
  A.navigate("crm"); await wait(12); A.setState({ crmView: "journal", crmFunnel: "fn-sales" }); await wait(10);
  const bak = A.data.LEADS[0].channel; A.data.LEADS[0].channel = "zzz";
  const errs = []; const ce = w.console.error; w.console.error = (e) => errs.push(String(e));
  A.setState({}); await wait(10);
  check("ошибка: сбой отрисовки показывает состояние «Не удалось показать раздел» с кнопкой, а не пустой экран", !!d.querySelector("#view [role=alert]") && /Не удалось показать раздел/.test(d.getElementById("view").textContent) && !!d.getElementById("retryView") && !!d.getElementById("sidebar").children.length);
  A.data.LEADS[0].channel = bak; d.getElementById("retryView").click(); await wait(10); w.console.error = ce;
  check("ошибка: «Повторить» восстанавливает раздел", !d.querySelector("#view [role=alert]") && d.getElementById("view").children.length > 0);

  console.log("PASS (" + pass.length + ")"); console.log("FAIL (" + fail.length + "): " + (fail.length ? "\n - " + fail.join("\n - ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
