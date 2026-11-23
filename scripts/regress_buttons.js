/* regress_buttons.js — аудит «мёртвых» кнопок: на каждом разделе (и вкладках/видах) каждая кнопка должна либо иметь
   обработчик click, либо быть честно помечена data-soon (метка «Скоро» + сообщение). Плюс проверки работающих действий.
   Запуск: node scripts/regress_buttons.js (jsdom) */
const { load } = require("./jsdom_harness");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);

(async () => {
  const w = load({ trackListeners: true }).window; const d = w.document; await wait(30); const A = w.AIWS;
  const dead = [];
  const hasClick = (el) => { let n = el; while (n && n !== d.body) { const s = w.__listeners.get(n); if (s && (s.has("click") || s.has("keydown"))) return true; n = n.parentElement; } return false; };
  const audit = async (label, fn) => {
    await fn(); await wait(15);
    d.querySelectorAll("#view button, #view [role=button], #view .btn, #view .chip, #view .tab, #view .icon-btn").forEach((b) => {
      if (b.hasAttribute("data-soon") || b.disabled) return;
      if (b.tagName !== "BUTTON" && b.getAttribute("role") !== "button" && !b.classList.contains("btn") && !b.classList.contains("tab") && !b.classList.contains("chip")) return;
      if (b.tagName === "SPAN" || b.tagName === "DIV" && !b.hasAttribute("role")) return;        // чипы-метки (не кнопки)
      if (!hasClick(b)) dead.push(label + ": «" + b.textContent.replace(/\s+/g, " ").trim().slice(0, 40) + "» " + (b.id ? "#" + b.id : b.className.split(" ")[0]));
    });
  };
  for (const n of A.NAV) await audit(n.id, () => A.navigate(n.id));
  for (const v of ["journal", "kanban", "table"]) await audit("crm/" + v, async () => { A.navigate("crm"); await wait(10); A.setState({ crmView: v }); });
  for (const t of ["instruction", "knowledge", "channels", "funnel", "approvals", "test"]) await audit("agent/" + t, async () => { A.setState({ route: "agents", agentDetail: "ag-sales", agentTab: t }); });
  for (const t of ["profile", "company", "roles", "channels", "notifications", "tariff"]) await audit("settings/" + t, async () => { A.navigate("settings"); await wait(10); A.setState({ settingsTab: t }); });
  if (process.env.AUDIT_ONLY) { console.log("DEAD (" + [...new Set(dead)].length + "):\n  " + [...new Set(dead)].join("\n  ")); process.exit(0); }
  check("аудит: нет кнопок без обработчика и без пометки «Скоро»" + (dead.length ? "\n     " + [...new Set(dead)].join("\n     ") : ""), dead.length === 0);

  // ---- пометка «Скоро» работает
  A.navigate("integrations"); await wait(15);
  const soon = d.querySelector("#view [data-soon]");
  check("«Скоро»: есть метка и title", !!soon.querySelector(".soon-tag") && /Недоступно в демо/.test(soon.getAttribute("title")));
  soon.click(); await wait(5);
  check("«Скоро»: клик показывает тост и не вызывает действия", /пока недоступно в демо-прототипе/.test(d.body.textContent));

  // ---- таблица CRM: фильтр и сортировка
  A.navigate("crm"); await wait(15); A.setState({ crmView: "table", crmFunnel: "fn-sales" }); await wait(10);
  const ids = () => [...d.querySelectorAll("#view tbody tr[data-lead]")].map((r) => r.getAttribute("data-lead"));
  const all = ids(); check("CRM-таблица: все лиды воронки видны", all.length === A.data.LEADS.filter((l) => l.funnelId === "fn-sales").length && all.length > 1);
  const stage = A.data.LEADS.find((l) => l.funnelId === "fn-sales").stageId;
  d.querySelector('[data-filter="' + stage + '"]').click(); await wait(10);
  check("CRM-таблица: фильтр по стадии", ids().length > 0 && ids().length < all.length && ids().every((id) => A.data.LEADS.find((l) => l.id === id).stageId === stage) && d.querySelector('[data-filter="' + stage + '"]').getAttribute("aria-pressed") === "true");
  const empty = A.data.STAGES.find((s) => !A.data.LEADS.some((l) => l.funnelId === "fn-sales" && l.stageId === s.id));
  if (empty) { d.querySelector('[data-filter="' + empty.id + '"]').click(); await wait(10); check("CRM-таблица: пустая стадия -> сообщение", /Нет лидов на выбранной стадии/.test(d.querySelector("#view tbody").textContent)); }
  d.querySelector('[data-filter="all"]').click(); await wait(10);
  d.getElementById("crmSortBtn").click(); await wait(10);
  const byName = [...d.querySelectorAll("#view tbody tr")].map((r) => r.children[1].textContent);
  check("CRM-таблица: сортировка по имени", /Имя/.test(d.getElementById("crmSortBtn").textContent) && JSON.stringify(byName) === JSON.stringify([...byName].sort((a, b) => a.localeCompare(b, "ru"))));
  d.getElementById("crmSortBtn").click(); await wait(10); d.getElementById("crmSortBtn").click(); await wait(10);
  check("CRM-таблица: сортировка циклически возвращается к ID", /ID/.test(d.getElementById("crmSortBtn").textContent));
  d.querySelector("#view tbody tr[data-lead]").click(); await wait(10);
  check("CRM-таблица: клик по строке открывает журнал с лидом", A.store.crmView === "journal");

  // ---- инспектор лида -> диалог / документ; диалог -> CRM
  A.setState({ crmView: "journal", crmFunnel: "fn-sales", selectedLead: "LD-1042" }); await wait(10);
  d.getElementById("leadOpenDialog").click(); await wait(20);
  const cv = A.data.CONVERSATIONS.find((c) => c.contactName === A.data.LEADS.find((l) => l.id === "LD-1042").name);
  check("Инспектор: «Открыть диалог» ведёт в диалог лида (или сообщает об отсутствии)", cv ? (A.store.route === "dialogs" && A.store.selectedConv === cv.id) : /нет диалога/.test(d.body.textContent));
  if (cv) {
    d.getElementById("ctxOpenCrm").click(); await wait(20);
    check("Диалог: «Открыть в CRM» ведёт к лиду", A.store.route === "crm" && A.store.selectedLead === "LD-1042");
  }
  A.setState({ crmView: "journal", selectedLead: "LD-1042" }); await wait(10);
  d.getElementById("leadMakeDoc").click(); await wait(80);
  check("Инспектор: «Документ» открывает форму с этим клиентом", A.store.route === "docs" && !!d.querySelector(".modal-card [name=client]") && d.querySelector(".modal-card [name=client]").value === A.data.LEADS.find((l) => l.id === "LD-1042").name);
  d.querySelector("[data-modal-close]").click(); await wait(10);

  // ---- агент: сохранить инструкцию, приостановить
  A.setState({ route: "agents", agentDetail: "ag-sales", agentTab: "instruction" }); await wait(15);
  d.getElementById("agentInstr").value = "Новая инструкция для теста"; d.getElementById("agentSave").click(); await wait(10);
  check("Агент: «Сохранить» меняет инструкцию", A.data.AGENTS.find((a) => a.id === "ag-sales").instruction === "Новая инструкция для теста" && /Новая инструкция для теста/.test(d.getElementById("view").textContent));
  d.getElementById("agentInstr").value = "   "; d.getElementById("agentSave").click(); await wait(10);
  check("Агент: пустая инструкция отклоняется", A.data.AGENTS.find((a) => a.id === "ag-sales").instruction === "Новая инструкция для теста");
  d.getElementById("agentPause").click(); await wait(10);
  check("Агент: «Приостановить» -> «Не в сети» и кнопка «Возобновить»", A.data.AGENTS.find((a) => a.id === "ag-sales").status === "offline" && /Возобновить/.test(d.getElementById("agentPause").textContent) && /Не в сети/.test(d.getElementById("view").textContent));
  d.getElementById("agentPause").click(); await wait(10);
  check("Агент: «Возобновить» возвращает в сеть", A.data.AGENTS.find((a) => a.id === "ag-sales").status === "online");

  // ---- мастер создания агента
  A.setState({ agentDetail: null }); A.navigate("agents"); await wait(15);
  const before = A.data.AGENTS.length;
  d.getElementById("newAgentBtn").click(); await wait(10);
  d.getElementById("wizSave").click(); await wait(10);
  check("Мастер: пустое название не создаёт агента", A.data.AGENTS.length === before && !!d.getElementById("wizardRoot"));
  d.getElementById("wizName").value = "Тест Продажи"; d.querySelector('[data-role="support"]').click();
  d.querySelector('[data-ch="telegram"]').click(); d.querySelector('[data-ch="email"]').click();
  d.getElementById("wizInstr").value = "Отвечать вежливо"; d.getElementById("wizSave").click(); await wait(15);
  const ag = A.data.AGENTS[A.data.AGENTS.length - 1];
  check("Мастер: агент создан с ролью, каналами и инструкцией", A.data.AGENTS.length === before + 1 && ag.name === "Тест Продажи" && ag.role === "support" && ag.instruction === "Отвечать вежливо" && ag.channels.includes("email") && !ag.channels.includes("telegram") && ag.monogram === "ТП");
  check("Мастер: агент виден в списке, окно закрыто", /Тест Продажи/.test(d.getElementById("view").textContent) && !d.getElementById("wizardRoot"));
  d.querySelector("[data-agent='" + ag.id + "']").click(); await wait(15);
  for (const t of ["instruction", "knowledge", "channels", "funnel", "approvals", "test"]) { A.setState({ agentTab: t }); await wait(8); }
  check("Мастер: страница нового агента (все вкладки) открывается без ошибок", w.__errors.length === 0 && d.getElementById("view").children.length > 0);

  // ---- переключатели сохраняют состояние при перерисовке
  A.navigate("settings"); await wait(15); A.setState({ settingsTab: "notifications" }); await wait(10);
  const sw = d.querySelector(".switch[data-sw]"); const was = sw.classList.contains("on"); sw.click(); await wait(5);
  A.setState({}); await wait(10);
  check("Переключатель: состояние переживает перерисовку", d.querySelector(".switch[data-sw]").classList.contains("on") === !was && d.querySelector(".switch[data-sw]").getAttribute("aria-checked") === String(!was));

  // ---- шаблон CSV
  A.navigate("leads"); await wait(15); w.__lastBlob = null;
  d.getElementById("leadsTemplate").click(); await wait(10);
  const buf = await new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(Buffer.from(fr.result)); fr.readAsArrayBuffer(w.__lastBlob); });
  const txt = buf.toString("utf8");
  check("Шаблон CSV: BOM (EF BB BF), заголовки, CRLF", buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF && /Имя;Телефон;Email;Последний контакт\r\n$/.test(txt));

  // ---- сертификат PDF (перехват jsPDF)
  const fs = require("fs"), path = require("path"); const DL = path.join(__dirname, "..", "download");
  w.eval(fs.readFileSync(path.join(DL, "vendor/jspdf.umd.min.js"), "utf8")); w.eval(fs.readFileSync(path.join(DL, "pdf-font.js"), "utf8"));
  const oa = d.head.appendChild.bind(d.head); d.head.appendChild = (el) => { if (el.tagName === "SCRIPT") { setTimeout(() => el.onload && el.onload(), 0); return el; } return oa(el); };
  const texts = []; let saved = null; const Orig = w.jspdf.jsPDF;
  w.jspdf.jsPDF = function () { const doc = new Orig(...arguments); const t = doc.text.bind(doc); doc.text = (x, ...r) => { texts.push(Array.isArray(x) ? x.join(" ") : String(x)); return t(x, ...r); }; doc.save = (n) => { saved = n; return doc; }; return doc; };
  A.navigate("training"); await wait(15);
  d.querySelector("[data-cert]").click(); await wait(300);
  check("Сертификат: курс «Работа с возражениями» -> именной PDF", saved && /сертификат-.*\.pdf$/.test(saved) && texts.includes("СЕРТИФИКАТ") && texts.some((x) => /А\. Иванов/.test(x)) && texts.some((x) => /Работа с возражениями/.test(x)));
  saved = null; texts.length = 0; d.querySelector("[data-certid]").click(); await wait(300);
  check("Сертификат: кнопка «PDF» в выданных сертификатах", saved && texts.some((x) => /А\. Иванов/.test(x)) && texts.some((x) => /не имеет юридической силы/.test(x)));

  check("нет ошибок в консоли", w.__errors.length === 0);
  console.log("PASS (" + pass.length + ")"); console.log("FAIL (" + fail.length + "): " + (fail.length ? "\n - " + fail.join("\n - ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
