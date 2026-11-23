/* =========================================================================
   sections2.js — разделы 5–13: Лиды/автокасания, Документы/согласование,
   Хранилище/БЗ, Команда(цепочки), Снабжение, Обучение(HR), Аналитика(РОП),
   Интеграции, Настройки, Помощь.
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

  // wrap the existing afterRender so section-specific bindings also run
  var prevAfter = AIWS.afterRender;
  AIWS.afterRender = function (route) {
    if (prevAfter) prevAfter(route);
    bind2(route);
  };

  /* =========================================================== 5. Лиды и автокасания */
  function leads() {
    var step = AIWS.store.importerStep || "drop";
    var imported = D.LEADS.filter(function (l) { return l.events.some(function (e) { return /Импортирован/.test(e.text); }); }).length;
    var html = H.pageHead("Лиды и автокасания", "Импорт базы и сценарий реактивации",
      '<button class="btn btn-secondary" id="leadsTemplate">' + icon("download", { size: 16 }) + 'Шаблон (CSV)</button>');
    html += H.card('<div class="row" style="margin-bottom:10px"><h3 style="font-size:15px">Импорт из Excel и CSV</h3></div>' + importerBody(step));
    // Reactivation scenario
    html += '<div style="margin-top:20px">' + H.sectionLabel("Сценарий реактивации базы") + H.card(
      '<div class="chain">' +
      chainNode("Пользователь", "Контакты из базы") +
      chainArrow() +
      chainNode("ИИ · Продажи", "Автокасания по сценарию") +
      chainArrow() +
      chainNode("Менеджер", "Передача заинтересованных") +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="grid grid-3">' +
      H.card('<div class="kpi-label">Импортировано контактов</div>' + (imported ? '<div class="kpi-num">' + imported + '</div><div class="hint-line">Лиды из файлов, в CRM</div>' : '<div class="kpi-num">—</div><div class="hint-line">Импортируйте файл</div>')) +
      H.card('<div class="kpi-label">Автокасаний запущено</div><div class="kpi-num">—</div><div class="hint-line">Автокасания появятся позже (демо)</div>') +
      H.card('<div class="kpi-label">Передано менеджеру</div><div class="kpi-num">—</div><div class="hint-line">По ответу клиента</div>') +
      '</div>'
    ) + '</div>';
    return html;
  }

  function importerBody(step) {
    var st = AIWS.store.importData, I = AIWS.importer;
    if (step === "loading") return '<div class="state" role="status">' + icon("refresh", { size: 30 }) + '<div class="t">Читаю файл «' + esc(AIWS.store.importFileName || "") + '»…</div><div class="d">Это занимает несколько секунд</div></div>';
    if (step === "error") return '<div class="state" role="alert">' + icon("alert-triangle", { size: 30 }) + '<div class="t">Не удалось импортировать</div><div class="d">' + esc(AIWS.store.importError || "Неизвестная ошибка") + '</div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" id="resetImport">Выбрать другой файл</button></div>';
    if (step === "done") {
      var r = AIWS.store.importResult || { created: 0, noName: 0, dup: 0 };
      var fn = D.FUNNELS.filter(function (f) { return f.id === r.funnelId; })[0];
      return '<div class="state" role="status">' + icon("check", { size: 30 }) + '<div class="t">Импортировано лидов: ' + esc(r.created) + '</div>' +
        '<div class="d">Пропущено: без имени — ' + esc(r.noName) + ', повторов — ' + esc(r.dup) + '. Лиды добавлены в воронку «' + esc(fn ? fn.name : "—") + '».</div>' +
        '<div class="row" style="justify-content:center;gap:8px;margin-top:8px"><button class="btn btn-secondary btn-sm" id="openImported">Открыть в CRM</button>' +
        '<button class="btn btn-ghost btn-sm" id="resetImport">Импортировать ещё</button></div></div>';
    }
    if (step === "map" && st) {
      var head = '<tr>' + st.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join("") + '</tr>';
      var body = st.rows.slice(0, 5).map(function (row) { return '<tr>' + row.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join("") + '</tr>'; }).join("");
      var maps = st.headers.map(function (h, i) {
        var sample = st.rows[0] ? st.rows[0][i] : "";
        return '<div class="field"><label class="field-label" for="map-' + i + '">' + esc(h) + (sample ? ' <span class="muted">(пример: ' + esc(sample.length > 24 ? sample.slice(0, 24) + "…" : sample) + ')</span>' : '') + '</label>' +
          '<select class="select" id="map-' + i + '" data-mapcol="' + i + '">' + I.FIELDS.map(function (f) { return '<option value="' + f[0] + '"' + (st.mapping[i] === f[0] ? " selected" : "") + '>' + esc(f[1]) + '</option>'; }).join("") + '</select></div>';
      }).join("");
      var funnels = D.FUNNELS.map(function (f) { return '<option value="' + esc(f.id) + '"' + (st.funnelId === f.id ? " selected" : "") + '>' + esc(f.name) + '</option>'; }).join("");
      var chans = Object.keys(D.CHANNELS).map(function (c) { return '<option value="' + esc(c) + '"' + (st.channel === c ? " selected" : "") + '>' + esc(D.CHANNELS[c].name) + '</option>'; }).join("");
      return '<div class="muted" style="font-size:13px;margin-bottom:10px">Файл «' + esc(st.fileName) + '»: строк с данными — ' + st.total + (st.truncated ? ' (будут импортированы первые ' + I.limits.MAX_ROWS + ')' : '') + '</div>' +
        '<div class="section-label">Превью первых строк</div>' +
        '<div class="table-wrap" style="margin-bottom:14px"><div class="tbl-scroll"><table class="tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>' +
        '<div class="section-label">Сопоставление колонок</div><div class="grid grid-2" style="margin-bottom:14px">' + maps + '</div>' +
        '<div class="grid grid-2" style="margin-bottom:14px"><div class="field"><label class="field-label" for="importFunnel">Воронка</label><select class="select" id="importFunnel">' + funnels + '</select></div>' +
        '<div class="field"><label class="field-label" for="importChannel">Канал по умолчанию</label><select class="select" id="importChannel">' + chans + '</select></div></div>' +
        '<div class="row"><button class="btn btn-primary btn-sm" id="doImport">' + icon("check", { size: 14 }) + 'Импортировать</button><button class="btn btn-ghost btn-sm" id="resetImport">Отмена</button></div>';
    }
    return '<div class="dropzone" id="dropzone">' + icon("upload", { size: 28 }) +
      '<div class="t">Перетащите файл .xlsx или .csv сюда</div><div class="d">или нажмите, чтобы выбрать файл. До ' + I.limits.MAX_ROWS + ' строк и 5 МБ, первая строка — заголовки.</div>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:6px" id="pickFile">Выбрать файл</button></div>' +
      '<input type="file" id="importFile" accept=".xlsx,.csv" hidden aria-hidden="true" tabindex="-1">';
  }

  function handleImportFile(file) {
    if (!file) return;
    AIWS.setState({ importerStep: "loading", importFileName: file.name });
    AIWS.importer.parseFile(file).then(function (res) {
      res.fileName = file.name; res.mapping = AIWS.importer.guessMapping(res.headers); res.funnelId = "fn-sales"; res.channel = "site";
      AIWS.setState({ importerStep: "map", importData: res });
    }).catch(function (e) {
      if (e && !e.userMessage && global.console) console.error(e);
      AIWS.setState({ importerStep: "error", importError: (e && e.userMessage) || "Не удалось прочитать файл" });
    });
  }
  function doImport() {
    var st = AIWS.store.importData; if (!st) return;
    var ni = st.mapping.indexOf("name");
    if (ni < 0) { toast("Укажите колонку «Имя клиента»"); var f = el2("map-0"); if (f) f.focus(); return; }
    var list = [], seen = {}, noName = 0, dup = 0;
    st.rows.forEach(function (r) {
      var name = String(r[ni] || "").trim();
      if (!name) { noName++; return; }
      var parts = [], get = function (id) { var i = st.mapping.indexOf(id); return i < 0 ? "" : String(r[i] || "").trim(); };
      var phone = get("phone"), email = get("email"), last = get("lastContact"), note = get("note");
      if (phone) parts.push("Телефон: " + phone); if (email) parts.push("Email: " + email);
      if (last) parts.push("Последний контакт: " + last); if (note) parts.push(note);
      var key = (name + "|" + phone + "|" + email).toLowerCase();
      if (seen[key]) { dup++; return; } seen[key] = 1;
      list.push({ name: name, note: parts.join(" · ") });
    });
    if (!list.length) { toast("Нет строк с именем клиента — нечего импортировать"); return; }
    var fn = D.FUNNELS.filter(function (x) { return x.id === st.funnelId; })[0] || D.FUNNELS[0];
    var made = AIWS.db.createLeads(list, { funnelId: fn.id, agentId: fn.agentId, channel: st.channel });
    AIWS.setState({ importerStep: "done", importData: null, importResult: { created: made.length, noName: noName, dup: dup, funnelId: fn.id } });
    toast("Импортировано лидов: " + made.length);
  }
  function chainNode(role, name) {
    return '<div class="chain-node"><div class="role">' + esc(role) + '</div><div class="name">' + esc(name) + '</div></div>';
  }
  function chainArrow() { return '<div class="chain-arrow">' + icon("arrow-right", { size: 18 }) + '</div>'; }

  /* =========================================================== 6. Документы и согласование */
  function docs() {
    var filter = AIWS.store.docFilter || "all";
    var list = D.DOCUMENTS.filter(function (d) { return filter === "all" || d.status === filter; });
    var typeLabel = { invoice: "Счёт", offer: "КП", act: "Акт" };
    var html = H.pageHead("Документы и согласование", "Шаблоны, очередь согласования, отправка PDF",
      '<button class="btn btn-primary" id="newDoc">' + icon("plus", { size: 16 }) + 'Создать документ</button>');
    // Templates
    html += H.sectionLabel("Шаблоны") + '<div class="row-wrap" style="gap:8px;margin-bottom:20px">' +
      D.TEMPLATES.map(function (t) { return '<span class="chip">' + icon("file-text", { size: 14 }) + esc(t.name) + '</span>'; }).join("") + '</div>';
    // Rules
    html += '<div class="grid" style="grid-template-columns:1fr 1.6fr;align-items:start;margin-bottom:20px">' +
      H.card(H.sectionLabel("Что ИИ делает сам") +
        '<div class="stack"><div class="row"><span class="badge"><span class="dot dot-status"></span>Сам</span><span class="muted" style="font-size:12.5px">Формирует счёт по шаблону</span></div>' +
        '<div class="row"><span class="badge"><span class="dot dot-status"></span>Сам</span><span class="muted" style="font-size:12.5px">Готовит КП по тарифам</span></div>' +
        '<div class="row"><span class="badge"><span class="dot dot-accent"></span>Согласует</span><span class="muted" style="font-size:12.5px">Счёт свыше лимита</span></div></div>') +
      H.card('<div class="row" style="margin-bottom:10px">' + H.sectionLabel("Очередь согласования") + '<div class="spacer"></div>' +
        '<div class="segmented">' + [["all","Все"],["pending","На согласов."],["approved","Одобрено"],["rejected","Отклонено"]].map(function(f){return '<button class="seg'+(filter===f[0]?" active":"")+'" data-docfilter="'+f[0]+'">'+esc(f[1])+'</button>';}).join("") + '</div></div>' +
        '<div class="table-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Документ</th><th>Тип</th><th>Клиент</th><th>Согласующий</th><th>Статус</th><th></th></tr></thead><tbody>' +
        list.map(function (d) {
          var st = d.status === "approved" ? '<span class="badge"><span class="dot dot-status"></span>Одобрено</span>' :
                   d.status === "rejected" ? '<span class="badge"><span class="dot dot-critical"></span>Отклонено</span>' :
                   '<span class="badge"><span class="dot dot-accent"></span>На согласовании</span>';
          var act = '<div class="row" style="gap:6px;flex-wrap:wrap">';
          if (d.status === "pending") act += '<button class="btn btn-secondary btn-sm" data-approve="' + esc(d.id) + '">Одобрить</button><button class="btn btn-destructive btn-sm" data-reject="' + esc(d.id) + '">Отклонить</button>';
          act += '<button class="btn btn-secondary btn-sm" data-sendpdf="' + esc(d.id) + '">' + icon("download", { size: 13 }) + 'PDF</button>' +
            '<button class="btn btn-secondary btn-sm" data-printdoc="' + esc(d.id) + '">' + icon("file-text", { size: 13 }) + 'Печать</button>' +
            '<button class="btn btn-ghost btn-sm" data-docdel="' + esc(d.id) + '" aria-label="Удалить" title="Удалить">' + icon("trash-2", { size: 13 }) + '</button></div>';
          return '<tr><td class="num">' + esc(d.number) + '</td><td>' + esc(typeLabel[d.type]) + '</td><td>' + esc(d.client) + '</td><td>' + esc(d.approver) + '</td><td>' + st + '</td><td>' + act + '</td></tr>';
        }).join("") + '</tbody></table></div></div>') +
      '</div>';
    return html;
  }

  function openDocModal(prefill) {
    var pre = typeof prefill === "string" ? prefill : null;
    var ui = AIWS.ui;
    var typeOpts = [["invoice", "Счёт"], ["offer", "Коммерческое предложение"], ["act", "Акт"]];
    var clientOpts = D.LEADS.map(function (l) { return [l.name, l.name]; });
    if (!clientOpts.length) clientOpts = [["—", "—"]];
    var approverOpts = [["Менеджер продаж", "Менеджер продаж"], ["Бухгалтерия", "Бухгалтерия"], ["Руководитель", "Руководитель"]];
    var body =
      ui.field("Тип документа", ui.select("type", typeOpts, "invoice")) +
      ui.field("Клиент", ui.select("client", clientOpts, pre && clientOpts.some(function (o) { return o[0] === pre; }) ? pre : clientOpts[0][0])) +
      ui.field("Согласующий", ui.select("approver", approverOpts, "Менеджер продаж")) +
      '<div class="hint-line">' + icon("alert-triangle", { size: 13 }) + 'Сумма не запрашивается (демо). Документ уйдёт в очередь согласования.</div>';
    var foot = '<button class="btn btn-ghost" data-modal-close>Отмена</button><button class="btn btn-primary" id="docSave">Создать</button>';
    var ov = ui.openModal({ title: "Создать документ", body: body, footer: foot });
    var save = ov.querySelector("#docSave");
    if (save) save.addEventListener("click", function () {
      var type = ov.querySelector("[name=type]").value;
      var client = ov.querySelector("[name=client]").value;
      var approver = ov.querySelector("[name=approver]").value;
      ui.closeModal();
      AIWS.db.createDocument({ type: type, client: client, approver: approver });
      toast("Документ создан");
    });
  }

  AIWS.openDocModal = function (client) { openDocModal(client); };

  /* =========================================================== 7. Хранилище и база знаний */
  function storage() {
    var srcIcon = { pdf: "file-text", docx: "file-text", xlsx: "bar-chart", web: "globe", api: "code" };
    var html = H.pageHead("Хранилище и база знаний", "Описание компании и источники знаний",
      '<button class="btn btn-primary" id="addSource" data-soon="Добавление источников знаний">' + icon("plus", { size: 16 }) + 'Добавить источник</button>');
    html += '<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start;margin-bottom:20px">';
    html += H.card(H.sectionLabel("Описание компании") +
      '<div class="field"><label class="field-label">Название компании</label><input class="input" value="Демо-компания"/></div>' +
      '<div class="field"><label class="field-label">Чем занимаетесь</label><textarea class="textarea" rows="3">Демо-описание деятельности для контекста ИИ-сотрудников.</textarea></div>' +
      '<div class="field"><label class="field-label">Аудитория и предложения</label><textarea class="textarea" rows="2">Демо: целевая аудитория и ключевые предложения.</textarea></div>' +
      '<button class="btn btn-secondary btn-sm" data-soon="Сохранение описания компании">Сохранить описание</button>');
    html += H.card(H.sectionLabel("Дополнительно") +
      '<div class="row" style="justify-content:space-between;margin-bottom:10px"><div><div style="font-size:13.5px;font-weight:500">Искать в интернете</div><div class="muted" style="font-size:12px">При отсутствии ответа в базе</div></div>' +
      '<div class="switch' + (swOn("websearch", true) ? " on" : "") + '" id="webSearchSwitch" data-sw="websearch" role="switch" aria-checked="' + swOn("websearch", true) + '" tabindex="0"></div></div>' +
      '<div class="hint-line">' + icon("globe", { size: 13 }) + 'ИИ подмешивает веб-результаты с пометкой источника</div>');
    html += '</div>';
    html += H.sectionLabel("Источники знаний") +
      '<div class="table-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Источник</th><th>Тип</th><th>Статус</th><th></th></tr></thead><tbody>' +
      D.KNOWLEDGE_SOURCES.map(function (s) {
        return '<tr><td>' + icon(srcIcon[s.type], { size: 14 }) + ' ' + esc(s.name) + '</td><td class="mono" style="text-transform:uppercase">' + esc(s.type) + '</td><td>' + (s.status === "Индексировано" ? '<span class="badge"><span class="dot dot-status"></span>' + esc(s.status) + '</span>' : '<span class="badge">' + esc(s.status) + '</span>') + '</td><td><button class="btn btn-ghost btn-sm" aria-label="Настроить" data-soon="Настройка источника">' + icon("more-horizontal", { size: 14 }) + '</button></td></tr>';
      }).join("") + '</tbody></table></div></div>';
    return html;
  }

  /* =========================================================== 8. Команда (цепочки) */
  function team() {
    var tpl = AIWS.store.chainTpl || D.CHAIN_TEMPLATES[0].id;
    var html = H.pageHead("Команда", "Конструктор цепочек ИИ-сотрудников",
      '<button class="btn btn-primary" id="newChain" data-soon="Конструктор цепочек">' + icon("plus", { size: 16 }) + 'Новая цепочка</button>');
    html += '<div class="row" style="gap:8px;margin-bottom:16px">' + H.sectionLabel("Шаблоны:") +
      D.CHAIN_TEMPLATES.map(function (c) { return '<button class="chip' + (c.id === tpl ? " chip-accent" : "") + '" data-chain="' + c.id + '">' + esc(c.name) + '</button>'; }).join("") + '</div>';
    var tmpl = D.CHAIN_TEMPLATES.filter(function (c) { return c.id === tpl; })[0];
    html += H.card('<div class="row" style="margin-bottom:12px"><h3 style="font-size:15px">Цепочка: ' + esc(tmpl.name) + '</h3><div class="spacer"></div>' + H.demo() + '</div>' +
      '<div class="chain">' + tmpl.nodes.map(function (n, i) {
        return (i ? chainArrow() : "") + chainNode(n.role, n.name);
      }).join("") + chainArrow() + '<div role="button" tabindex="0" data-soon="Добавление шагов цепочки" class="chain-node" style="border-style:dashed;display:grid;place-items:center;color:var(--muted-foreground)">' + icon("plus", { size: 18 }) + 'Добавить шаг</div>' + '</div>' +
      '<div class="divider"></div>' +
      '<div class="hint-line">' + icon("git-branch", { size: 13 }) + 'Результат каждого шага передаётся следующему ИИ-сотруднику по цепочке</div>');
    return html;
  }

  /* =========================================================== 9. Снабжение */
  function supply() {
    var html = H.pageHead("Снабжение", "Запросы поставщикам и сводка условий",
      '<button class="btn btn-primary" id="newSupply" data-soon="Новый запрос поставщикам">' + icon("plus", { size: 16 }) + 'Новый запрос</button>');
    html += H.sectionLabel("Запросы") +
      '<div class="table-wrap" style="margin-bottom:20px"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>ID</th><th>Запрос</th><th>Поставщиков</th><th>Ответов</th><th>Статус</th><th></th></tr></thead><tbody>' +
      D.SUPPLY_REQUESTS.map(function (r) {
        return '<tr><td class="num">' + esc(r.id) + '</td><td>' + esc(r.item) + '</td><td class="num">' + r.suppliers + '</td><td class="num">' + r.replies + '</td><td>' + (r.status === "Сводка готова" ? '<span class="badge"><span class="dot dot-status"></span>' + esc(r.status) + '</span>' : '<span class="badge">' + esc(r.status) + '</span>') + '</td><td><button class="btn btn-secondary btn-sm" data-soon="Карточка запроса">Открыть</button></td></tr>';
      }).join("") + '</tbody></table></div></div>';
    html += H.sectionLabel("Сводная таблица условий") + H.card(
      '<div class="table-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Поставщик</th><th>Срок</th><th>Примечание</th><th></th></tr></thead><tbody>' +
      D.SUPPLY_OFFERS.map(function (o) {
        return '<tr><td>' + esc(o.supplier) + '</td><td class="num">' + esc(o.term) + '</td><td class="muted">' + esc(o.note) + '</td><td><button class="btn btn-secondary btn-sm" data-soon="Передача результата снабжения">Передать результат</button></td></tr>';
      }).join("") + '</tbody></table></div></div>' +
      '<div class="hint-line">' + icon("alert-triangle", { size: 13 }) + 'Цены не показываются (демо). ИИ готовит сравнение по сроку и условиям.</div>'
    );
    return html;
  }

  /* =========================================================== 10. Обучение (ИИ HR) */
  function training() {
    var html = H.pageHead("Обучение", "Программы из материалов хранилища, тесты, сертификаты",
      '<button class="btn btn-primary" id="newCourse" data-soon="Создание курса">' + icon("plus", { size: 16 }) + 'Создать курс</button>');
    html += '<div class="grid grid-3" style="margin-bottom:20px">';
    D.COURSES.forEach(function (c) {
      var pct = Math.round(c.progress * 100), hasQuiz = !!(D.QUIZZES && D.QUIZZES[c.id]);
      html += H.card('<div class="row" style="margin-bottom:8px"><span style="font-size:14px;font-weight:600">' + esc(c.title) + '</span><div class="spacer"></div>' + H.demo() + '</div>' +
        '<div class="muted" style="font-size:12.5px;margin-bottom:10px">' + c.lessons + ' уроков · ' + esc(c.status) + (hasQuiz ? ' · тест: ' + D.QUIZZES[c.id].length + ' вопр.' : '') + '</div>' +
        '<div class="step-bar" style="margin-top:0"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row" style="justify-content:space-between;margin-top:10px"><span class="badge">' + pct + '%</span>' +
        (c.progress === 1 ? '<button class="btn btn-secondary btn-sm" data-cert="' + esc(c.id) + '">' + icon("download", { size: 13 }) + 'Сертификат</button>'
          : hasQuiz ? '<button class="btn btn-secondary btn-sm" data-quiz="' + esc(c.id) + '">' + icon("check", { size: 13 }) + 'Пройти тест</button>'
          : '<button class="btn btn-secondary btn-sm" data-soon="Тест для курса">Пройти тест</button>') + '</div>');
    });
    html += '</div>';
    html += H.sectionLabel("Выданные сертификаты") + H.card(
      '<div class="stack">' + D.CERTIFICATES.map(function (c) {
        return '<div class="row"><span class="chip">' + icon("file-check", { size: 14 }) + esc(c.name) + '</span><span class="muted" style="font-size:12px">' + esc(c.course) + '</span><div class="spacer"></div><span class="badge">' + esc(c.date) + '</span><button class="btn btn-secondary btn-sm" data-certid="' + esc(c.id) + '">PDF</button></div>';
      }).join("") + '</div>'
    );
    return html;
  }

  // Тест: имя для сертификата -> вопросы по одному -> результат. Порог 70%; успешный результат завершает курс и выдаёт сертификат.
  function openQuiz(courseId) {
    var course = D.COURSES.filter(function (c) { return c.id === courseId; })[0], qs = D.QUIZZES && D.QUIZZES[courseId];
    if (!course || !qs) return;
    var ui = AIWS.ui, st = { name: "", i: 0, answers: [] };
    var ov = ui.openModal({ title: "Тест · " + course.title, body: "", footer: "<span></span>" });
    var body = ov.querySelector(".modal-body"), foot = ov.querySelector(".modal-foot");
    function put(b, f, focusSel) {
      body.innerHTML = b; foot.innerHTML = f;
      var t = ov.querySelector(focusSel || "input, .btn-primary"); if (t && t.focus) t.focus();
    }
    function intro() {
      put('<p class="muted" style="font-size:13px;margin:0 0 12px">Вопросов: ' + qs.length + ' · проходной балл: ' + Math.round(D.QUIZ_PASS * 100) + '%. Демо-тест по материалам курса.</p>' +
        '<div class="field"><label class="field-label" for="quizName">Имя для сертификата</label><input class="input" id="quizName" maxlength="80" autocomplete="name" placeholder="Например: Анна Смирнова" value="' + esc(st.name) + '"/></div>',
        '<button class="btn btn-ghost" data-modal-close>Отмена</button><button class="btn btn-primary" id="quizStart">Начать тест</button>', "#quizName");
      var go = function () { var v = el2("quizName").value.trim(); if (!v) { el2("quizName").focus(); toast("Введите имя для сертификата"); return; } st.name = v; st.i = 0; st.answers = []; question(); };
      el2("quizStart").addEventListener("click", go);
      el2("quizName").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    }
    function question() {
      var q = qs[st.i], last = st.i === qs.length - 1;
      put('<div class="muted" role="status" style="font-size:12px;margin-bottom:8px">Вопрос ' + (st.i + 1) + ' из ' + qs.length + '</div>' +
        '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:10px;font-size:14px">' + esc(q.q) + '</legend>' +
        q.options.map(function (o, k) { return '<label class="quiz-opt"><input type="radio" name="qa" value="' + k + '"/><span>' + esc(o) + '</span></label>'; }).join("") + '</fieldset>',
        '<button class="btn btn-ghost" data-modal-close>Отмена</button><button class="btn btn-primary" id="quizNext" disabled>' + (last ? "Завершить" : "Далее") + '</button>', 'input[type=radio]');
      var next = el2("quizNext");
      ov.querySelectorAll("input[name=qa]").forEach(function (r) { r.addEventListener("change", function () { next.disabled = false; }); });
      next.addEventListener("click", function () {
        var ch = ov.querySelector("input[name=qa]:checked"); if (!ch) return;
        st.answers.push(+ch.value); if (last) result(); else { st.i++; question(); }
      });
    }
    function result() {
      var ok = 0, missed = [];
      qs.forEach(function (q, k) { if (st.answers[k] === q.answer) ok++; else missed.push(q); });
      var score = ok / qs.length, passed = score >= D.QUIZ_PASS - 1e-9;
      if (passed) {
        var cert = AIWS.db.completeCourse(courseId, { name: st.name, score: score });
        put('<div class="state" role="status">' + icon("check", { size: 30 }) + '<div class="t">Тест пройден: ' + ok + ' из ' + qs.length + ' (' + Math.round(score * 100) + '%)</div>' +
          '<div class="d">Сертификат выдан на имя «' + esc(st.name) + '». Он добавлен в список выданных.</div></div>',
          '<button class="btn btn-ghost" data-modal-close>Закрыть</button><button class="btn btn-primary" id="quizPdf">' + icon("download", { size: 14 }) + 'Скачать сертификат (PDF)</button>', "#quizPdf");
        el2("quizPdf").addEventListener("click", function () { if (cert) AIWS.pdf.certificate({ name: cert.name, course: cert.course, date: cert.date }); });
      } else {
        put('<div class="state" role="status">' + icon("alert-triangle", { size: 30 }) + '<div class="t">Не хватило баллов: ' + ok + ' из ' + qs.length + ' (' + Math.round(score * 100) + '%)</div>' +
          '<div class="d">Нужно не меньше ' + Math.round(D.QUIZ_PASS * 100) + '%. Разберите ошибки и попробуйте снова.</div></div>' +
          '<div class="stack" style="margin-top:12px">' + missed.map(function (q) { return '<div style="font-size:13px"><b>' + esc(q.q) + '</b><div class="muted">Верный ответ: ' + esc(q.options[q.answer]) + '</div></div>'; }).join("") + '</div>',
          '<button class="btn btn-ghost" data-modal-close>Закрыть</button><button class="btn btn-primary" id="quizRetry">Попробовать снова</button>', "#quizRetry");
        el2("quizRetry").addEventListener("click", function () { st.i = 0; st.answers = []; question(); });
      }
    }
    intro();
  }
  AIWS.openQuiz = openQuiz;

  /* =========================================================== 11. Аналитика (ИИ-РОП) */
  function analytics() {
    var html = H.pageHead("Аналитика", "Разбор диалогов менеджеров и оценка качества цепочки",
      '<button class="btn btn-secondary" id="ropRefresh" data-soon="Пересчёт аналитики">' + icon("refresh", { size: 16 }) + 'Пересчитать</button>');
    // Quality score + violations
    html += '<div class="grid grid-3" style="margin-bottom:20px">' +
      H.card('<div class="kpi-label">Качество цепочки</div><div class="kpi-num">—</div><div class="hint-line">Демо-оценка ИИ-РОП</div>') +
      H.card('<div class="kpi-label">Нарушений скрипта</div><div class="kpi-num">—</div><div class="hint-line">За проверяемую выборку</div>') +
      H.card('<div class="kpi-label">Эскалаций к человеку</div><div class="kpi-num">—</div><div class="hint-line">По правилам согласования</div>') +
      '</div>';
    html += '<div class="grid" style="grid-template-columns:1.4fr 1fr;align-items:start">';
    html += H.card('<div class="row" style="margin-bottom:10px">' + H.sectionLabel("Разбор диалогов менеджеров") + '<div class="spacer"></div>' + H.demo() + '</div>' +
      '<div class="table-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Диалог</th><th>Менеджер</th><th>Нарушение</th><th>Оценка</th></tr></thead><tbody>' +
      [["cv-1","Демо-менеджер 1","Пропущен уточняющий вопрос","—"],["cv-2","Демо-менеджер 2","Нет (в рамках скрипта)","—"],["cv-3","Демо-менеджер 1","Не предложен доп. тариф","—"]].map(function(r){
        return '<tr><td class="num">'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td>'+(r[2].indexOf("Нет")===0?'<span class="badge"><span class="dot dot-status"></span>ОК</span>':'<span class="badge"><span class="dot dot-accent"></span>Нарушение</span> '+esc(r[2]))+'</td><td class="num">'+esc(r[3])+'</td></tr>';
      }).join("") + '</tbody></table></div></div>');
    html += H.card('<div class="row" style="margin-bottom:10px">' + H.sectionLabel("Вопрос руководителю") + '</div>' +
      '<div class="chat-thread" style="border:1px solid var(--border);border-radius:var(--radius-card);height:280px"><div class="chat-messages" id="ropChat"><div class="msg msg-ai">Готов разобрать любой диалог или посчитать метрику качества (демо).</div></div>' +
      '<div class="chat-composer"><input class="input" id="ropInput" placeholder="Спросите ИИ-РОП…"/><button class="btn btn-primary btn-sm" id="ropSend">' + icon("send", { size: 14 }) + '</button></div></div>');
    html += '</div>';
    return html;
  }

  /* =========================================================== 12. Интеграции */
  function integrations() {
    var html = H.pageHead("Интеграции", "Подключение внешних сервисов и каналов",
      '<button class="btn btn-primary" id="requestInt">' + icon("plus", { size: 16 }) + 'Запросить интеграцию</button>');
    html += '<div class="grid grid-4">';
    D.INTEGRATIONS.forEach(function (it) {
      var on = it.connected;
      var badge = '<span class="status-badge ' + (on ? "on" : "off") + '"><span class="dot"></span>' + (on ? "Подключено" : "Не подключено") + '</span>';
      var btn = on ? '<button class="btn btn-secondary btn-sm" data-soon="Настройка: ' + esc(it.name) + '">Настроить</button>' : '<button class="btn btn-secondary btn-sm" data-soon="Подключение: ' + esc(it.name) + '">Подключить</button>';
      html += '<div class="integration-card"><div class="top">' + icon(it.icon, { size: 20 }) + '<span class="name">' + esc(it.name) + '</span><div class="spacer"></div>' + H.demo() + '</div>' +
        '<div class="desc">' + esc(it.desc) + '</div>' +
        '<div class="foot">' + badge + btn + '</div></div>';
    });
    html += '</div>';
    return html;
  }

  /* =========================================================== 13. Настройки + Помощь */
  function settings() {
    var tab = AIWS.store.settingsTab || "profile";
    var tabs = [["profile","Профиль"],["company","Компания"],["roles","Роли"],["channels","Каналы"],["notifications","Уведомления"],["tariff","Тариф"],["data","Данные"]];
    var html = H.pageHead("Настройки", "Профиль, компания, роли, каналы, уведомления, тариф");
    html += '<div class="tabs">' + tabs.map(function (t) { return '<button class="tab' + (tab === t[0] ? " active" : "") + '" data-stab="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>';
    html += '<div class="card" style="max-width:640px">' + settingsTab(tab) + '</div>';
    return html;
  }
  function settingsTab(tab) {
    if (tab === "profile") return fieldRow("Имя", "ВВ") + fieldRow("Email", "demo@ai-workspace") + fieldRow("Часовой пояс", "UTC+3 Москва") + '<div class="row"><button class="btn btn-primary btn-sm" data-soon="Сохранение настроек">Сохранить</button></div>';
    if (tab === "company") return fieldRow("Название", "Демо-компания") + fieldRow("Сайт", "demo.site") + '<div class="field"><label class="field-label">О компании</label><textarea class="textarea" rows="3">Демо-описание.</textarea></div><button class="btn btn-primary btn-sm" data-soon="Сохранение настроек">Сохранить</button>';
    if (tab === "roles") return H.sectionLabel("Роли и доступ") + '<div class="table-wrap"><table class="tbl"><thead><tr><th>Роль</th><th>Доступ</th></tr></thead><tbody><tr><td>Владелец</td><td>Полный</td></tr><tr><td>Менеджер</td><td>Диалоги, CRM</td></tr><tr><td>Бухгалтерия</td><td>Документы</td></tr></tbody></table></div>';
    if (tab === "channels") return H.sectionLabel("Подключённые каналы") + '<div class="row-wrap" style="gap:8px">' + Object.keys(D.CHANNELS).map(function (c, i) { return '<span class="chip' + (i < 3 ? " chip-accent" : "") + '">' + icon(D.CHANNELS[c].icon, { size: 14 }) + esc(D.CHANNELS[c].name) + '</span>'; }).join("") + '</div>';
    if (tab === "notifications") return toggleRow("Новый лид", true) + toggleRow("Передача менеджеру", true) + toggleRow("Согласование документа", true) + toggleRow("Ошибка агента (КРИТИЧНО)", false);
    if (tab === "tariff") return '<div class="row" style="justify-content:space-between"><div><div style="font-size:14px;font-weight:600">Тариф: Демо</div><div class="muted" style="font-size:12.5px">Пробный период · ' + esc(T.trialDays) + '</div></div><button class="btn btn-primary btn-sm" data-soon="Смена тарифа">Выбрать тариф</button></div>' + '<div class="hint-line">' + icon("clock", { size: 13 }) + 'Цены не показываются (демо). Подключение тарифа — на реальном бэкенде.</div>';
    if (tab === "data") return H.sectionLabel("Данные прототипа") +
      '<div class="stack">' +
      '<div class="row" style="justify-content:space-between"><div><div style="font-size:13.5px;font-weight:500">Экспорт в JSON</div><div class="muted" style="font-size:12px">Лиды, диалоги, документы, онбординг</div></div><button class="btn btn-secondary btn-sm" id="expData">' + icon("download", { size: 14 }) + 'Экспорт</button></div>' +
      '<div class="row" style="justify-content:space-between"><div><div style="font-size:13.5px;font-weight:500">Импорт из JSON</div><div class="muted" style="font-size:12px">Заменить текущие данные файлом</div></div><button class="btn btn-secondary btn-sm" id="impData">' + icon("upload", { size: 14 }) + 'Импорт</button></div>' +
      '<div class="divider"></div>' +
      '<div class="row" style="justify-content:space-between"><div><div style="font-size:13.5px;font-weight:500">Сбросить к демо</div><div class="muted" style="font-size:12px">Вернуть исходные фикстуры</div></div><button class="btn btn-destructive btn-sm" id="resetData">' + icon("refresh", { size: 14 }) + 'Сбросить</button></div>' +
      '<div class="hint-line">' + icon("alert-triangle", { size: 13 }) + 'Данные хранятся локально в браузере (localStorage) и никуда не отправляются.</div>' +
      '</div>';
    return "";
  }
  function fieldRow(label, val) { return '<div class="field"><label class="field-label">' + esc(label) + '</label><input class="input" value="' + esc(val) + '"/></div>'; }
  function swOn(k, d) { var sw = AIWS.store.switches || {}; return sw[k] !== undefined ? sw[k] : d; }
  function toggleRow(label, on) {
    on = swOn(label, on);
    return '<div class="row" style="justify-content:space-between;margin-bottom:14px"><div><div style="font-size:13.5px;font-weight:500">' + esc(label) + '</div></div><div class="switch' + (on ? " on" : "") + '" data-sw="' + esc(label) + '" role="switch" aria-checked="' + (on ? "true" : "false") + '" tabindex="0"></div></div>';
  }

  function help() {
    var html = H.pageHead("Помощь", "Поддержка и чат обучения");
    html += '<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">';
    html += H.card('<div class="row" style="margin-bottom:10px">' + H.sectionLabel("Поддержка") + '</div>' +
      '<div class="stack">' +
      '<div class="row"><span class="chip">' + icon("message-circle", { size: 14 }) + 'Чат с поддержкой</span><span class="badge">Демо</span></div>' +
      '<div class="row"><span class="chip">' + icon("mail", { size: 14 }) + 'Email</span><span class="muted">Подключается на бэкенде</span></div>' +
      '<div class="row"><span class="chip">' + icon("book-open", { size: 14 }) + 'База статей</span></div>' +
      '</div>');
    html += H.card('<div class="row" style="margin-bottom:10px">' + H.sectionLabel("Чат обучения") + '</div>' +
      '<div class="chat-thread" style="border:1px solid var(--border);border-radius:var(--radius-card);height:240px"><div class="chat-messages" id="helpChat"><div class="msg msg-ai">Спросите, как настроить ИИ-сотрудника или подключить канал (демо).</div></div>' +
      '<div class="chat-composer"><input class="input" id="helpInput" placeholder="Ваш вопрос…"/><button class="btn btn-primary btn-sm" id="helpSend">' + icon("send", { size: 14 }) + '</button></div></div>');
    html += '</div>';
    return html;
  }

  /* =========================================================== Bindings */
  function bind2(route) {
    if (route === "leads") {
      var lt = el2("leadsTemplate"); if (lt) lt.addEventListener("click", function () {
        // CSV с BOM и «;» — корректно открывается в русскоязычном Excel
        var blob = new Blob(["\uFEFFИмя;Телефон;Email;Последний контакт\r\n"], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "шаблон-импорта-лидов.csv";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
        toast("Шаблон скачан (CSV, открывается в Excel)");
      });
    }
    if (route === "training") {
      document.querySelectorAll("[data-quiz]").forEach(function (b) { b.addEventListener("click", function () { openQuiz(b.getAttribute("data-quiz")); }); });
      document.querySelectorAll("[data-cert]").forEach(function (b) { b.addEventListener("click", function () {
        var c = D.COURSES.filter(function (x) { return x.id === b.getAttribute("data-cert"); })[0]; if (!c) return;
        var rec = D.CERTIFICATES.filter(function (x) { return x.course === c.title; })[0];
        AIWS.pdf.certificate({ name: rec ? rec.name : "Слушатель (демо)", course: c.title, date: rec ? rec.date : "Демо" });
      }); });
      document.querySelectorAll("[data-certid]").forEach(function (b) { b.addEventListener("click", function () {
        var c = D.CERTIFICATES.filter(function (x) { return x.id === b.getAttribute("data-certid"); })[0]; if (!c) return;
        AIWS.pdf.certificate({ name: c.name, course: c.course, date: c.date });
      }); });
    }
    if (route === "leads") {
      var fi = el2("importFile"), dz = el2("dropzone");
      if (dz) {
        dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("drag"); });
        dz.addEventListener("dragleave", function () { dz.classList.remove("drag"); });
        dz.addEventListener("drop", function (e) {
          e.preventDefault(); dz.classList.remove("drag");
          handleImportFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
        });
        dz.addEventListener("click", function () { if (fi) fi.click(); });
      }
      var pf = el2("pickFile"); if (pf) pf.addEventListener("click", function (e) { e.stopPropagation(); if (fi) fi.click(); });
      if (fi) fi.addEventListener("change", function () { var f = fi.files && fi.files[0]; handleImportFile(f); try { fi.value = ""; } catch (e) {} });
      document.querySelectorAll("[data-mapcol]").forEach(function (sel) {
        sel.addEventListener("change", function () { var st = AIWS.store.importData; if (st) st.mapping[+sel.getAttribute("data-mapcol")] = sel.value; });
      });
      var ifn = el2("importFunnel"); if (ifn) ifn.addEventListener("change", function () { AIWS.store.importData.funnelId = ifn.value; });
      var ich = el2("importChannel"); if (ich) ich.addEventListener("change", function () { AIWS.store.importData.channel = ich.value; });
      var di = el2("doImport"); if (di) di.addEventListener("click", doImport);
      var ri = el2("resetImport"); if (ri) ri.addEventListener("click", function () { AIWS.setState({ importerStep: "drop", importData: null, importError: null }); });
      var oi = el2("openImported"); if (oi) oi.addEventListener("click", function () {
        var r = AIWS.store.importResult; AIWS.go("crm", { crmView: "table", crmFunnel: r ? r.funnelId : "fn-sales", crmStageFilter: "all" });
      });
    }
    if (route === "docs") {
      var nd = el2("newDoc"); if (nd) nd.addEventListener("click", openDocModal);
      document.querySelectorAll("[data-docfilter]").forEach(function (b) { b.addEventListener("click", function () { AIWS.setState({ docFilter: b.getAttribute("data-docfilter") }); }); });
      document.querySelectorAll("[data-approve]").forEach(function (b) { b.addEventListener("click", function () {
        AIWS.db.updateDocument(b.getAttribute("data-approve"), { status: "approved" }); toast("Документ одобрен");
      }); });
      document.querySelectorAll("[data-reject]").forEach(function (b) { b.addEventListener("click", function () {
        AIWS.db.updateDocument(b.getAttribute("data-reject"), { status: "rejected" }); toast("Документ отклонён");
      }); });
      document.querySelectorAll("[data-docdel]").forEach(function (b) { b.addEventListener("click", function () {
        AIWS.db.deleteDocument(b.getAttribute("data-docdel")); toast("Документ удалён");
      }); });
      document.querySelectorAll("[data-sendpdf]").forEach(function (b) { b.addEventListener("click", function () { AIWS.pdf.generate(b.getAttribute("data-sendpdf")); }); });
      document.querySelectorAll("[data-printdoc]").forEach(function (b) { b.addEventListener("click", function () { AIWS.pdf.printDoc(b.getAttribute("data-printdoc")); }); });
    }
    if (route === "storage") {
      var ws = el2("webSearchSwitch"); if (ws) { ws.addEventListener("click", function () { ws.classList.toggle("on"); AIWS.store.switches.websearch = ws.classList.contains("on"); ws.setAttribute("aria-checked", ws.classList.contains("on")); }); ws.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); ws.click(); } }); }
    }
    if (route === "team") {
      document.querySelectorAll("[data-chain]").forEach(function (b) { b.addEventListener("click", function () { AIWS.setState({ chainTpl: b.getAttribute("data-chain") }); }); });
    }
    if (route === "settings") {
      document.querySelectorAll("[data-stab]").forEach(function (t) { t.addEventListener("click", function () { AIWS.setState({ settingsTab: t.getAttribute("data-stab") }); }); });
      // generic switches
      document.querySelectorAll(".switch[role='switch']").forEach(function (s) {
        s.addEventListener("click", function () {
          s.classList.toggle("on"); s.setAttribute("aria-checked", s.classList.contains("on"));
          var k = s.getAttribute("data-sw"); if (k) AIWS.store.switches[k] = s.classList.contains("on");
        });
      });
      var exp = el2("expData"); if (exp) exp.addEventListener("click", function () { AIWS.db.exportJSON(); toast("Файл данных скачан"); });
      var imp = el2("impData"); if (imp) imp.addEventListener("click", function () { AIWS.db.importJSON(); });
      var rst = el2("resetData"); if (rst) rst.addEventListener("click", function () { AIWS.db.resetAll(); toast("Данные сброшены к демо"); });
    }
    if (route === "integrations") {
      var ri2 = el2("requestInt"); if (ri2) ri2.addEventListener("click", function () { toast("Запрос интеграции отправлен (демо)"); });
    }
    // generic chat senders (analytics, help)
    bindChat("ropInput", "ropSend", "ropChat", "ИИ-РОП", "Разбор готов: по диалогу есть замечания к скрипту (демо).");
    bindChat("helpInput", "helpSend", "helpChat", "Помощь", "Вот краткое руководство по этому вопросу (демо).");
  }

  var chatSeq = 0;
  function bindChat(inputId, sendId, hostId, who, reply) {
    var inp = el2(inputId), send = el2(sendId), host = el2(hostId);
    if (!inp || !send || !host) return;
    function send_() {
      if (!inp.value.trim()) return;
      host.insertAdjacentHTML("beforeend", '<div class="msg msg-human">' + esc(inp.value) + '<div class="meta">Вы · сейчас</div></div>');
      var q = inp.value; inp.value = "";
      var typId = "typ-" + hostId + "-" + (++chatSeq);
      var typing = document.createElement("div"); typing.id = typId; typing.className = "msg msg-typing"; typing.textContent = who + " печатает…"; host.appendChild(typing); host.scrollTop = host.scrollHeight;
      setTimeout(function () {
        // экран могли перерисовать: ищем элементы заново по id
        var t = el2(typId); if (t) t.remove();
        var h = el2(hostId); if (!h) return;
        var r = AIWS.scriptedReply ? AIWS.scriptedReply(who, q) : reply;
        h.insertAdjacentHTML("beforeend", '<div class="msg msg-ai">' + esc(r) + '<div class="meta">' + esc(who) + '</div></div>'); h.scrollTop = h.scrollHeight;
      }, 900);
    }
    send.addEventListener("click", send_);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") send_(); });
  }

  /* ----------------------------------------------------------- Register */
  ["leads","docs","storage","team","supply","training","analytics","integrations","settings","help"].forEach(function (id) {
    var fn = ({ leads: leads, docs: docs, storage: storage, team: team, supply: supply, training: training, analytics: analytics, integrations: integrations, settings: settings, help: help })[id];
    AIWS.registerSection(id, fn);
  });
})(typeof window !== "undefined" ? window : this);
