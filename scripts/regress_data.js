/* regress_data.js — регрессионные проверки пунктов 1, 5, 6 (jsdom, без браузера).
   Запуск: node scripts/regress_data.js  (нужен devDependency jsdom) */
const { load } = require("./jsdom_harness");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = [];
const check = (n, c) => (c ? pass : fail).push(n);
const KEY = "aiws-db-v2";
function snapshot(mut) { const w = load().window; const s = JSON.parse(w.localStorage.getItem(KEY)); mut && mut(s); return JSON.stringify(s); }

(async () => {
  // --- 1. удаление лида
  let w = load().window; let d = w.document; await wait(30); const A = w.AIWS;
  A.navigate("crm"); await wait(10);
  A.setState({ crmFunnel: "fn-support" }); await wait(10);
  const shownId = d.getElementById("delLeadBtn").getAttribute("data-lead-id");
  check("1: кнопка удаления несёт id показанного лида (LD-1036)", shownId === "LD-1036");
  d.getElementById("delLeadBtn").click(); await wait(10);
  check("1: сначала подтверждение, лид ещё на месте", !!d.getElementById("delLeadOk") && A.data.LEADS.some((l) => l.id === "LD-1036"));
  d.getElementById("delLeadOk").click(); await wait(10);
  check("1: удалён именно показанный лид", !A.data.LEADS.some((l) => l.id === "LD-1036"));
  check("1: невидимый LD-1041 не тронут", A.data.LEADS.some((l) => l.id === "LD-1041"));
  d.getElementById("newLeadBtn").click(); await wait(10);
  d.querySelector("[name=name]").value = "Новый для теста"; d.getElementById("leadSave").click(); await wait(10);
  const created = A.data.LEADS.slice(-1)[0];
  check("1: после создания выбран новый лид", A.store.selectedLead === created.id);

  // --- 5. повреждённое хранилище
  w = load({ storage: { [KEY]: snapshot((s) => { s.LEADS = "oops"; s.TASKS[0].title = "Моя задача"; }) } }).window; await wait(30);
  check("5: приложение стартует при LEADS:'oops'", w.document.getElementById("view").children.length > 0 && w.__errors.length === 0);
  check("5: LEADS откатились к seed", Array.isArray(w.AIWS.data.LEADS) && w.AIWS.data.LEADS.length === 6);
  check("5: остальные коллекции сохранены", w.AIWS.data.TASKS[0].title === "Моя задача");
  w = load({ storage: { [KEY]: "{not json" } }).window; await wait(30);
  check("5: невалидный JSON в хранилище не ломает старт", w.document.getElementById("view").children.length > 0);
  w = load({ storage: { [KEY]: snapshot((s) => { s.TASKS.push({ id: "TK-99" }); s.TASKS.push(null); s.DOCUMENTS[0].status = "hacked"; }) } }).window; await wait(30);
  check("5: битые записи отбрасываются", w.AIWS.data.TASKS.length === 6 && w.AIWS.data.DOCUMENTS.length === 3);
  w = load().window; await wait(30);
  w.AIWS.db.createLead({ name: "Мой лид" }); await wait(10);
  const keep = w.localStorage.getItem(KEY);
  const w2 = load({ storage: { [KEY]: keep } }).window; await wait(30);
  check("5: валидные пользовательские данные переживают перезагрузку", w2.AIWS.data.LEADS.some((l) => l.name === "Мой лид"));
  check("5: seed целиком проходит валидацию", load({ storage: { [KEY]: snapshot() } }).window.AIWS.data.LEADS.length === 6);

  // --- 6. XSS
  const evil = snapshot((s) => { s.LEADS[0].id = 'x"><b id="pwn">PWN</b><i a="'; s.TASKS[0].id = '"><u id="pwn2">'; });
  w = load({ storage: { [KEY]: evil } }).window; await wait(30);
  w.AIWS.navigate("crm"); w.AIWS.setState({ crmView: "kanban" }); await wait(10);
  w.AIWS.navigate("tasks"); await wait(10);
  check("6: id с HTML отклонён валидатором (нет инъекции)", !w.document.getElementById("pwn") && !w.document.getElementById("pwn2"));
  // эшелон 2: даже если запись обошла валидацию, атрибуты экранированы
  w = load().window; await wait(30);
  w.AIWS.data.LEADS[0].id = 'x"><b id="pwn">PWN</b><i a="'; w.AIWS.data.TASKS[0].id = '"><u id="pwn2">'; w.AIWS.data.DOCUMENTS[0].id = '"><u id="pwn3">';
  for (const [r, v] of [["crm", "kanban"], ["crm", "journal"], ["tasks"], ["docs"]]) { w.AIWS.setState({ crmView: v || "journal" }); w.AIWS.navigate(r); await wait(10); w.AIWS.setState({}); await wait(5); }
  check("6: экранирование атрибутов (id вне валидации)", !w.document.getElementById("pwn") && !w.document.getElementById("pwn2") && !w.document.getElementById("pwn3"));

  // --- импорт через UI-путь
  w = load().window; d = w.document; await wait(30);
  const bad = JSON.stringify({ version: 1, LEADS: "x", TASKS: [{ id: "TK-1", title: "ok", done: false, priority: "low" }, { id: '"><i>' }] });
  w.AIWS.db.importJSON(); const inp = d.querySelector('input[type=file]');
  Object.defineProperty(inp, "files", { value: [new w.File([bad], "x.json", { type: "application/json" })] });
  inp.dispatchEvent(new w.Event("change")); await wait(80);
  check("6/5: импорт принимает валидные записи, отбрасывает битые", w.AIWS.data.TASKS.length === 1 && Array.isArray(w.AIWS.data.LEADS) && w.AIWS.data.LEADS.length === 6);
  w.AIWS.db.importJSON(); const inp2 = d.querySelector('input[type=file]');
  Object.defineProperty(inp2, "files", { value: [new w.File([JSON.stringify({ version: 1, LEADS: "x" })], "y.json")] });
  const before = w.AIWS.data.TASKS.length; inp2.dispatchEvent(new w.Event("change")); await wait(80);
  check("5: полностью непригодный импорт отклонён, данные целы", w.AIWS.data.TASKS.length === before);

  console.log("PASS (" + pass.length + "): " + pass.join("; "));
  console.log("FAIL (" + fail.length + "): " + (fail.length ? fail.join("; ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
