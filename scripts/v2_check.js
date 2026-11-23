/* v2_check.js — функциональная проверка слоя db.js в браузере:
   persist, CRUD (лид/документ/онбординг), DnD-перемещение, выживание после
   reload, скриптованный ответ. Не зависит от визуала. */
const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");
const URL = pathToFileURL(path.resolve(__dirname, "..", "download", "index.html")).href;

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await require("./lib/offline_fonts").stubFonts(ctx);
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e));

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && window.AIWS.db && document.querySelector("#app .sidebar"), null, { timeout: 8000 });

  const results = {};

  // 1. db + scriptedReply присутствуют
  results.hasDb = await page.evaluate(() => !!window.AIWS.db);
  results.hasScripted = await page.evaluate(() => typeof window.AIWS.scriptedReply === "function");
  results.scriptedTariff = await page.evaluate(() => window.AIWS.scriptedReply("sales", "подскажите тариф"));
  results.scriptedDefault = await page.evaluate(() => window.AIWS.scriptedReply("sales", "расскажи о марсианах"));

  // 2. createLead — появляется в D.LEADS и в localStorage
  const created = await page.evaluate(() => {
    var before = window.AIWS.data.LEADS.length;
    var lead = window.AIWS.db.createLead({ name: "Тест-лид v2", channel: "telegram", funnelId: "fn-sales", agentId: "ag-sales", note: "автотест" });
    var after = window.AIWS.data.LEADS.length;
    var raw = localStorage.getItem("aiws-db-v2");
    return { before: before, after: after, id: lead.id, persisted: raw ? raw.indexOf("Тест-лид v2") >= 0 : false };
  });
  results.createLead = created;

  // 3. moveLeadStage — стадия меняется и событие добавляется
  results.moveStage = await page.evaluate(() => {
    var l = window.AIWS.data.LEADS.filter(function (x) { return x.name === "Тест-лид v2"; })[0];
    var id = l.id;
    var evBefore = l.events.length;
    window.AIWS.db.moveLeadStage(id, "work");
    var l2 = window.AIWS.data.LEADS.filter(function (x) { return x.id === id; })[0];
    return { stage: l2.stageId, evDelta: l2.events.length - evBefore };
  });

  // 4. toggleOnboarding — переворачивает done и персистит
  results.onboarding = await page.evaluate(() => {
    var s = window.AIWS.data.ONBOARDING.filter(function (x) { return x.id === "kb-test"; })[0];
    var before = s.done;
    window.AIWS.db.toggleOnboarding("kb-test");
    var s2 = window.AIWS.data.ONBOARDING.filter(function (x) { return x.id === "kb-test"; })[0];
    return { before: before, after: s2.done };
  });

  // 5. createDocument — появляется
  results.createDoc = await page.evaluate(() => {
    var before = window.AIWS.data.DOCUMENTS.length;
    var d = window.AIWS.db.createDocument({ type: "invoice", client: "Тест-лид v2", approver: "Менеджер продаж" });
    return { before: before, after: window.AIWS.data.DOCUMENTS.length, id: d.id, status: d.status };
  });

  // 6. deleteLead — удаляется
  results.deleteLead = await page.evaluate(() => {
    var l = window.AIWS.data.LEADS.filter(function (x) { return x.name === "Тест-лид v2"; })[0];
    var id = l.id;
    var before = window.AIWS.data.LEADS.length;
    window.AIWS.db.deleteLead(id);
    return { before: before, after: window.AIWS.data.LEADS.length, gone: !window.AIWS.data.LEADS.some(function (x) { return x.id === id; }) };
  });

  // 6b. TASKS — toggle + add + delete + persist
  results.tasks = await page.evaluate(() => {
    var t = window.AIWS.data.TASKS[0];
    var id = t.id;
    var beforeDone = t.done;
    window.AIWS.db.toggleTask(id);
    var t2 = window.AIWS.data.TASKS.filter(function (x) { return x.id === id; })[0];
    var toggled = t2.done !== beforeDone;
    var persisted = (localStorage.getItem("aiws-db-v2") || "").indexOf("TASKS") >= 0;
    var b = window.AIWS.data.TASKS.length;
    var nt = window.AIWS.db.addTask({ title: "Автотест-задача", priority: "high", due: "2026-12-01", assignee: "Менеджер", tag: "CRM" });
    var added = window.AIWS.data.TASKS.length === b + 1 && !!nt.id;
    var bd = window.AIWS.data.TASKS.length;
    window.AIWS.db.deleteTask(nt.id);
    var deleted = window.AIWS.data.TASKS.length === bd - 1;
    return { toggled: toggled, persisted: persisted, added: added, deleted: deleted };
  });

  // 6c. NOTIFICATIONS — markRead
  results.notifs = await page.evaluate(() => {
    var n = window.AIWS.data.NOTIFICATIONS.filter(function (x) { return !x.read; })[0];
    if (!n) return { marked: true };
    window.AIWS.db.markNotifRead(n.id);
    var n2 = window.AIWS.data.NOTIFICATIONS.filter(function (x) { return x.id === n.id; })[0];
    return { marked: n2.read === true };
  });

  // 6d. updateTask — меняет приоритет и персистит
  results.updateTask = await page.evaluate(() => {
    var t = window.AIWS.data.TASKS.filter(function (x) { return x.priority !== "low"; })[0];
    if (!t) return { changed: true, persisted: true };
    var id = t.id;
    window.AIWS.db.updateTask(id, { priority: "low" });
    var t2 = window.AIWS.data.TASKS.filter(function (x) { return x.id === id; })[0];
    var raw = localStorage.getItem("aiws-db-v2");
    var parsed = raw ? JSON.parse(raw) : null;
    var pt = parsed && parsed.TASKS ? parsed.TASKS.filter(function (x) { return x.id === id; })[0] : null;
    return { changed: t2.priority === "low", persisted: !!(pt && pt.priority === "low") };
  });

  // 6e. вид Доска — канбан по приоритетам с draggable-карточками
  await page.evaluate(() => { window.AIWS.navigate("tasks"); window.AIWS.setState({ taskView: "board" }); });
  await page.waitForTimeout(150);
  results.board = await page.evaluate(() => ({
    cols: document.querySelectorAll(".kanban-col[data-priority]").length,
    cards: document.querySelectorAll(".kanban-card[data-task]").length,
    draggable: !!document.querySelector(".kanban-card[data-task][draggable='true']"),
    seg: !!document.querySelector("[data-taskview='board'].active")
  }));

  // 7. Survive reload — создадим лид, перезагрузим, проверим наличие
  await page.evaluate(() => window.AIWS.db.createLead({ name: "Персист-лид", funnelId: "fn-sales" }));
  const persistId = await page.evaluate(() => {
    var l = window.AIWS.data.LEADS.filter(function (x) { return x.name === "Персист-лид"; })[0];
    return l ? l.id : null;
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.AIWS && window.AIWS.db, null, { timeout: 8000 });
  results.surviveReload = await page.evaluate((id) => {
    return window.AIWS.data.LEADS.some(function (x) { return x.id === id && x.name === "Персист-лид"; });
  }, persistId);

  // 8. UI: модалка создания лида открывается
  await page.evaluate(() => window.AIWS.navigate("crm"));
  await page.waitForTimeout(150);
  await page.click("#newLeadBtn");
  await page.waitForTimeout(100);
  results.modalOpens = await page.evaluate(() => !!document.querySelector("#aiwsModal #leadSave"));

  await browser.close();

  // assertions
  const pass = [];
  const fail = [];
  function check(name, cond) { (cond ? pass : fail).push(name); }
  check("db exposed", results.hasDb);
  check("scriptedReply exposed", results.hasScripted);
  check("scriptedReply tariff branch", /тариф/.test(results.scriptedTariff));
  check("scriptedReply default branch mentions демо-сценарий", /демо-сценарий/.test(results.scriptedDefault));
  check("createLead adds + persists", results.createLead.after === results.createLead.before + 1 && results.createLead.persisted);
  check("moveLeadStage changes stage + adds event", results.moveStage.stage === "work" && results.moveStage.evDelta === 1);
  check("toggleOnboarding flips done", results.onboarding.before !== results.onboarding.after);
  check("createDocument adds + pending", results.createDoc.after === results.createDoc.before + 1 && results.createDoc.status === "pending");
  check("deleteLead removes", results.deleteLead.after === results.deleteLead.before - 1 && results.deleteLead.gone);
  check("toggleTask flips done + TASKS persisted", results.tasks.toggled && results.tasks.persisted);
  check("addTask adds", results.tasks.added);
  check("deleteTask removes", results.tasks.deleted);
  check("markNotifRead sets read", results.notifs.marked);
  check("updateTask changes priority + persists", results.updateTask.changed && results.updateTask.persisted);
  check("board view: 3 columns + draggable cards", results.board.cols === 3 && results.board.cards > 0 && results.board.draggable && results.board.seg);
  check("data survives reload", results.surviveReload);
  check("lead modal opens", results.modalOpens);
  check("no console errors/pageerrors", logs.filter((l) => l.startsWith("error") || l.startsWith("pageerror")).length === 0);

  console.log("=== V2 CHECK ===");
  console.log("PASS (" + pass.length + "): " + pass.join("; "));
  console.log("FAIL (" + fail.length + "): " + (fail.length ? fail.join("; ") : "(none)"));
  console.log("=== DETAILS ===");
  console.log(JSON.stringify(results, null, 2));
  if (logs.length) console.log("LOGS:", JSON.stringify(logs, null, 2));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("V2 CHECK FAILED:", e); process.exit(1); });
