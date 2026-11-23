/* =========================================================================
   sections3.js — разделы: Календарь, Задачи (+ уведомления живут в topbar).
   Регистрируется через AIWS.registerSection, bind3 цепляется к afterRender.
   ========================================================================= */
(function (global) {
  "use strict";

  var AIWS = global.AIWS;
  var icon = AIWS.icon;
  var D = AIWS.data;
  var T = D.I18N;
  var esc = AIWS.helpers.esc;
  var H = AIWS.H;
  var el2 = function (id) { return document.getElementById(id); };
  var toast = AIWS.toast;

  var prevAfter = AIWS.afterRender;
  AIWS.afterRender = function (route) { if (prevAfter) prevAfter(route); bind3(route); };

  var MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function todayStr() { var t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); }
  /* =========================================================== iCalendar (RFC 5545) */
  var EV_TYPE_RU = { call: "Звонок", deadline: "Срок", meeting: "Встреча", training: "Обучение" };
  function utcStamp(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"; }
  function floatStamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; }   // «плавающее» локальное время
  function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n|\r/g, "\\n"); }
  // Строгий разбор даты/времени: ГГГГ-ММ-ДД и Ч:ММ / ЧЧ:ММ; несуществующие даты (30 февраля, 25:00) отклоняются.
  function parseStart(date, time) {
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date == null ? "" : date));
    var tm = /^(\d{1,2}):(\d{2})$/.exec(String(time == null || time === "" ? "09:00" : time));
    if (!dm || !tm) return null;
    var y = +dm[1], mo = +dm[2], d = +dm[3], h = +tm[1], mi = +tm[2];
    if (h > 23 || mi > 59) return null;
    var dt = new Date(y, mo - 1, d, h, mi, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  // «45 мин», «2 ч», «1 ч 30 мин», «1,5 часа», «90» (минуты) -> минуты; нераспознанное/пустое -> null
  function parseDuration(s) {
    var t = String(s == null ? "" : s).toLowerCase().trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) { var n = parseInt(t, 10); return n > 0 && n <= 10080 ? n : null; }
    var re = /(\d+(?:[.,]\d+)?)\s*(ч(?:ас(?:а|ов)?)?|h(?:ours?|rs?)?|мин(?:ут[аы]?)?|min(?:utes?)?|м|m)(?![а-яёa-z])/g;
    var total = 0, found = false, m;
    while ((m = re.exec(t))) {
      var v = parseFloat(m[1].replace(",", "."));
      total += /^(ч|h)/.test(m[2]) ? v * 60 : v; found = true;
    }
    total = Math.round(total);
    return found && total > 0 && total <= 10080 ? total : null;
  }
  function addMinutes(d, m) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() + m, 0); }
  // Складывание строк: не более 75 октетов UTF-8 на строку, продолжение начинается с пробела, символы не режутся
  function foldLine(line) {
    var out = [], cur = "", bytes = 0;
    Array.from(line).forEach(function (ch) {
      var cp = ch.codePointAt(0), n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + n > 75) { out.push(cur); cur = " "; bytes = 1; }
      cur += ch; bytes += n;
    });
    out.push(cur);
    return out.join("\r\n");
  }
  // Возвращает { text, count, skipped:[id…] }. События с некорректной датой/id/названием или дубли пропускаются.
  function buildICS(events, now) {
    var stamp = utcStamp(now || new Date());          // DTSTAMP обязан быть в UTC (с «Z») и одинаковым для всего файла
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + AIWS.config.APP_NAME + "//Demo//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + AIWS.config.APP_NAME + " (демо)"];
    var count = 0, skipped = [], seen = {};
    events.forEach(function (e) {
      var start = e ? parseStart(e.date, e.time) : null;
      var uid = e && typeof e.id === "string" && /^[A-Za-z0-9_-]+$/.test(e.id) ? e.id : null;
      if (!start || !uid || !e.title || seen[uid]) { skipped.push(e && e.id ? String(e.id) : "?"); return; }
      seen[uid] = 1;
      var dur = parseDuration(e.duration), end = null;
      if (dur != null) end = addMinutes(start, dur);
      else if (e.type !== "deadline") end = addMinutes(start, 60);   // срок без длительности — точка во времени (без DTEND)
      lines.push("BEGIN:VEVENT", "UID:" + uid + "@aiworkspace", "DTSTAMP:" + stamp, "DTSTART:" + floatStamp(start));
      if (end) lines.push("DTEND:" + floatStamp(end));
      lines.push("SUMMARY:" + icsEscape(e.title));
      lines.push("DESCRIPTION:" + icsEscape("Тип: " + (EV_TYPE_RU[e.type] || "Событие") + " · Исполнитель: " + (e.assignee || "—")));
      lines.push("END:VEVENT");
      count++;
    });
    lines.push("END:VCALENDAR");
    return { text: lines.map(foldLine).join("\r\n") + "\r\n", count: count, skipped: skipped };
  }
  AIWS.ics = { build: buildICS, parseStart: parseStart, parseDuration: parseDuration, fold: foldLine };
  function exportICS() {
    var r = buildICS(D.CALENDAR_EVENTS);
    if (!r.count) { toast("Нет событий с корректной датой для экспорта"); return; }
    var blob = new Blob([r.text], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai-workspace-calendar.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast("Экспортировано событий: " + r.count + (r.skipped.length ? ", пропущено (некорректная дата или данные): " + r.skipped.length : ""));
  }

  /* =========================================================== Задачи */
  function tasks() {
    var f = AIWS.store.taskFilter || "all";
    var view = AIWS.store.taskView || "list";
    var list = D.TASKS.filter(function (t) {
      if (f === "active") return !t.done;
      if (f === "done") return t.done;
      return true;
    });
    var today = todayStr();
    var total = D.TASKS.length;
    var active = D.TASKS.filter(function (t) { return !t.done; }).length;
    var doneN = D.TASKS.filter(function (t) { return t.done; }).length;
    var overdue = D.TASKS.filter(function (t) { return !t.done && t.due && t.due < today; }).length;

    function pri(t) {
      if (t.priority === "high") return '<span class="badge"><span class="dot dot-accent"></span><b>Высокий</b></span>';
      if (t.priority === "med") return '<span class="badge"><span class="dot dot-outline"></span>Средний</span>';
      return '<span class="badge"><span class="dot" style="background:var(--muted-foreground)"></span>Низкий</span>';
    }
    function dueBadge(t) {
      if (!t.due) return '<span class="muted" style="font-size:12px">—</span>';
      // просрочка: не только цвет — точка + текст «Просрочено» (в тёмной теме critical не используется как цвет мелкого текста)
      if (!t.done && t.due < today) return '<span class="tag-critical" style="font-size:12px"><span class="dot dot-critical"></span>Просрочено · ' + esc(t.due) + '</span>';
      return '<span class="muted" style="font-size:12px">' + esc(t.due) + '</span>';
    }

    var rows = list.map(function (t) {
      return '<div class="task-row' + (t.done ? " done" : "") + '">' +
        '<button class="task-check' + (t.done ? " on" : "") + '" data-tasktoggle="' + esc(t.id) + '" aria-label="Готово">' + (t.done ? icon("check", { size: 14 }) : "") + '</button>' +
        '<div class="task-main"><div class="task-title">' + esc(t.title) + '</div>' +
        '<div class="task-meta"><span class="chip">' + esc(t.tag) + '</span>' + pri(t) +
        '<span class="muted" style="font-size:12px">' + icon("user", { size: 12 }) + ' ' + esc(t.assignee) + '</span>' +
        dueBadge(t) + '</div></div>' +
        '<button class="btn btn-ghost btn-sm" data-taskdel="' + esc(t.id) + '" aria-label="Удалить" title="Удалить">' + icon("x", { size: 14 }) + '</button>' +
      '</div>';
    }).join("");

    function boardHtml() {
      var pris = [["high","Высокий","dot-critical"],["med","Средний","dot-accent"],["low","Низкий",""]];
      var cols = pris.map(function (p) {
        var items = list.filter(function (t) { return t.priority === p[0]; });
        var cards = items.map(function (t) {
          return '<div class="kanban-card' + (t.done ? " card-done" : "") + '" draggable="true" data-task="' + esc(t.id) + '">' +
            '<button class="task-check' + (t.done ? " on" : "") + '" data-tasktoggle="' + esc(t.id) + '" aria-label="Готово">' + (t.done ? icon("check", { size: 14 }) : "") + '</button>' +
            '<div class="task-card-body"><div class="task-title' + (t.done ? " done" : "") + '">' + esc(t.title) + '</div>' +
            '<div class="task-card-meta"><span class="chip" style="font-size:10px">' + esc(t.tag) + '</span>' +
            '<span class="muted" style="font-size:11px">' + icon("user", { size: 11 }) + ' ' + esc(t.assignee) + '</span>' +
            '<span class="muted" style="font-size:11px">' + esc(t.due || "—") + '</span></div></div>' +
          '</div>';
        }).join("");
        return '<div class="kanban-col" data-priority="' + p[0] + '"><div class="kanban-col-head"><span class="name"><span class="dot ' + p[2] + '"></span>' + esc(p[1]) + '</span><span class="count">' + items.length + '</span></div>' +
          '<div class="kanban-cards">' + (cards || '<div class="kanban-empty muted">Перетащите карточку сюда</div>') + '</div></div>';
      }).join("");
      return '<div class="kanban">' + cols + '</div>';
    }

    return H.pageHead("Задачи", "Дедлайны команды и ИИ-сотрудников",
      '<div class="segmented">' +
        [["list","Список"],["board","Доска"]].map(function (v) {
          return '<button class="seg' + (view === v[0] ? " active" : "") + '" data-taskview="' + v[0] + '">' + esc(v[1]) + '</button>';
        }).join("") + '</div>' +
      '<div class="segmented">' +
        [["all","Все"],["active","Активные"],["done","Выполненные"]].map(function (s) {
          return '<button class="seg' + (f === s[0] ? " active" : "") + '" data-taskfilter="' + s[0] + '">' + esc(s[1]) + '</button>';
        }).join("") + '</div>' +
      '<button class="btn btn-primary" id="newTask">' + icon("plus", { size: 16 }) + 'Новая задача</button>') +
    '<div class="grid grid-4" style="margin-bottom:20px">' +
      H.card('<div class="kpi-label">Всего</div><div class="kpi-num">' + total + '</div>') +
      H.card('<div class="kpi-label">Активные</div><div class="kpi-num">' + active + '</div>') +
      H.card('<div class="kpi-label">Выполнено</div><div class="kpi-num">' + doneN + '</div>') +
      H.card('<div class="kpi-label">Просрочено' + (overdue ? ' <span class="tag-critical"><span class="dot dot-critical"></span></span>' : '') + '</div><div class="kpi-num">' + overdue + '</div>') +
    '</div>' +
    (view === "board"
      ? '<div class="kanban-scroll">' + boardHtml() + '</div>'
      : H.card('<div class="task-list">' + (rows || H.empty("Нет задач", "Создайте первую задачу или смените фильтр.", "check-square")) + '</div>'));
  }

  function openTaskModal() {
    var ui = AIWS.ui;
    var body = '<div class="stack">' +
      '<label class="field"><span class="field-label">Что сделать</span><input class="input" id="tkTitle" placeholder="Напр. Отправить КП клиенту"/></label>' +
      '<div class="grid grid-2">' +
      '<label class="field"><span class="field-label">Приоритет</span><select class="input" id="tkPri"><option value="high">Высокий</option><option value="med" selected>Средний</option><option value="low">Низкий</option></select></label>' +
      '<label class="field"><span class="field-label">Срок</span><input class="input" id="tkDue" type="date"/></label>' +
      '<label class="field"><span class="field-label">Исполнитель</span><select class="input" id="tkAssign"><option>Менеджер</option><option>ИИ-Продажи</option><option>ИИ-Снабжение</option><option>ИИ-РОП</option><option>Бухгалтерия</option></select></label>' +
      '<label class="field"><span class="field-label">Раздел</span><select class="input" id="tkTag"><option>CRM</option><option>Документы</option><option>Диалоги</option><option>Снабжение</option><option>Команда</option></select></label>' +
      '</div></div>';
    var foot = '<button class="btn btn-secondary" id="tkCancel">Отмена</button><button class="btn btn-primary" id="tkSave">Создать</button>';
    ui.openModal({ title: "Новая задача", body: body, footer: foot });
    var cancel = el2("tkCancel"); if (cancel) cancel.addEventListener("click", ui.closeModal);
    var save = el2("tkSave");
    if (save) save.addEventListener("click", function () {
      var title = (el2("tkTitle").value || "").trim();
      if (!title) { toast("Введите название задачи"); return; }
      AIWS.db.addTask({
        title: title,
        priority: el2("tkPri").value,
        due: el2("tkDue").value,
        assignee: el2("tkAssign").value,
        tag: el2("tkTag").value
      });
      ui.closeModal();
      toast("Задача создана");
    });
  }

  /* =========================================================== Календарь */
  function calendar() {
    var off = AIWS.store.calMonth || 0;
    var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + off);
    var y = base.getFullYear(), m = base.getMonth();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var firstWD = (new Date(y, m, 1).getDay() + 6) % 7; // Пн=0
    var today = todayStr();

    var EV_IC = { call: "phone", deadline: "alert-triangle", meeting: "users", training: "graduation-cap" };
    var EV_CL = { call: "dot-accent", deadline: "dot-critical", meeting: "dot-status", training: "" };

    function eventsOn(dayStr) { return D.CALENDAR_EVENTS.filter(function (e) { return e.date === dayStr; }); }

    var cells = "";
    for (var i = 0; i < firstWD; i++) { cells += '<div class="cal-cell dim"></div>'; }
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = ymd(y, m, d);
      var evs = eventsOn(ds);
      var isToday = ds === today;
      var dots = evs.map(function (e) { return '<span class="dot ' + (EV_CL[e.type] || "dot-accent") + '"></span>'; }).join("");
      cells += '<div class="cal-cell' + (isToday ? " today" : "") + (evs.length ? " has-ev" : "") + '">' +
        '<span class="cal-day">' + d + '</span>' +
        (evs.length ? '<div class="cal-dots">' + dots + '</div>' : '') + '</div>';
    }
    // дополним до полной недели
    var total = firstWD + daysInMonth;
    var tail = (7 - (total % 7)) % 7;
    for (var k = 0; k < tail; k++) { cells += '<div class="cal-cell dim"></div>'; }

    // предстоящие события (сортировка по дате+времени)
    var upcoming = D.CALENDAR_EVENTS.slice().sort(function (a, b) {
      return (a.date + a.time) < (b.date + b.time) ? -1 : 1;
    }).slice(0, 6);
    var upRows = upcoming.map(function (e) {
      return '<div class="cal-ev-row">' +
        '<span class="cal-ev-ic ' + (EV_CL[e.type] || "dot-accent") + '">' + icon(EV_IC[e.type] || "calendar", { size: 16 }) + '</span>' +
        '<div class="cal-ev-body"><div class="cal-ev-title">' + esc(e.title) + '</div>' +
        '<div class="muted" style="font-size:12px">' + esc(e.date) + ' · ' + esc(e.time) + (e.duration ? ' · ' + esc(e.duration) : '') + ' · ' + esc(e.assignee) + '</div></div>' +
      '</div>';
    }).join("");

    return H.pageHead("Календарь", "Встречи, дедлайны и обучение команды",
      '<div class="row" style="gap:8px">' +
        '<button class="icon-btn" id="calPrev" aria-label="Назад">' + icon("chevron-left", { size: 16 }) + '</button>' +
        '<span class="cal-title">' + esc(MONTHS[m]) + ' ' + y + '</span>' +
        '<button class="icon-btn" id="calNext" aria-label="Вперёд">' + icon("chevron-right", { size: 16 }) + '</button>' +
        '<button class="btn btn-secondary btn-sm" id="calToday">Сегодня</button>' +
        '<button class="btn btn-secondary btn-sm" id="calExport">' + icon("download", { size: 14 }) + '.ics</button></div>') +
    '<div class="grid" style="grid-template-columns:1.6fr 1fr;align-items:start">' +
      H.card('<div class="cal-grid"><div class="cal-wd">' + WD.map(function (w) { return '<span>' + esc(w) + '</span>'; }).join("") + '</div>' +
        '<div class="cal-cells">' + cells + '</div></div>') +
      H.card('<div class="row" style="margin-bottom:12px">' + H.sectionLabel("Ближайшие события") + '<div class="spacer"></div>' + H.demo() + '</div>' +
        '<div class="cal-ev-list">' + (upRows || H.empty("Нет событий", "Запланируйте встречу или дедлайн.", "calendar")) + '</div>') +
    '</div>';
  }

  /* ----------------------------------------------------------- Bindings */
  function bind3(route) {
    if (route === "tasks") {
      var nt = el2("newTask"); if (nt) nt.addEventListener("click", openTaskModal);
      document.querySelectorAll("[data-taskview]").forEach(function (b) {
        b.addEventListener("click", function () { AIWS.setState({ taskView: b.getAttribute("data-taskview") }); });
      });
      document.querySelectorAll("[data-taskfilter]").forEach(function (b) {
        b.addEventListener("click", function () { AIWS.setState({ taskFilter: b.getAttribute("data-taskfilter") }); });
      });
      document.querySelectorAll("[data-tasktoggle]").forEach(function (b) {
        b.addEventListener("click", function () { AIWS.db.toggleTask(b.getAttribute("data-tasktoggle")); });
      });
      document.querySelectorAll("[data-taskdel]").forEach(function (b) {
        b.addEventListener("click", function () { AIWS.db.deleteTask(b.getAttribute("data-taskdel")); toast("Задача удалена"); });
      });
      // DnD доски (как канбан CRM): перетаскиваем карточку между колонками приоритетов
      document.querySelectorAll(".kanban-card[data-task]").forEach(function (card) {
        card.addEventListener("dragstart", function (e) { card.classList.add("dragging"); e.dataTransfer.setData("text/plain", card.getAttribute("data-task")); e.dataTransfer.effectAllowed = "move"; });
        card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
      });
      document.querySelectorAll(".kanban-col[data-priority]").forEach(function (col) {
        col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drag-over"); });
        col.addEventListener("dragleave", function () { col.classList.remove("drag-over"); });
        col.addEventListener("drop", function (e) {
          e.preventDefault(); col.classList.remove("drag-over");
          var id = e.dataTransfer.getData("text/plain");
          var pri = col.getAttribute("data-priority");
          if (id && pri) { AIWS.db.updateTask(id, { priority: pri }); toast("Приоритет изменён"); }
        });
      });
    }
    if (route === "calendar") {
      var cp = el2("calPrev"), cn = el2("calNext"), ct = el2("calToday");
      if (cp) cp.addEventListener("click", function () { AIWS.setState({ calMonth: (AIWS.store.calMonth || 0) - 1 }); });
      if (cn) cn.addEventListener("click", function () { AIWS.setState({ calMonth: (AIWS.store.calMonth || 0) + 1 }); });
      if (ct) ct.addEventListener("click", function () { AIWS.setState({ calMonth: 0 }); });
      var ce = el2("calExport"); if (ce) ce.addEventListener("click", exportICS);
    }
  }

  AIWS.registerSection("tasks", tasks);
  AIWS.registerSection("calendar", calendar);
})(typeof window !== "undefined" ? window : this);
