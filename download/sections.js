/* =========================================================================
   sections.js — разделы 1–4: Обзор, ИИ-сотрудники, Диалоги, CRM.
   Каждый раздел — функция-рендерер, регистрируется через AIWS.registerSection.
   Состояния loading/empty/error/success учтены в каждом экране.
   ========================================================================= */
(function (global) {
  "use strict";

  var AIWS = global.AIWS;
  var icon = AIWS.icon;
  var D = AIWS.data;
  var T = D.I18N;
  var esc = AIWS.helpers.esc;

  /* ----------------------------------------------------------- Shared helpers */
  var H = {
    pageHead: function (title, subtitle, actions) {
      return '<div class="page-head"><div><h1 class="title">' + esc(title) + '</h1>' +
        (subtitle ? '<div class="subtitle">' + esc(subtitle) + '</div>' : '') + '</div>' +
        '<div class="actions">' + (actions || "") + '</div></div>';
    },
    badge: function (text, cls) { return '<span class="badge ' + (cls || "") + '">' + esc(text) + '</span>'; },
    demo: function () { return '<span class="badge badge-demo">' + esc(T.demo) + '</span>'; },
    channelIcon: function (id) {
      var c = D.CHANNELS[id]; if (!c) return "";
      return '<span class="chip chip-status-reading" title="' + esc(c.name) + '">' + icon(c.icon, { size: 14 }) + esc(c.name) + '</span>';
    },
    statusDot: function (agent) {
      var s = agent.status;
      if (s === "online") return '<span class="dot dot-status"></span>';
      if (s === "idle") return '<span class="dot dot-accent"></span>';
      if (s === "error") return '<span class="dot dot-critical"></span>';
      return '<span class="dot dot-outline"></span>';
    },
    statusLabel: function (agent) {
      var s = agent.status;
      if (s === "online") return '<span class="tag-online"><span class="dot dot-status"></span>В СЕТИ</span>';
      if (s === "idle") return '<span class="muted">Ожидание</span>';
      if (s === "error") return '<span class="tag-critical"><span class="dot dot-critical"></span>КРИТИЧНО</span>';
      return '<span class="muted">Не в сети</span>';
    },
    card: function (inner, cls) { return '<div class="card ' + (cls || "") + '">' + inner + '</div>'; },
    sectionLabel: function (t) { return '<div class="section-label" style="margin-bottom:10px">' + esc(t) + '</div>'; },
    empty: function (title, desc, ic) {
      return '<div class="state">' + icon(ic || "circle", { size: 30 }) +
        '<div class="t">' + esc(title) + '</div><div class="d">' + esc(desc) + '</div></div>';
    },
    loading: function () {
      return '<div class="state"><div class="skeleton" style="width:120px;height:14px"></div>' +
        '<div class="skeleton" style="width:200px;height:10px"></div></div>';
    }
  };
  AIWS.H = H;

  /* =========================================================== 1. Обзор */
  function overview() {
    // KPI: лиды, созданные счета, сообщения от ИИ, передано менеджеру.
    // Демонстрация пустого состояния у одного показателя.
    var leadsCount = D.LEADS.length;
    var docsCreated = D.DOCUMENTS.length;
    var aiMessages = 0; D.CONVERSATIONS.forEach(function (c) { c.messages.forEach(function (m) { if (m.from === "ai") aiMessages++; }); });
    var handedOff = D.LEADS.filter(function (l) { return l.events.some(function (e) { return e.actor === "human" && /передан/i.test(e.text); }); }).length;   // именно передачи менеджеру, а не любое действие человека
    var escalated = D.LEADS.filter(function (l) { return l.note && l.note.indexOf("Эскалация") >= 0; }).length;

    function kpi(label, value, hint, empty, critical) {
      var v = empty ? '<span class="kpi-empty">—</span>' : '<span class="kpi-num">' + esc(value) + '</span>';
      return H.card(
        '<div class="row"><span class="kpi-label" style="margin-top:0">' + esc(label) + '</span>' + H.demo() + '</div>' +
        v +
        (hint ? '<div class="hint-line">' + icon(critical ? "alert-triangle" : "arrow-up-right", { size: 13 }) + esc(hint) + '</div>' : '') +
        (empty ? '<div class="hint-line">' + icon("clock", { size: 13 }) + 'Нет данных за период — покажется, когда появятся обращения</div>' : '')
      );
    }

    var html = H.pageHead("Обзор", "Сводка по работе ИИ-сотрудников и текущая активность",
      '<button class="btn btn-secondary" id="ovRefresh">' + icon("refresh", { size: 16 }) + 'Обновить</button>');

    // KPI cards
    html += '<div class="grid grid-4" style="margin-bottom:20px">';
    html += kpi("Лиды за период", leadsCount, "В базе сейчас: " + leadsCount, false);
    html += kpi("Созданные счета", docsCreated, "ИИ готовит по шаблону", false);
    html += kpi("Сообщения от ИИ", aiMessages, "Ответы из базы знаний", false);
    html += kpi("Передано менеджеру", handedOff, escalated ? "Есть эскалация (КРИТИЧНО)" : "Передача по правилам", false, escalated > 0);
    html += '</div>';

    // Activity chart + onboarding
    html += '<div class="grid" style="grid-template-columns:2fr 1fr;align-items:start" id="ovGrid">';
    html += H.card(
      '<div class="row" style="margin-bottom:6px"><h3 style="font-size:15px">Активность за неделю</h3><div class="spacer"></div>' +
      '<span class="badge"><span class="dot dot-accent"></span>ИИ</span><span class="badge"><span class="dot" style="background:var(--muted-foreground)"></span>Человек</span>' + H.demo() + '</div>' +
      activityChart(D.ACTIVITY)
    );
    // Onboarding «С чего начать»
    var done = D.ONBOARDING.filter(function (s) { return s.done; }).length;
    var total = D.ONBOARDING.length;
    var pct = Math.round(done / total * 100);
    html += H.card(
      '<div class="row"><h3 style="font-size:15px">С чего начать</h3><div class="spacer"></div><span class="badge">' + pct + '%</span></div>' +
      '<div class="step-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="steps" style="margin-top:10px">' +
      D.ONBOARDING.map(function (s, i) {
        return '<div class="step' + (s.done ? " done" : "") + '" data-onboard="' + esc(s.id) + '" role="button" tabindex="0" title="Отметить/снять">' +
          '<span class="step-idx">' + (s.done ? icon("check", { size: 13 }) : (i + 1)) + '</span>' +
          '<span class="step-name">' + esc(s.name) + '</span>' +
          '<span class="step-status">' + (s.done ? "Готово" : "В процессе") + '</span>' +
        '</div>';
      }).join("") + '</div>'
    );
    html += '</div>';

    // Recent events journal (preview)
    html += '<div style="margin-top:20px">' + H.sectionLabel("Лента событий · журнал смены") + H.card(
      '<div class="journal">' + recentJournal(8) + '</div>'
    ) + '</div>';

    return html;
  }

  // Новые события (с меткой ts) всегда выше демо-событий (без ts); внутри группы — по времени HH:MM, равные не меняют порядок
  function evNewestFirst(a, b) {
    var x = a.ts || 0, y = b.ts || 0; if (x !== y) return y - x;
    return a.t < b.t ? 1 : a.t > b.t ? -1 : 0;
  }
  function recentJournal(n) {
    var rows = [];
    D.LEADS.forEach(function (l) {
      l.events.forEach(function (e) {
        rows.push({ t: e.t, ts: e.ts, actor: e.actor, text: e.text, lead: l.id });
      });
    });
    rows.sort(evNewestFirst);
    return rows.slice(0, n || 8).map(function (r) {
      var actor = r.actor === "ai" ? '<span class="actor-ai">ИИ</span>' : '<span class="actor-human">Менеджер</span>';
      return '<div class="journal-row"><span class="time">' + esc(r.t) + '</span>' +
        '<span class="body">' + actor + ' <span class="detail">' + esc(r.text) + ' · ' + esc(r.lead) + '</span></span></div>';
    }).join("");
  }

  function activityChart(data) {
    var max = 0; data.forEach(function (d) { max = Math.max(max, d.ai, d.human); });
    var W = 560, Hh = 160, pad = 24, bw = 18, gap = 56;
    var x0 = pad;
    var bars = "";
    data.forEach(function (d, i) {
      var x = x0 + i * gap;
      var aiH = Math.round(d.ai / max * (Hh - pad));
      var huH = Math.round(d.human / max * (Hh - pad));
      bars += '<rect class="chart-bar-ai" x="' + x + '" y="' + (Hh - aiH) + '" width="' + bw + '" height="' + aiH + '" rx="2"/>';
      bars += '<rect class="chart-bar-human" x="' + (x + bw + 4) + '" y="' + (Hh - huH) + '" width="' + bw + '" height="' + huH + '" rx="2"/>';
      bars += '<text class="chart-label" x="' + (x + bw + 2) + '" y="' + (Hh + 16) + '" text-anchor="middle">' + d.day + '</text>';
      bars += '<text class="chart-value" x="' + (x + bw / 2) + '" y="' + (Hh - aiH - 5) + '" text-anchor="middle">' + d.ai + '</text>';
    });
    // grid baseline
    return '<div class="tbl-scroll"><svg viewBox="0 0 ' + (x0 + data.length * gap) + ' ' + (Hh + 24) + '" width="100%" height="190" role="img" aria-label="График активности за неделю">' +
      '<line class="chart-axis" x1="' + pad + '" y1="' + Hh + '" x2="' + (x0 + (data.length - 1) * gap + bw + 4) + '" y2="' + Hh + '"/>' +
      bars + '</svg></div>';
  }

  /* =========================================================== 2. ИИ-сотрудники */
  function agents() {
    var html = H.pageHead("ИИ-сотрудники", "Команда ИИ-агентов: роли, каналы, воронки",
      '<button class="btn btn-primary" id="newAgentBtn">' + icon("plus", { size: 16 }) + 'Создать сотрудника</button>');
    html += '<div class="grid grid-3">';
    D.AGENTS.forEach(function (a) {
      var channels = a.channels.slice(0, 3).map(function (c) { return '<span class="chip">' + icon(D.CHANNELS[c].icon, { size: 14 }) + esc(D.CHANNELS[c].name) + '</span>'; }).join("");
      var extra = a.channels.length > 3 ? '<span class="badge">+' + (a.channels.length - 3) + '</span>' : "";
      html += H.card(
        '<div class="row" style="margin-bottom:10px">' +
          '<span class="brand-mark" style="width:34px;height:34px">' + esc(a.monogram) + '</span>' +
          '<div style="flex:1;min-width:0"><div class="row">' + H.statusDot(a) + '<span style="font-size:14px;font-weight:600">' + esc(a.name) + '</span></div>' +
          '<div class="muted" style="font-size:12px;margin-top:2px">' + H.statusLabel(a) + '</div></div>' + H.demo() + '</div>' +
        '<p class="muted" style="font-size:13px;margin-bottom:12px">' + esc(a.summary) + '</p>' +
        '<div class="row-wrap" style="gap:6px;margin-bottom:12px">' + channels + extra + '</div>' +
        '<div class="row" style="justify-content:space-between"><span class="muted" style="font-size:12px">Воронка: ' + (a.funnelId ? esc(funnelName(a.funnelId)) : "—") + '</span>' +
        '<button class="btn btn-secondary btn-sm" data-agent="' + a.id + '">Открыть</button></div>'
      );
    });
    html += '</div>';
    return html;
  }

  function funnelName(id) { var f = D.FUNNELS.filter(function (x) { return x.id === id; })[0]; return f ? f.name : "—"; }

  function agentDetail(agentId) {
    var a = D.AGENTS.filter(function (x) { return x.id === agentId; })[0];
    if (!a) { return agents(); }
    var tab = AIWS.store.agentTab || "instruction";
    var tabs = [["instruction", "Инструкция"], ["knowledge", "Знания"], ["channels", "Каналы"], ["funnel", "Воронка"], ["approvals", "Правила согласования"], ["test", "Тест"]];
    var html = H.pageHead(a.name, a.summary,
      '<button class="btn btn-secondary" id="backToAgents">' + icon("chevron-left", { size: 16 }) + 'К списку</button>' +
      '<button class="btn btn-secondary btn-sm" id="agentPause">' + icon(a.status === "offline" ? "refresh" : "pause", { size: 14 }) + (a.status === "offline" ? "Возобновить" : "Приостановить") + '</button>');
    html += '<div class="row" style="margin-bottom:16px;gap:10px">' + H.statusLabel(a) + '<span class="badge">Роль: ' + roleLabel(a.role) + '</span>' + H.demo() + '</div>';
    html += '<div class="tabs">' + tabs.map(function (t) {
      return '<button class="tab' + (tab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join("") + '</div>';
    html += '<div class="card">' + agentTabContent(a, tab) + '</div>';
    return html;
  }

  function roleLabel(r) {
    return { sales: "Продажи", support: "Поддержка", supply: "Снабжение", hr: "HR", rop: "РОП" }[r] || r;
  }

  function agentTabContent(a, tab) {
    if (tab === "instruction") {
      return H.sectionLabel("Инструкция сотруднику") +
        '<p style="margin-bottom:12px">' + esc(a.instruction) + '</p>' +
        '<div class="field"><label class="field-label">Текст инструкции</label>' +
        '<textarea class="textarea" id="agentInstr" rows="4">' + esc(a.instruction) + '</textarea></div>' +
        '<div class="row"><button class="btn btn-primary btn-sm" id="agentSave">Сохранить</button><span class="hint-line">ИИ применяет инструкцию к каждому диалогу</span></div>';
    }
    if (tab === "knowledge") {
      return H.sectionLabel("Подключённая база знаний") +
        '<div class="stack">' + a.knowledge.map(function (k) {
          return '<div class="row"><span class="chip">' + icon("book-open", { size: 14 }) + esc(k) + '</span><div class="spacer"></div><span class="badge">Индексировано</span></div>';
        }).join("") + '<button class="btn btn-secondary btn-sm" data-soon="Добавление источников знаний">' + icon("plus", { size: 14 }) + 'Добавить источник</button></div>';
    }
    if (tab === "channels") {
      return H.sectionLabel("Каналы подключения") +
        '<div class="row-wrap" style="gap:8px">' + a.channels.map(function (c) { return H.channelIcon(c); }).join("") +
        (a.channels.length ? "" : '<span class="muted">Каналы не подключены</span>') + '</div>' +
        '<div class="divider"></div><button class="btn btn-secondary btn-sm" data-soon="Подключение каналов">' + icon("plus", { size: 14 }) + 'Подключить канал</button>';
    }
    if (tab === "funnel") {
      if (!a.funnelId) return H.empty("Без воронки", "Для этой роли воронка не используется.", "kanban");
      return H.sectionLabel("Воронка продаж") +
        '<div class="kanban">' + D.STAGES.map(function (s) {
          var count = D.LEADS.filter(function (l) { return l.stageId === s.id && l.funnelId === a.funnelId; }).length;
          return '<div class="kanban-col"><div class="kanban-col-head"><span class="name">' + esc(s.name) + '</span><span class="count">' + count + '</span></div></div>';
        }).join("") + '</div>';
    }
    if (tab === "approvals") {
      return H.sectionLabel("Что ИИ делает сам, что согласует") +
        '<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Действие</th><th>Режим</th><th>Примечание</th></tr></thead><tbody>' +
        a.approvals.map(function (r) {
          return '<tr><td>' + esc(r.action) + '</td><td>' + (r.mode === "auto" ? '<span class="badge"><span class="dot dot-status"></span>Сам</span>' : '<span class="badge"><span class="dot dot-accent"></span>Согласует</span>') + '</td><td class="muted">' + esc(r.note) + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    }
    if (tab === "test") {
      return H.sectionLabel("Тест-чат с сотрудником") +
        '<div class="hint-line" style="margin-bottom:8px">' + icon("alert-triangle", { size: 13 }) + 'Демо-сценарий: ответы подбираются по ключевым словам, это не LLM.</div>' +
        '<div class="chat-layout" style="height:340px;grid-template-columns:1fr"><div class="chat-thread">' +
        '<div class="chat-messages" id="testChat"><div class="msg msg-ai">Готов к проверке. Напишите реплику клиента — попробуйте слова «тариф», «возврат», «поставщик».</div></div>' +
        '<div class="chat-composer"><input class="input" id="testInput" placeholder="Сообщение от клиента…"/><button class="btn btn-primary btn-sm" id="testSend">' + icon("send", { size: 14 }) + '</button></div>' +
        '</div></div>';
    }
    return "";
  }

  function wizardModal() {
    var roles = [["sales", "Продажи"], ["support", "Поддержка"], ["supply", "Снабжение"], ["hr", "HR"], ["rop", "РОП"]];
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "wizardRoot";
    overlay.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-label="Создание ИИ-сотрудника">' +
      '<div class="modal-head"><h3 style="font-size:15px">Создание ИИ-сотрудника</h3><button class="icon-btn" id="wizClose" aria-label="Закрыть">' + icon("x", { size: 16 }) + '</button></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label class="field-label">Роль</label><div class="row-wrap" style="gap:8px">' +
      roles.map(function (r, i) { return '<button class="chip' + (i === 0 ? " chip-accent" : "") + '" aria-pressed="' + (i === 0) + '" data-role="' + r[0] + '">' + esc(r[1]) + '</button>'; }).join("") +
      '</div></div>' +
      '<div class="field"><label class="field-label">Название</label><input class="input" id="wizName" maxlength="60" placeholder="Например: Продажи — входящие"/></div>' +
      '<div class="field"><label class="field-label">Инструкция</label><textarea class="textarea" id="wizInstr" rows="3" placeholder="Опишите, что делает сотрудник и как отвечает"></textarea></div>' +
      '<div class="field"><label class="field-label">База знаний</label><select class="select" id="wizKnow"><option>Демо-описание продукта.pdf</option><option>Демо-сценарии продаж.docx</option></select></div>' +
      '<div class="field"><label class="field-label">Каналы</label><div class="row-wrap" style="gap:6px">' +
      Object.keys(D.CHANNELS).map(function (c, i) { return '<button class="chip' + (i < 2 ? " chip-accent" : "") + '" data-ch="' + esc(c) + '" aria-pressed="' + (i < 2) + '">' + icon(D.CHANNELS[c].icon, { size: 14 }) + esc(D.CHANNELS[c].name) + '</button>'; }).join("") +
      '</div></div>' +
      '<div class="hint-line">' + icon("alert-triangle", { size: 13 }) + 'Сотрудник появится в списке и сохранится в этом браузере</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" id="wizCancel">Отмена</button><button class="btn btn-primary" id="wizSave">Создать</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    var release = AIWS.ui.trapFocus(overlay, closeWiz);
    function closeWiz() { release(); overlay.remove(); }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeWiz(); });
    el2("wizClose").addEventListener("click", function () { closeWiz(); });
    el2("wizCancel").addEventListener("click", function () { closeWiz(); });
    var chosenRole = "sales";
    overlay.querySelectorAll("[data-ch]").forEach(function (b) {
      b.addEventListener("click", function () { b.classList.toggle("chip-accent"); b.setAttribute("aria-pressed", b.classList.contains("chip-accent")); });
    });
    el2("wizSave").addEventListener("click", function () {
      var nameEl = el2("wizName"), name = nameEl.value.trim();
      if (!name) { nameEl.focus(); toast("Укажите название сотрудника"); return; }
      var n = D.AGENTS.length + 1; while (D.AGENTS.some(function (x) { return x.id === "ag-new-" + n; })) n++;
      var mono = name.replace(/[^A-Za-zА-Яа-яЁё0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0]; }).join("").toUpperCase() || "ИИ";
      var chans = [].slice.call(overlay.querySelectorAll("[data-ch].chip-accent")).map(function (b) { return b.getAttribute("data-ch"); });
      var made = AIWS.db.createAgent({ id: "ag-new-" + n, name: name, role: chosenRole, status: "idle", channels: chans, funnelId: null, monogram: mono,
        summary: "Создан в мастере.", instruction: el2("wizInstr").value.trim() || "Инструкция не задана.",
        knowledge: [el2("wizKnow").value], funnel: [], approvals: [] });
      if (!made) { toast("Не удалось создать сотрудника: проверьте поля"); return; }
      closeWiz();
      toast("ИИ-сотрудник создан");
    });
    overlay.querySelectorAll("[data-role]").forEach(function (b) {
      b.addEventListener("click", function () {
        overlay.querySelectorAll("[data-role]").forEach(function (x) { x.classList.remove("chip-accent"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("chip-accent"); b.setAttribute("aria-pressed", "true"); chosenRole = b.getAttribute("data-role");
      });
    });
  }
  AIWS.openAgentWizard = wizardModal;

  function openLeadModal() {
    var ui = AIWS.ui;
    var chanOpts = Object.keys(D.CHANNELS).map(function (c) { return [c, D.CHANNELS[c].name]; });
    var funOpts = D.FUNNELS.map(function (f) { return [f.id, f.name]; });
    var agOpts = D.AGENTS.map(function (a) { return [a.id, a.name]; });
    var body =
      ui.field("Имя клиента", ui.input("name", "", "Например: ООО Ромашка")) +
      ui.field("Канал", ui.select("channel", chanOpts, "site")) +
      ui.field("Воронка", ui.select("funnelId", funOpts, AIWS.store.crmFunnel)) +
      ui.field("Агент", ui.select("agentId", agOpts, "ag-sales")) +
      ui.field("Заметка", ui.textarea("note", "", "Контекст обращения", 2));
    var foot = '<button class="btn btn-ghost" data-modal-close>Отмена</button><button class="btn btn-primary" id="leadSave">Создать</button>';
    var ov = ui.openModal({ title: "Создать лид", body: body, footer: foot });
    var save = ov.querySelector("#leadSave");
    if (save) save.addEventListener("click", function () {
      var name = ov.querySelector("[name=name]").value.trim() || "Новый лид";
      var channel = ov.querySelector("[name=channel]").value;
      var funnelId = ov.querySelector("[name=funnelId]").value;
      var agentId = ov.querySelector("[name=agentId]").value;
      var note = ov.querySelector("[name=note]").value.trim();
      ui.closeModal();
      var created = AIWS.db.createLead({ name: name, channel: channel, funnelId: funnelId, agentId: agentId, note: note });
      AIWS.setState({ crmFunnel: funnelId, selectedLead: created.id });
      toast("Лид создан");
    });
  }

  function el2(id) { return document.getElementById(id); }

  function toast(msg) {
    var old = document.getElementById("aiwsToast"); if (old) old.remove();
    var t = document.createElement("div");
    t.id = "aiwsToast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite");
    t.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--border);color:var(--foreground);padding:10px 16px;border-radius:var(--radius-sm);box-shadow:var(--shadow-pop);z-index:80;font-size:13px";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  AIWS.toast = toast;

  /* =========================================================== 3. Диалоги */
  function dialogs() {
    var conv = D.CONVERSATIONS.filter(function (c) { return c.id === AIWS.store.selectedConv; })[0] || D.CONVERSATIONS[0];
    var mode = conv.mode;   // режим хранится в разговоре и сохраняется (ai | human | reading)
    var list = D.CONVERSATIONS.map(function (c) {
      return '<div class="chat-item' + (c.id === conv.id ? " active" : "") + '" data-conv="' + esc(c.id) + '">' +
        '<div class="top"><span class="name">' + esc(c.contactName) + '</span><span class="time">' + esc(c.lastTime) + '</span></div>' +
        '<div class="preview">' + icon(D.CHANNELS[c.channel].icon, { size: 12 }) + ' ' + esc(c.lastPreview) + '</div></div>';
    }).join("");

    var modeChip = mode === "ai" ? '<span class="chip chip-status-ai"><span class="dot dot-accent"></span>ИИ отвечает</span>' :
                   mode === "human" ? '<span class="chip chip-accent">Менеджер отвечает</span>' :
                   '<span class="chip chip-status-reading">ИИ в режиме чтения</span>';

    var msgs = conv.messages.map(function (m) {
      var cls = m.from === "ai" ? "msg-ai" : m.from === "human" ? "msg-human" : "msg-client";
      var who = m.from === "ai" ? "ИИ" : m.from === "human" ? "Менеджер" : "Клиент";
      return '<div class="msg ' + cls + '">' + esc(m.text) + '<div class="meta">' + esc(who) + ' · ' + esc(m.time) + '</div></div>';
    }).join("");

    var ctx = conv.context;
    var html = '<div style="height:calc(100vh - var(--topbar-h) - 2 * var(--content-pad) + 8px)">';
    html += '<div class="chat-layout' + (AIWS.store.chatListOpen ? ' list-open' : '') + '">';
    // list
    html += '<div class="chat-list"><div class="chat-list-head"><div class="row">' + H.sectionLabel("Входящие") + '<div class="spacer"></div>' + H.demo() + '</div></div>' + list + '</div>';
    // thread
    html += '<div class="chat-thread"><div class="chat-thread-head">' +
      '<button class="icon-btn chat-back" id="chatBack" aria-label="К списку диалогов" title="К списку диалогов">' + icon("chevron-left", { size: 16 }) + '</button>' +
      '<span class="brand-mark" style="width:26px;height:26px">' + esc(((D.AGENTS.filter(function(a){return a.id===conv.agentId;})[0]) || { monogram: "?" }).monogram) + '</span>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">' + esc(conv.contactName) + '</div>' +
      '<div class="muted" style="font-size:11.5px">' + icon(D.CHANNELS[conv.channel].icon, { size: 12 }) + ' ' + esc(D.CHANNELS[conv.channel].name) + ' · ' + esc(agentName(conv.agentId)) + '</div></div>' +
      modeChip +
      '</div>';
    html += '<div class="chat-messages" id="threadMsgs" data-autoscroll data-count="' + conv.messages.length + '" data-convid="' + esc(conv.id) + '">' + msgs + '<div id="typingHost"></div></div>';
    html += '<div class="chat-composer">';
    if (mode === "ai") {
      html += '<button class="btn btn-secondary btn-sm" id="takeOver" title="Передать менеджеру">' + icon("users", { size: 14 }) + 'Передать менеджеру</button>';
    } else {
      html += '<button class="btn btn-secondary btn-sm" id="giveBack" title="Вернуть диалог ИИ">' + icon("bot", { size: 14 }) + 'Вернуть ИИ</button>';
    }
    html += '<input class="input" id="msgInput" placeholder="' + (mode === "ai" ? "ИИ ведёт диалог…" : "Ответ менеджера…") + '"' + (mode === "ai" ? " disabled" : "") + '/>';
    html += '<button class="icon-btn" aria-label="Прикрепить файл" data-soon="Вложения в диалоге">' + icon("paperclip", { size: 16 }) + '</button>';
    html += '<button class="btn btn-primary btn-sm" id="msgSend"' + (mode === "ai" ? " disabled" : "") + '>' + icon("send", { size: 14 }) + '</button>';
    html += '</div></div>';
    // context
    html += '<div class="chat-context">' +
      '<div class="ctx-section"><div class="label">Кто обратился</div><div style="font-size:13.5px;font-weight:600">' + esc(ctx.who) + '</div></div>' +
      '<div class="ctx-section"><div class="label">Канал</div><div class="row">' + icon(D.CHANNELS[conv.channel].icon, { size: 14 }) + esc(ctx.channel) + '</div></div>' +
      '<div class="ctx-section"><div class="label">История</div><div class="muted" style="font-size:12.5px">' + esc(ctx.history) + '</div></div>' +
      '<div class="ctx-section"><div class="label">Данные клиента</div><div class="ctx-kv"><span class="k">Файлы</span><span class="v">' + esc(ctx.files) + '</span><span class="k">Статус</span><span class="v">' + (mode === "ai" ? "С ИИ" : "С менеджером") + '</span></div></div>' +
      '<div class="ctx-section"><div class="label">Следующий шаг</div><div style="font-size:13px">' + esc(ctx.nextStep) + '</div>' +
      '<button class="btn btn-secondary btn-sm btn-block" id="ctxOpenCrm" style="margin-top:8px">' + icon("arrow-right", { size: 14 }) + 'Открыть в CRM</button></div>' +
      '</div>';
    html += '</div></div>';
    return html;
  }

  function agentName(id) { var a = D.AGENTS.filter(function (x) { return x.id === id; })[0]; return a ? a.name : "—"; }

  /* =========================================================== 4. CRM */
  function crm() {
    var view = AIWS.store.crmView;
    var funnelId = AIWS.store.crmFunnel;
    var actions = '<div class="segmented" id="crmViewSeg">' +
      '<button class="seg' + (view === "journal" ? " active" : "") + '" data-view="journal">' + icon("messages-square", { size: 14 }) + 'Журнал</button>' +
      '<button class="seg' + (view === "kanban" ? " active" : "") + '" data-view="kanban">' + icon("kanban", { size: 14 }) + 'Канбан</button>' +
      '<button class="seg' + (view === "table" ? " active" : "") + '" data-view="table">' + icon("bar-chart", { size: 14 }) + 'Таблица</button>' +
      '</div>';
    var funnelSel = '<select class="select" id="crmFunnel" style="width:auto">' +
      D.FUNNELS.map(function (f) { return '<option value="' + f.id + '"' + (f.id === funnelId ? " selected" : "") + '>' + esc(f.name) + '</option>'; }).join("") + '</select>';
    var html = H.pageHead("CRM", "Воронки сделок и работа с лидами",
      '<button class="btn btn-primary" id="newLeadBtn">' + icon("plus", { size: 16 }) + 'Создать лид</button>' + actions + funnelSel + '<span class="badge"><span class="dot dot-status"></span>Синхр. amoCRM: ОК</span>' + H.demo());
    if (view === "journal") html += crmJournal(funnelId);
    else if (view === "kanban") html += crmKanban(funnelId);
    else html += crmTable(funnelId);
    return html;
  }

  function crmJournal(funnelId) {
    var leads = D.LEADS.filter(function (l) { return l.funnelId === funnelId; });
    var sel = AIWS.store.selectedLead;
    var lead = leads.filter(function (l) { return l.id === sel; })[0] || leads[0];
    var events = [];
    leads.forEach(function (l) { l.events.forEach(function (e) { events.push({ t: e.t, ts: e.ts, actor: e.actor, text: e.text, lead: l.id, leadName: l.name }); }); });
    events.sort(evNewestFirst);
    var journal = events.map(function (r) {
      var actor = r.actor === "ai" ? '<span class="actor-ai">ИИ</span>' : '<span class="actor-human">Менеджер</span>';
      return '<div class="journal-row"><span class="time">' + esc(r.t) + '</span>' +
        '<span class="body">' + actor + ' <span class="detail">' + esc(r.text) + '</span> · <a data-lead="' + esc(r.lead) + '" style="color:var(--primary);cursor:pointer">' + esc(r.lead) + '</a></span></div>';
    }).join("");
    var inspector = lead ? H.card(
      '<div class="row" style="margin-bottom:10px"><span style="font-size:14px;font-weight:600">' + esc(lead.name) + '</span><div class="spacer"></div>' + stageBadge(lead.stageId) + '</div>' +
      '<div class="ctx-kv" style="margin-bottom:14px"><span class="k">ID</span><span class="v">' + esc(lead.id) + '</span>' +
      '<span class="k">Канал</span><span class="v">' + esc(D.CHANNELS[lead.channel].name) + '</span>' +
      '<span class="k">Агент</span><span class="v">' + esc(agentName(lead.agentId)) + '</span>' +
      '<span class="k">Активность</span><span class="v">' + esc(lead.lastActivity) + '</span></div>' +
      H.sectionLabel("Лента событий лида") +
      '<div class="journal">' + lead.events.map(function (e) {
        var actor = e.actor === "ai" ? '<span class="actor-ai">ИИ</span>' : '<span class="actor-human">Менеджер</span>';
        return '<div class="journal-row"><span class="time">' + esc(e.t) + '</span><span class="body">' + actor + ' <span class="detail">' + esc(e.text) + '</span></span></div>';
      }).join("") + '</div>' +
      '<div class="divider"></div>' +
      '<div class="field"><label class="field-label" for="leadStageSel">Стадия</label><select class="select" id="leadStageSel" data-lead-id="' + esc(lead.id) + '">' + D.STAGES.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === lead.stageId ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join("") + '</select></div>' +
      '<div class="row"><button class="btn btn-secondary btn-sm" id="leadOpenDialog" data-lead-id="' + esc(lead.id) + '">' + icon("arrow-right", { size: 14 }) + 'Открыть диалог</button>' +
      '<button class="btn btn-secondary btn-sm" id="leadMakeDoc" data-lead-id="' + esc(lead.id) + '">' + icon("file-text", { size: 14 }) + 'Документ</button>' +
      '<div class="spacer"></div><button class="btn btn-destructive btn-sm" id="delLeadBtn" data-lead-id="' + esc(lead.id) + '" title="Удалить лид">' + icon("trash-2", { size: 14 }) + 'Удалить</button></div>'
    ) : H.empty("Лид не выбран", "Выберите лид из журнала или канбана.", "users");
    return '<div class="grid" style="grid-template-columns:1.4fr 1fr;align-items:start">' +
      H.card('<div class="row" style="margin-bottom:8px">' + H.sectionLabel("Журнал смены") + '<div class="spacer"></div><span class="badge">' + events.length + ' событий</span></div><div class="journal">' + journal + '</div>') +
      '<div><div class="section-label" style="margin-bottom:10px">Инспектор лида</div>' + inspector + '</div>' +
      '</div>';
  }

  function stageBadge(stageId) {
    var s = D.STAGES.filter(function (x) { return x.id === stageId; })[0];
    return '<span class="badge"><span class="dot dot-accent"></span>' + esc(s ? s.name : "—") + '</span>';
  }

  function crmKanban(funnelId) {
    var stages = D.STAGES;
    var cols = stages.map(function (s) {
      var cards = D.LEADS.filter(function (l) { return l.stageId === s.id && l.funnelId === funnelId; }).map(function (l) {
        var crit = l.note && l.note.indexOf("Эскалация") >= 0;
        return '<div class="kanban-card" draggable="true" data-lead="' + esc(l.id) + '">' +
          '<div class="name">' + esc(l.name) + '</div>' +
          '<div class="meta">' + icon(D.CHANNELS[l.channel].icon, { size: 13 }) + '<span class="mono">' + esc(l.id) + '</span>' +
          (crit ? '<span class="tag-critical"><span class="dot dot-critical"></span>КРИТИЧНО</span>' : '') + '</div></div>';
      }).join("");
      return '<div class="kanban-col" data-stage="' + s.id + '"><div class="kanban-col-head"><span class="name">' + esc(s.name) + '</span><span class="count">' + D.LEADS.filter(function (l) { return l.stageId === s.id && l.funnelId === funnelId; }).length + '</span></div>' + cards + '</div>';
    }).join("");
    return '<div class="kanban">' + cols + '</div>';
  }

  var CRM_SORTS = [["id", "ID"], ["name", "Имя"], ["activity", "Активность"]];
  function crmTable(funnelId) {
    var f = AIWS.store.crmStageFilter || "all", sort = AIWS.store.crmSort || "id";
    var leads = D.LEADS.filter(function (l) { return l.funnelId === funnelId && (f === "all" || l.stageId === f); }).slice();
    leads.sort(function (x, y) {
      if (sort === "name") return x.name.localeCompare(y.name, "ru");
      if (sort === "activity") return String(y.lastActivity || "").localeCompare(String(x.lastActivity || ""), "ru");
      return x.id.localeCompare(y.id, "ru", { numeric: true });
    });
    var rows = leads.map(function (l) {
      return '<tr data-lead="' + esc(l.id) + '" tabindex="0"><td class="num">' + esc(l.id) + '</td><td>' + esc(l.name) + '</td><td>' + icon(D.CHANNELS[l.channel].icon, { size: 13 }) + ' ' + esc(D.CHANNELS[l.channel].name) + '</td><td>' + stageBadge(l.stageId) + '</td><td>' + esc(agentName(l.agentId)) + '</td><td class="num">' + esc(l.lastActivity) + '</td></tr>';
    }).join("") || '<tr><td colspan="6" class="muted">Нет лидов на выбранной стадии</td></tr>';
    var sortName = CRM_SORTS.filter(function (x) { return x[0] === sort; })[0][1];
    function chip(id, name) { return '<button class="chip' + (f === id ? " chip-accent" : "") + '" data-filter="' + esc(id) + '" aria-pressed="' + (f === id) + '">' + esc(name) + '</button>'; }
    return '<div class="row" style="margin-bottom:12px;gap:8px"><span class="section-label">Фильтр:</span>' +
      chip("all", "Все") + D.STAGES.map(function (s) { return chip(s.id, s.name); }).join("") +
      '<div class="spacer"></div><button class="btn btn-secondary btn-sm" id="crmSortBtn" title="Сменить сортировку">' + icon("filter", { size: 14 }) + 'Сортировка: ' + esc(sortName) + '</button></div>' +
      '<div class="table-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>ID</th><th>Лид</th><th>Канал</th><th>Стадия</th><th>Агент</th><th>Активность</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* =========================================================== Bindings */
  function bind(route) {
    if (route === "overview") {
      var r = el2("ovRefresh"); if (r) r.addEventListener("click", function () { toast("Данные обновлены (демо)"); });
      document.querySelectorAll("[data-onboard]").forEach(function (s) {
        s.addEventListener("click", function () { AIWS.db.toggleOnboarding(s.getAttribute("data-onboard")); });
        s.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); AIWS.db.toggleOnboarding(s.getAttribute("data-onboard")); } });
      });
    }
    if (route === "agents") {
      var na = el2("newAgentBtn"); if (na) na.addEventListener("click", wizardModal);
      document.querySelectorAll("[data-agent]").forEach(function (b) {
        b.addEventListener("click", function () { AIWS.setState({ route: "agents", agentDetail: b.getAttribute("data-agent"), agentTab: "instruction" }); });
      });
    }
    if (route === "agents" && AIWS.store.agentDetail) {
      var curAgent = function () { return D.AGENTS.filter(function (x) { return x.id === AIWS.store.agentDetail; })[0]; };
      var asv = el2("agentSave"); if (asv) asv.addEventListener("click", function () {
        var ag = curAgent(), ta = el2("agentInstr"); if (!ag || !ta || !ta.value.trim()) { toast("Инструкция не может быть пустой"); return; }
        if (AIWS.db.updateAgent(ag.id, { instruction: ta.value.trim() })) toast("Инструкция сохранена");
        else toast("Не удалось сохранить: инструкция слишком длинная");
      });
      var apz = el2("agentPause"); if (apz) apz.addEventListener("click", function () {
        var ag = curAgent(); if (!ag) return;
        var st = ag.status === "offline" ? "online" : "offline";
        AIWS.db.updateAgent(ag.id, { status: st });
        toast(st === "offline" ? "Сотрудник приостановлен" : "Сотрудник возобновил работу");
      });
      var back = el2("backToAgents"); if (back) back.addEventListener("click", function () { AIWS.setState({ agentDetail: null }); });
      document.querySelectorAll("[data-tab]").forEach(function (t) {
        t.addEventListener("click", function () { AIWS.setState({ agentTab: t.getAttribute("data-tab") }); });
      });
      var ts = el2("testSend"), ti = el2("testInput");
      if (ts) ts.addEventListener("click", sendTestMsg);
      if (ti) ti.addEventListener("keydown", function (e) { if (e.key === "Enter") sendTestMsg(); });
    }
    if (route === "dialogs") {
      document.querySelectorAll("[data-conv]").forEach(function (c) {
        c.addEventListener("click", function () { AIWS.setState({ selectedConv: c.getAttribute("data-conv"), chatListOpen: false }); });
      });
      var cb = el2("chatBack"); if (cb) cb.addEventListener("click", function () { AIWS.setState({ chatListOpen: true }); });
      var oc = el2("ctxOpenCrm"); if (oc) oc.addEventListener("click", function () {
        var cv = D.CONVERSATIONS.filter(function (c) { return c.id === openConvId(); })[0];
        var lead = cv && D.LEADS.filter(function (l) { return l.name === cv.contactName; })[0];
        if (!lead) { toast("Для этого контакта нет лида в CRM"); return; }
        AIWS.go("crm", { crmView: "journal", selectedLead: lead.id, crmFunnel: lead.funnelId });
      });
      var to = el2("takeOver"); if (to) to.addEventListener("click", function () { AIWS.db.setConvMode(openConvId(), "human"); });
      var gb = el2("giveBack"); if (gb) gb.addEventListener("click", function () { AIWS.db.setConvMode(openConvId(), "ai"); });
      var send = el2("msgSend"), inp = el2("msgInput");
      if (send) send.addEventListener("click", function () { pushHumanMsg(inp); });
      if (inp) inp.addEventListener("keydown", function (e) { if (e.key === "Enter") pushHumanMsg(inp); });
    }
    if (route === "crm") {
      document.querySelectorAll("[data-view]").forEach(function (s) {
        s.addEventListener("click", function () { AIWS.setState({ crmView: s.getAttribute("data-view") }); });
      });
      var fs = el2("crmFunnel"); if (fs) fs.addEventListener("change", function () { AIWS.setState({ crmFunnel: fs.value }); });
      document.querySelectorAll("[data-lead]").forEach(function (a) {
        if (a.classList.contains("kanban-card")) return;
        var pick = function () { AIWS.setState(a.tagName === "TR" ? { selectedLead: a.getAttribute("data-lead"), crmView: "journal" } : { selectedLead: a.getAttribute("data-lead") }); };
        a.addEventListener("click", pick);
        if (a.tagName === "TR") a.addEventListener("keydown", function (e) { if (e.key === "Enter") pick(); });
      });
      document.querySelectorAll("[data-filter]").forEach(function (b) {
        b.addEventListener("click", function () { AIWS.setState({ crmStageFilter: b.getAttribute("data-filter") }); });
      });
      var sbtn = el2("crmSortBtn"); if (sbtn) sbtn.addEventListener("click", function () {
        var cur = AIWS.store.crmSort || "id", i = 0;
        CRM_SORTS.forEach(function (x, n) { if (x[0] === cur) i = n; });
        AIWS.setState({ crmSort: CRM_SORTS[(i + 1) % CRM_SORTS.length][0] });
      });
      var lss = el2("leadStageSel"); if (lss) lss.addEventListener("change", function () {
        AIWS.db.moveLeadStage(lss.getAttribute("data-lead-id"), lss.value); toast("Стадия изменена");
      });
      var od = el2("leadOpenDialog"); if (od) od.addEventListener("click", function () {
        var lead = D.LEADS.filter(function (l) { return l.id === od.getAttribute("data-lead-id"); })[0];
        var cv = lead && D.CONVERSATIONS.filter(function (c) { return c.contactName === lead.name; })[0];
        if (!cv) { toast("Для этого лида нет диалога"); return; }
        AIWS.go("dialogs", { selectedConv: cv.id });
      });
      var md = el2("leadMakeDoc"); if (md) md.addEventListener("click", function () {
        var lead = D.LEADS.filter(function (l) { return l.id === md.getAttribute("data-lead-id"); })[0];
        AIWS.go("docs");
        setTimeout(function () { if (AIWS.openDocModal) AIWS.openDocModal(lead ? lead.name : null); }, 30);
      });
      var nl = el2("newLeadBtn"); if (nl) nl.addEventListener("click", openLeadModal);
      var dl = el2("delLeadBtn"); if (dl) dl.addEventListener("click", function () {
        // удаляем именно тот лид, что показан в инспекторе (id в атрибуте), и только после подтверждения
        var id = dl.getAttribute("data-lead-id"); if (!id) return;
        var lead = D.LEADS.filter(function (l) { return l.id === id; })[0];
        var ui = AIWS.ui;
        var ov = ui.openModal({ title: "Удалить лид?",
          body: '<p>Лид «' + esc(lead ? lead.name : id) + '» (' + esc(id) + ') будет удалён без возможности восстановления.</p>',
          footer: '<button class="btn btn-ghost" data-modal-close>Отмена</button><button class="btn btn-destructive" id="delLeadOk">Удалить</button>' });
        ov.querySelector("#delLeadOk").addEventListener("click", function () {
          ui.closeModal(); AIWS.db.deleteLead(id); toast("Лид удалён");
        });
      });
      bindKanbanDnd();
    }
  }

  var typSeq = 0;
  function sendTestMsg() {
    var inp = el2("testInput"); if (!inp || !inp.value.trim()) return;
    var host = el2("testChat");
    host.insertAdjacentHTML("beforeend", '<div class="msg msg-client">' + esc(inp.value) + '<div class="meta">Клиент</div></div>');
    var q = inp.value; inp.value = "";
    var role = (function () { var a = D.AGENTS.filter(function (x) { return x.id === AIWS.store.agentDetail; })[0]; return a ? a.role : "sales"; })();
    var typing = document.createElement("div");
    var typId = "testTyping-" + (++typSeq);
    typing.className = "msg msg-typing"; typing.id = typId; typing.textContent = "ИИ печатает…";
    host.appendChild(typing); host.scrollTop = host.scrollHeight;
    setTimeout(function () {
      var t = el2(typId); if (t) t.remove();
      host = el2("testChat"); if (!host) return;   // экран могли перерисовать/покинуть
      var reply = AIWS.scriptedReply ? AIWS.scriptedReply(role, q) : 'Ответ по сценарию (демо).';
      host.insertAdjacentHTML("beforeend", '<div class="msg msg-ai">' + esc(reply) + '<div class="meta">ИИ</div></div>');
      host.scrollTop = host.scrollHeight;
    }, 900);
  }

  function pushHumanMsg(inp) {
    if (!inp || !inp.value.trim()) return;
    var text = inp.value.trim();
    var convId = openConvId();
    inp.value = "";
    // ответ менеджера переводит диалог в «ИИ в режиме чтения»; время — реальное, не «сейчас»
    AIWS.db.addMessage(convId, { from: "human", text: text, time: AIWS.db.nowHM() }, { mode: "reading" });
  }
  function openConvId() { var h = el2("threadMsgs"); return h ? h.getAttribute("data-convid") : AIWS.store.selectedConv; }

  function bindKanbanDnd() {
    var cards = document.querySelectorAll(".kanban-card");
    var cols = document.querySelectorAll(".kanban-col");
    cards.forEach(function (card) {
      card.addEventListener("dragstart", function (e) { card.classList.add("dragging"); e.dataTransfer.setData("text/plain", card.getAttribute("data-lead")); e.dataTransfer.effectAllowed = "move"; });
      card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
      // клик / Enter по карточке открывает лид в журнале с инспектором (и это клавиатурная альтернатива перетаскиванию:
      // стадию можно сменить списком «Стадия» в инспекторе)
      card.addEventListener("click", function () { AIWS.setState({ selectedLead: card.getAttribute("data-lead"), crmView: "journal" }); });
    });
    cols.forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("drag-over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault(); col.classList.remove("drag-over");
        var id = e.dataTransfer.getData("text/plain");
        var stage = col.getAttribute("data-stage");
        if (id && stage) { AIWS.db.moveLeadStage(id, stage); }
      });
    });
  }

  AIWS.afterRender = function (route) {
    // route-specific routing for agents detail
    if (route === "agents" && AIWS.store.agentDetail) { /* detail already rendered via wrapper */ }
    bind(route);
  };

  /* ----------------------------------------------------------- Register */
  // agents route wrapper (list vs detail)
  AIWS.registerSection("overview", overview);
  AIWS.registerSection("agents", function () { return AIWS.store.agentDetail ? agentDetail(AIWS.store.agentDetail) : agents(); });
  AIWS.registerSection("dialogs", dialogs);
  AIWS.registerSection("crm", crm);
})(typeof window !== "undefined" ? window : this);
