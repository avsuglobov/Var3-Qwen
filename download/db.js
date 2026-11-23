/* =========================================================================
   db.js — v2: персистентный слой данных + CRUD + модалки + скриптованные ответы.
   Грузится после data.js (нужен D) и до app.js (мутаторы зовут AIWS.setState
   лениво — на момент клика app.js уже загружен). Гидратация D.* из localStorage
   выполняется синхронно при загрузке, до первого рендера.
   Честно: скриптованные ответы — это демо-сценарий по ключевым словам, не LLM.
   ========================================================================= */
(function (global) {
  "use strict";

  var AIWS = global.AIWS || (global.AIWS = {});
  var D = AIWS.data; // фикстуры из data.js

  var KEY = "aiws-db-v2";
  var VERSION = 1;
  // Коллекции, которые делаем изменяемыми и персистентными.
  var COLLS = ["LEADS", "CONVERSATIONS", "DOCUMENTS", "ONBOARDING", "TASKS", "CALENDAR_EVENTS", "NOTIFICATIONS", "AGENTS", "COURSES", "CERTIFICATES"];

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

  /* Захватываем оригинальные фикстуры как seed ДО того, как заменим D.*
     сохранёнными значениями — нужен для «Сбросить к демо». */
  var SEED = {};
  COLLS.forEach(function (k) { SEED[k] = clone(D[k]); });


  /* ----------------------------------------------------------- Validation (storage / import)
     Данные из localStorage и импортированного JSON — недоверенный ввод: проверяем тип коллекции,
     форму записей и безопасный формат id (id попадает в data-атрибуты). Битые записи отбрасываются,
     при невалидной коллекции берётся seed. */
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function str(x, max) { return typeof x === "string" && x.length <= (max || 2000); }
  function optStr(x) { return x == null || str(x); }
  function okId(x) { return typeof x === "string" && ID_RE.test(x); }
  var CHECK = {
    LEADS: function (l) {
      return isObj(l) && okId(l.id) && str(l.name, 300) && D.CHANNELS[l.channel] && okId(l.stageId) && okId(l.funnelId) && okId(l.agentId) &&
        optStr(l.lastActivity) && optStr(l.note) && Array.isArray(l.events) &&
        l.events.every(function (e) { return isObj(e) && str(e.t, 40) && (e.actor === "ai" || e.actor === "human") && str(e.text); });
    },
    CONVERSATIONS: function (c) {
      return isObj(c) && okId(c.id) && str(c.contactName, 300) && D.CHANNELS[c.channel] && okId(c.agentId) &&
        (c.mode === "ai" || c.mode === "human" || c.mode === "reading") && optStr(c.lastPreview) && optStr(c.lastTime) &&
        Array.isArray(c.messages) && c.messages.every(function (m) { return isObj(m) && (m.from === "ai" || m.from === "human" || m.from === "client") && str(m.text, 10000) && optStr(m.time); }) &&
        isObj(c.context) && str(c.context.who) && str(c.context.channel) && str(c.context.history) && str(c.context.nextStep) &&
        typeof c.context.files === "number" && isFinite(c.context.files);
    },
    DOCUMENTS: function (d) {
      return isObj(d) && okId(d.id) && (d.type === "invoice" || d.type === "offer" || d.type === "act") && str(d.number, 300) && str(d.client, 300) &&
        (d.status === "pending" || d.status === "approved" || d.status === "rejected") && str(d.approver, 300) && optStr(d.created) &&
        (d.amount == null || typeof d.amount === "number");
    },
    ONBOARDING: function (s) { return isObj(s) && okId(s.id) && str(s.name, 300) && typeof s.done === "boolean"; },
    TASKS: function (t) {
      return isObj(t) && okId(t.id) && str(t.title, 1000) && typeof t.done === "boolean" && (t.priority === "high" || t.priority === "med" || t.priority === "low") &&
        optStr(t.due) && optStr(t.assignee) && optStr(t.tag);
    },
    CALENDAR_EVENTS: function (e) {
      return isObj(e) && okId(e.id) && str(e.title, 1000) && optStr(e.date) && optStr(e.time) && optStr(e.duration) && optStr(e.type) && optStr(e.assignee);
    },
    AGENTS: function (a) {
      return isObj(a) && okId(a.id) && str(a.name, 120) && ["sales", "support", "supply", "hr", "rop"].indexOf(a.role) >= 0 &&
        ["online", "idle", "offline", "error"].indexOf(a.status) >= 0 && str(a.monogram, 6) && str(a.summary) && str(a.instruction, 5000) &&
        (a.funnelId === null || okId(a.funnelId)) &&
        Array.isArray(a.channels) && a.channels.every(function (c) { return typeof c === "string" && !!D.CHANNELS[c]; }) &&
        Array.isArray(a.knowledge) && a.knowledge.every(function (k) { return str(k, 300); }) &&
        Array.isArray(a.funnel) && a.funnel.every(function (k) { return str(k, 300); }) &&
        Array.isArray(a.approvals) && a.approvals.every(function (p) { return isObj(p) && str(p.action, 300) && (p.mode === "auto" || p.mode === "approve") && str(p.note, 500); });
    },
    COURSES: function (c) {
      return isObj(c) && okId(c.id) && str(c.title, 300) && typeof c.lessons === "number" && c.lessons >= 0 && c.lessons <= 200 &&
        typeof c.progress === "number" && c.progress >= 0 && c.progress <= 1 && str(c.status, 60);
    },
    CERTIFICATES: function (c) {
      return isObj(c) && okId(c.id) && str(c.name, 120) && str(c.course, 300) && str(c.date, 60) && (c.score == null || (typeof c.score === "number" && c.score >= 0 && c.score <= 1));
    },
    NOTIFICATIONS: function (n) { return isObj(n) && okId(n.id) && str(n.text, 2000) && optStr(n.time) && optStr(n.type) && typeof n.read === "boolean"; }
  };
  // Возвращает очищенный массив или null, если коллекция непригодна (не массив / ни одной валидной записи при непустом вводе).
  function validateColl(k, arr) {
    if (!Array.isArray(arr)) return null;
    var good = arr.filter(CHECK[k]);
    var seen = {};
    good = good.filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; });
    if (arr.length && !good.length) return null;
    return good;
  }
  function pickValid(obj) {
    var res = {}, dropped = 0;
    COLLS.forEach(function (k) {
      if (obj[k] === undefined) return;
      var v = validateColl(k, obj[k]);
      if (v === null) { dropped++; return; }
      if (v.length !== obj[k].length) dropped += obj[k].length - v.length;
      res[k] = v;
    });
    return { data: res, dropped: dropped };
  }

  function readSaved() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && obj.version === VERSION) return obj;
    } catch (e) {}
    return null;
  }
  function persist() {
    var obj = { version: VERSION };
    COLLS.forEach(function (k) { obj[k] = D[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function hydrate() {
    var saved = readSaved();
    if (saved) {
      var ok = pickValid(saved).data;
      // коллекции, которых нет или которые повреждены, возвращаем к seed (приложение не «кирпичится»)
      COLLS.forEach(function (k) { D[k] = ok[k] !== undefined ? ok[k] : clone(SEED[k]); });
      persist();
    } else {
      // рабочая копия, независимая от seed
      COLLS.forEach(function (k) { D[k] = clone(SEED[k]); });
      persist();
    }
  }
  hydrate();

  function rerender() { if (AIWS.setState) AIWS.setState({}); }

  /* ----------------------------------------------------------- ID generators */
  function nextNum(prefix, arr) {
    var max = 0;
    arr.forEach(function (x) {
      var n = parseInt(String(x.id).replace(prefix, ""), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  }
  function pad4(n) { n = String(n); while (n.length < 4) n = "0" + n; return n; }
  function nowHM() {
    var d = new Date();
    function p(x) { return x < 10 ? "0" + x : "" + x; }
    return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes());   // UTC — как часы в шапке
  }

  /* ----------------------------------------------------------- Escaping */
  function escText(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;";
    });
  }

  /* ----------------------------------------------------------- LEADS */
  function createLead(p) {
    var n = nextNum("LD-", D.LEADS);
    var lead = {
      id: "LD-" + pad4(n),
      name: p.name || "Новый лид",
      channel: p.channel || "site",
      stageId: p.stageId || "new",
      funnelId: p.funnelId || "fn-sales",
      agentId: p.agentId || "ag-sales",
      value: null,
      lastActivity: nowHM(),
      note: p.note || "",
      events: [{ t: nowHM(), ts: Date.now(), actor: "human", text: "Лид создан вручную" }]
    };
    D.LEADS = D.LEADS.concat([lead]);
    persist(); rerender();
    return lead;
  }
  // Пакетное создание (импорт файла): одна запись в хранилище и один ререндер вместо сотен
  function createLeads(list, opts) {
    opts = opts || {};
    var n = nextNum("LD-", D.LEADS), made = [], ch = D.CHANNELS[opts.channel] ? opts.channel : "site";
    list.forEach(function (p) {
      made.push({
        id: "LD-" + pad4(n++), name: String(p.name || "Новый лид").slice(0, 300), channel: ch, stageId: "new",
        funnelId: opts.funnelId || "fn-sales", agentId: opts.agentId || "ag-sales", value: null, lastActivity: nowHM(),
        note: String(p.note || "").slice(0, 1900),
        events: [{ t: nowHM(), ts: Date.now(), actor: "human", text: "Импортирован из файла" }]
      });
    });
    D.LEADS = D.LEADS.concat(made);
    persist(); rerender();
    return made;
  }
  // ---- ИИ-сотрудники (сохраняются в хранилище)
  function createAgent(a) {
    if (!CHECK.AGENTS(a) || D.AGENTS.some(function (x) { return x.id === a.id; })) return null;
    D.AGENTS = D.AGENTS.concat([a]);
    persist(); rerender();
    return a;
  }
  function updateAgent(id, patch) {
    var next = D.AGENTS.map(function (a) { return a.id === id ? Object.assign({}, a, patch, { id: a.id }) : a; });
    var upd = next.filter(function (a) { return a.id === id; })[0];
    if (!upd || !CHECK.AGENTS(upd)) return false;     // некорректное изменение не применяется
    D.AGENTS = next; persist(); rerender();
    return true;
  }
  // ---- обучение: успешное прохождение теста завершает курс и выдаёт именной сертификат
  function completeCourse(courseId, info) {
    var c = D.COURSES.filter(function (x) { return x.id === courseId; })[0];
    if (!c || !info || !String(info.name || "").trim()) return null;
    var cert = { id: "cert-" + nextNum("cert-", D.CERTIFICATES), name: String(info.name).trim().slice(0, 80), course: c.title, date: new Date().toISOString().slice(0, 10), score: info.score };
    if (!CHECK.CERTIFICATES(cert)) return null;
    D.COURSES = D.COURSES.map(function (x) { return x.id === courseId ? Object.assign({}, x, { progress: 1, status: "Завершён" }) : x; });
    D.CERTIFICATES = D.CERTIFICATES.concat([cert]);
    persist(); rerender();
    return cert;
  }
  function updateLead(id, patch) {
    D.LEADS = D.LEADS.map(function (l) {
      if (l.id !== id) return l;
      return Object.assign({}, l, patch, { events: l.events });
    });
    persist(); rerender();
  }
  function deleteLead(id) {
    D.LEADS = D.LEADS.filter(function (l) { return l.id !== id; });
    persist(); rerender();
  }
  function moveLeadStage(id, stageId) {
    var stage = D.STAGES.filter(function (s) { return s.id === stageId; })[0];
    D.LEADS = D.LEADS.map(function (l) {
      if (l.id !== id || l.stageId === stageId) return l;
      var ev = l.events.concat([{ t: nowHM(), ts: Date.now(), actor: "human", text: "Перемещён в стадию «" + (stage ? stage.name : stageId) + "»" }]);
      return Object.assign({}, l, { stageId: stageId, lastActivity: nowHM(), events: ev });
    });
    persist(); rerender();
  }

  /* ----------------------------------------------------------- DOCUMENTS */
  var DOC_TYPE_LABEL = { invoice: "Счёт", offer: "КП", act: "Акт" };
  function createDocument(p) {
    var n = nextNum("DOC-", D.DOCUMENTS);
    var doc = {
      id: "DOC-" + n,
      type: p.type || "invoice",
      number: (DOC_TYPE_LABEL[p.type] || "Документ") + " №" + n,
      client: p.client || "—",
      amount: p.amount || null,
      status: "pending",
      approver: p.approver || "Менеджер продаж",
      created: nowHM()
    };
    D.DOCUMENTS = D.DOCUMENTS.concat([doc]);
    persist(); rerender();
    return doc;
  }
  function updateDocument(id, patch) {
    D.DOCUMENTS = D.DOCUMENTS.map(function (d) { return d.id === id ? Object.assign({}, d, patch) : d; });
    persist(); rerender();
  }
  function deleteDocument(id) {
    D.DOCUMENTS = D.DOCUMENTS.filter(function (d) { return d.id !== id; });
    persist(); rerender();
  }

  /* ----------------------------------------------------------- ONBOARDING */
  function toggleOnboarding(id) {
    D.ONBOARDING = D.ONBOARDING.map(function (s) {
      return s.id === id ? Object.assign({}, s, { done: !s.done }) : s;
    });
    persist(); rerender();
  }

  /* ----------------------------------------------------------- CONVERSATIONS */
  // opts.mode — необязательная смена режима диалога вместе с сообщением (одна запись, один ререндер)
  var CONV_MODES = ["ai", "human", "reading"];
  function addMessage(convId, msg, opts) {
    var mode = opts && CONV_MODES.indexOf(opts.mode) >= 0 ? opts.mode : null;
    D.CONVERSATIONS = D.CONVERSATIONS.map(function (c) {
      if (c.id !== convId) return c;
      var messages = c.messages.concat([msg]);
      return Object.assign({}, c, {
        messages: messages,
        lastPreview: msg.text,
        lastTime: msg.time,
        mode: mode || c.mode
      });
    });
    persist(); rerender();
  }
  function setConvMode(convId, mode) {
    if (CONV_MODES.indexOf(mode) < 0) return;
    D.CONVERSATIONS = D.CONVERSATIONS.map(function (c) { return c.id === convId ? Object.assign({}, c, { mode: mode }) : c; });
    persist(); rerender();
  }

  /* ----------------------------------------------------------- Reset / export / import */
  function resetAll() {
    COLLS.forEach(function (k) { D[k] = clone(SEED[k]); });
    persist(); rerender();
  }
  function exportJSON() {
    var obj = { version: VERSION };
    COLLS.forEach(function (k) { obj[k] = D[k]; });
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "ai-workspace-data.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importJSON() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json,.json";
    inp.style.display = "none";
    document.body.appendChild(inp); // в DOM — клик надёжнее открывает диалог
    inp.addEventListener("change", function () {
      var f = inp.files[0];
      if (!f) { inp.remove(); return; }
      var r = new FileReader();
      r.onload = function () {
        inp.remove();
        try {
          var obj = JSON.parse(r.result);
          if (!obj || obj.version !== VERSION) throw new Error("version");
          if (!isObj(obj)) throw new Error("shape");
          var res = pickValid(obj);
          if (!Object.keys(res.data).length) throw new Error("empty");
          Object.keys(res.data).forEach(function (k) { D[k] = res.data[k]; });
          persist(); rerender();
          if (AIWS.toast) AIWS.toast(res.dropped ? "Данные импортированы, пропущено некорректных записей: " + res.dropped : "Данные импортированы");
        } catch (e) {
          if (AIWS.toast) AIWS.toast("Не удалось импортировать: неверный файл");
        }
      };
      r.readAsText(f);
    });
    inp.click();
  }

  /* ----------------------------------------------------------- TASKS */
  function toggleTask(id) {
    D.TASKS = D.TASKS.map(function (t) { return t.id === id ? Object.assign({}, t, { done: !t.done }) : t; });
    persist(); rerender();
  }
  function addTask(p) {
    var n = nextNum("TK-", D.TASKS);
    var task = {
      id: "TK-" + n,
      title: p.title || "Новая задача",
      done: false,
      priority: p.priority || "med",
      due: p.due || "",
      assignee: p.assignee || "Менеджер",
      tag: p.tag || "CRM"
    };
    D.TASKS = D.TASKS.concat([task]);
    persist(); rerender();
    return task;
  }
  function deleteTask(id) {
    D.TASKS = D.TASKS.filter(function (t) { return t.id !== id; });
    persist(); rerender();
  }
  function updateTask(id, patch) {
    D.TASKS = D.TASKS.map(function (t) { return t.id === id ? Object.assign({}, t, patch) : t; });
    persist(); rerender();
  }

  /* ----------------------------------------------------------- NOTIFICATIONS */
  function markNotifRead(id) {
    D.NOTIFICATIONS = D.NOTIFICATIONS.map(function (n) { return n.id === id ? Object.assign({}, n, { read: true }) : n; });
    persist(); rerender();
  }
  function markAllNotifsRead() {
    D.NOTIFICATIONS = D.NOTIFICATIONS.map(function (n) { return Object.assign({}, n, { read: true }); });
    persist(); rerender();
  }

  AIWS.db = {
    createLead: createLead, createLeads: createLeads, createAgent: createAgent, updateAgent: updateAgent, completeCourse: completeCourse, updateLead: updateLead, deleteLead: deleteLead, moveLeadStage: moveLeadStage,
    createDocument: createDocument, updateDocument: updateDocument, deleteDocument: deleteDocument,
    toggleOnboarding: toggleOnboarding, addMessage: addMessage, setConvMode: setConvMode, nowHM: nowHM,
    toggleTask: toggleTask, addTask: addTask, deleteTask: deleteTask, updateTask: updateTask,
    markNotifRead: markNotifRead, markAllNotifsRead: markAllNotifsRead,
    resetAll: resetAll, exportJSON: exportJSON, importJSON: importJSON,
    DOC_TYPE_LABEL: DOC_TYPE_LABEL
  };

  /* =========================================================== UI: модалки + поля */
  function openModal(opts) {
    closeModal();
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "aiwsModal";
    overlay.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="' + escText(opts.title || "") + '">' +
        '<div class="modal-head"><h3 style="font-size:15px">' + escText(opts.title || "") + '</h3>' +
          '<button class="icon-btn" data-modal-close aria-label="Закрыть">' + (AIWS.icon ? AIWS.icon("x", { size: 16 }) : "×") + '</button></div>' +
        '<div class="modal-body">' + (opts.body || "") + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-modal-close]")) closeModal();
    });
    overlay._release = trapFocus(overlay, closeModal);
    return overlay;
  }
  function closeModal() {
    var cur = document.getElementById("aiwsModal");
    if (cur) {
      if (cur._release) cur._release();   // снимает ловушку фокуса и возвращает фокус на вызвавший элемент
      cur.remove();
    }
  }
  // Ловушка фокуса для диалогов: Tab не уходит за окно, Esc закрывает, фокус возвращается при закрытии.
  function trapFocus(overlay, onClose) {
    var prev = document.activeElement;
    function focusables() { return [].slice.call(overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function (n) { return !n.disabled; }); }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    var start = overlay.querySelector(".modal-body input,.modal-body select,.modal-body textarea,.modal-body button") || overlay.querySelector("button");
    if (start) start.focus();
    return function release() {
      document.removeEventListener("keydown", onKey);
      if (prev && document.contains(prev) && prev.focus) prev.focus();
    };
  }

  AIWS.ui = {
    openModal: openModal,
    closeModal: closeModal,
    trapFocus: trapFocus,
    field: function (label, inner) { return '<div class="field"><label class="field-label">' + escText(label) + '</label>' + inner + '</div>'; },
    input: function (name, value, ph) { return '<input class="input" name="' + escText(name) + '" value="' + escText(value || "") + '" placeholder="' + escText(ph || "") + '"/>'; },
    textarea: function (name, value, ph, rows) { return '<textarea class="textarea" name="' + escText(name) + '" rows="' + (rows || 3) + '" placeholder="' + escText(ph || "") + '">' + escText(value || "") + '</textarea>'; },
    select: function (name, options, selected) {
      var opts = options.map(function (o) {
        var val = o[0], lab = o[1];
        return '<option value="' + escText(val) + '"' + (String(selected) === String(val) ? " selected" : "") + '>' + escText(lab) + '</option>';
      }).join("");
      return '<select class="select" name="' + escText(name) + '">' + opts + '</select>';
    }
  };

  /* =========================================================== Скриптованный ответ (демо, не LLM) */
  // Ответ по ключевым словам. Честная заглушка — не обращается к модели.
  function scriptedReply(role, text) {
    var q = String(text || "").toLowerCase();
    function has() { for (var i = 0; i < arguments.length; i++) { if (q.indexOf(arguments[i]) >= 0) return true; } return false; }
    if (has("цена", "тариф", "стоим", "сколько", "прайс")) return "Подготовлю варианты под вашу задачу и пришлю каталог тарифов (демо-ответ по сценарию).";
    if (has("возврат", "вернут", "деньги", "возвращ")) return "Проверю условия возврата по базе и передам менеджеру на оформление (демо-ответ).";
    if (has("поставщик", "закуп", "снабж", "комплект")) return "Соберу запрос поставщикам и сравню предложения по сроку и условиям (демо-ответ).";
    if (has("привет", "здравств", "добрый")) return "Здравствуйте! Уточните вопрос — отвечу по инструкции и базе знаний (демо).";
    if (has("спасиб", "благодар")) return "Принял, благодарю. Буду на связи, если понадоблюсь (демо).";
    if (has("не работает", "ошибка", "проблема", "полом")) return "Зафиксирую обращение и подключу поддержку по регламенту SLA (демо-ответ).";
    return "Принял вопрос: «" + (text || "") + "». Ответ подготовлен по инструкции и базе знаний (демо-сценарий, не LLM).";
  }
  AIWS.scriptedReply = scriptedReply;

})(typeof window !== "undefined" ? window : this);
