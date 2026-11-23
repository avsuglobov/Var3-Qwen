/* =========================================================================
   app.js — ядро: стор, роутер, тема (эмуляция next-themes), ⌘K, UTC-часы,
   сворачиваемый сайдбар, мобильный drawer. Эмуляция TanStack Query/Zustand
   поверх простого реактивного стора; реальный REST подключается через /lib/api.
   ========================================================================= */
(function (global) {
  "use strict";

  var icon = global.AIWS.icon;
  var D = global.AIWS.data;
  var T = D.I18N;

  /* ----------------------------------------------------------- Manifest */
  // Единый манифест навигации (порядок + группы). Иконки монохромные.
  var NAV = [
    { id: "overview",   label: T.navOverview,   group: "Основное",              icon: "layout-dashboard", kbd: "1" },
    { id: "agents",     label: T.navAgents,     group: "Основное",              icon: "bot",              kbd: "2" },
    { id: "dialogs",    label: T.navDialogs,    group: "Основное",              icon: "messages-square",  kbd: "3" },
    { id: "crm",        label: T.navCrm,        group: "Основное",              icon: "kanban",           kbd: "4" },
    { id: "leads",      label: T.navLeads,      group: "Клиенты",               icon: "users",            kbd: null },
    { id: "docs",       label: T.navDocs,       group: "Клиенты",               icon: "file-text",        kbd: null },
    { id: "calendar",   label: T.navCalendar,   group: "Работа",                icon: "calendar",         kbd: null },
    { id: "tasks",      label: T.navTasks,      group: "Работа",                icon: "check-square",     kbd: null },
    { id: "storage",    label: T.navStorage,    group: "Знания и автоматизация",icon: "database",         kbd: null },
    { id: "team",       label: T.navTeam,       group: "Знания и автоматизация",icon: "git-branch",       kbd: null },
    { id: "supply",     label: T.navSupply,     group: "Знания и автоматизация",icon: "truck",            kbd: null },
    { id: "training",   label: T.navTraining,   group: "Знания и автоматизация",icon: "graduation-cap",   kbd: null },
    { id: "analytics",  label: T.navAnalytics,  group: "Знания и автоматизация",icon: "bar-chart",        kbd: null },
    { id: "integrations",label:T.navIntegrations,group:"Система",               icon: "plug",             kbd: null },
    { id: "settings",   label: T.navSettings,   group: "Система",               icon: "settings",         kbd: null },
    { id: "help",       label: T.navHelp,       group: "Система",               icon: "help-circle",      kbd: null }
  ];

  /* ----------------------------------------------------------- Store */
  var store = {
    route: "overview",
    agentDetail: null,       // selected agent id
    agentTab: "instruction",
    sidebarCollapsed: lsGet("aiws-sidebar") === "1",
    crmView: "journal",      // journal | kanban | table
    crmFunnel: "fn-sales",
    selectedLead: "LD-1041",
    selectedConv: "cv-1",
    importerStep: "drop",    // drop | map | done
    docFilter: "all",
    paletteOpen: false,
    paletteQuery: "",
    chatListOpen: false,     // мобильный режим диалогов: показан список, а не переписка
    crmStageFilter: "all",   // фильтр стадий в таблице CRM
    crmSort: "id",           // сортировка таблицы CRM: id | name | activity
    switches: {},            // состояние переключателей (в сессии)
    paletteIndex: 0,
    themeMenuOpen: false,
    notifOpen: false,
    taskFilter: "all",
    taskView: "list",
    calMonth: 0
  };
  // Хранилище может быть недоступно (приватный режим, запрет cookies): приложение должно работать и без него
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var subs = [];
  var booted = false;
  // Какие ключи состояния что перерисовывают: топбар, палитра, шапка/сайдбар или только вид.
  var TOP_KEYS = { themeMenuOpen: 1, notifOpen: 1 };
  var PAL_KEYS = { paletteOpen: 1, paletteQuery: 1, paletteIndex: 1 };
  function setState(patch) {
    var keys = [];
    for (var k in patch) { if (patch.hasOwnProperty(k)) { store[k] = patch[k]; keys.push(k); } }
    var chrome = false, top = false, view = false, pal = false;
    if (!keys.length) { view = true; top = true; }          // мутация данных: вид + счётчики в топбаре
    keys.forEach(function (key) {
      if (key === "sidebarCollapsed") chrome = true;
      else if (TOP_KEYS[key]) top = true;
      else if (PAL_KEYS[key]) pal = true;
      else view = true;
    });
    if (booted) {
      if (chrome) paintChrome(); else if (top) paintTopbar();
      if (view) renderView();
      if (pal) renderPalette();
    }
    for (var i = 0; i < subs.length; i++) { subs[i](store); }
  }
  function subscribe(fn) { subs.push(fn); }

  /* ----------------------------------------------------------- Theme (next-themes emulation) */
  // attribute=class, defaultTheme=system, enableSystem. Без мигания: скрипт в <head>
  // (index.html) выставляет класс до первой отрисовки. Здесь — управление переключателем.
  var THEME_KEY = "aiws-theme";
  function getStoredTheme() { return lsGet(THEME_KEY) || "system"; }
  function systemDark() { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function effectiveTheme() {
    var t = getStoredTheme();
    return t === "system" ? (systemDark() ? "dark" : "light") : t;
  }
  function applyTheme(t) {
    lsSet(THEME_KEY, t);
    var eff = t === "system" ? (systemDark() ? "dark" : "light") : t;
    document.documentElement.classList.toggle("dark", eff === "dark");
    document.documentElement.setAttribute("data-theme", eff);
    setState({});
  }
  // keep in sync with OS changes when in system mode
  if (window.matchMedia) {
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (getStoredTheme() === "system") { applyTheme("system"); }
    }); } catch (e) {}
  }

  /* ----------------------------------------------------------- UTC clock */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function utcString() {
    var d = new Date();
    return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
  }

  /* ----------------------------------------------------------- Helpers */
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"; }); }
  function agentsOnlineCount() { return D.AGENTS.filter(function (a) { return a.status === "online"; }).length; }
  function agentsTotal() { return D.AGENTS.length; }

  // lucide trash-2 отсутствовал в реестре иконок (фолбэк рисовал кружок) — регистрируем здесь.
  if (global.AIWS.icons && !global.AIWS.icons["trash-2"]) {
    global.AIWS.icons["trash-2"] = '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>';
  }

  /* ----------------------------------------------------------- UI state preservation
     При перерисовке вида сохраняем скролл (страницы и внутренних контейнеров), фокус с кареткой,
     введённый в поля текст и содержимое демо-чатов. Автоскролл чата вниз — по data-autoscroll. */
  var KEEP_HTML = ["testChat", "ropChat", "helpChat"];
  function focusKey(node) {
    if (!node || node === document.body) return null;
    if (node.id) return "#" + node.id;
    var at = node.attributes;
    for (var i = 0; i < at.length; i++) {
      var n = at[i].name;
      if (n.indexOf("data-") === 0 && n !== "data-autoscroll" && n !== "data-count") {
        return node.tagName.toLowerCase() + "[" + n + '="' + String(at[i].value).replace(/"/g, '\\"') + '"]';
      }
    }
    return null;
  }
  function textLike(n) {
    if (n.tagName === "TEXTAREA") return true;
    return n.tagName === "INPUT" && /^(text|search|email|tel|url|number|date)?$/.test(n.getAttribute("type") || "");
  }
  function captureUI(root) {
    var snap = { focus: null, scroll: [], values: [], html: {}, auto: {}, total: 0 };
    if (!root) return snap;
    var ae = document.activeElement;
    if (ae && root.contains(ae)) {
      var key = focusKey(ae);
      if (key) snap.focus = { key: key, s: ae.selectionStart, e: ae.selectionEnd };
    }
    var all = root.querySelectorAll("*"); snap.total = all.length;
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.hasAttribute("data-autoscroll")) {
        snap.auto[n.id || i] = { nearBottom: n.scrollHeight - n.clientHeight - n.scrollTop < 40, count: n.getAttribute("data-count") };
      } else if (n.scrollTop > 0 || n.scrollLeft > 0) {
        snap.scroll.push({ i: i, tag: n.tagName, cls: n.className, t: n.scrollTop, l: n.scrollLeft });
      }
      if (textLike(n)) snap.values.push({ i: i, tag: n.tagName, v: n.value });
    }
    KEEP_HTML.forEach(function (id) { var e = el(id); if (e && root.contains(e)) snap.html[id] = e.innerHTML; });
    return snap;
  }
  function restoreUI(root, snap, keep) {
    if (!root) return;
    var all = root.querySelectorAll("*");
    if (keep && snap) {
      Object.keys(snap.html).forEach(function (id) { var e = el(id); if (e) e.innerHTML = snap.html[id]; });
      if (all.length === snap.total) {
        snap.values.forEach(function (r) { var n = all[r.i]; if (n && n.tagName === r.tag && textLike(n) && n.value !== r.v) n.value = r.v; });
        snap.scroll.forEach(function (r) { var n = all[r.i]; if (n && n.tagName === r.tag && n.className === r.cls) { n.scrollTop = r.t; n.scrollLeft = r.l; } });
      }
      if (snap.focus) {
        var f = null; try { f = root.querySelector(snap.focus.key); } catch (e) {}
        if (f && f.focus) {
          f.focus();
          if (snap.focus.s != null && f.setSelectionRange) { try { f.setSelectionRange(snap.focus.s, snap.focus.e); } catch (e2) {} }
        }
      }
    }
    // чаты: вниз при новой странице, новых сообщениях или если пользователь уже был внизу
    root.querySelectorAll("[data-autoscroll]").forEach(function (n, idx) {
      var prev = keep && snap ? (snap.auto[n.id] || snap.auto[idx]) : null;
      if (!prev || prev.nearBottom || prev.count !== n.getAttribute("data-count")) n.scrollTop = n.scrollHeight;
    });
  }

  /* ----------------------------------------------------------- Shell render */
  function renderSidebar(isDrawer) {
    var collapsed = store.sidebarCollapsed && !isDrawer;
    var groups = [];
    NAV.forEach(function (n) {
      if (!groups.length || groups[groups.length - 1].name !== n.group) { groups.push({ name: n.group, items: [] }); }
      groups[groups.length - 1].items.push(n);
    });
    var html = '<div class="sidebar-head">' +
      '<span class="brand-mark" aria-hidden="true">AI</span>' +
      '<span class="brand-name">' + esc(T.appName) + '<span class="tag">' + esc(T.tagline) + '</span></span>' +
    '</div>';
    html += '<nav class="sidebar-nav" aria-label="Основная навигация">';
    groups.forEach(function (g) {
      html += '<div class="nav-group"><span class="nav-group-label">' + esc(g.name) + '</span>';
      g.items.forEach(function (n) {
        var active = store.route === n.id ? " active" : "";
        html += '<a class="nav-item' + active + '" data-route="' + n.id + '" href="#/' + n.id + '" role="link" tabindex="0">' +
          icon(n.icon, { size: 18 }) +
          '<span class="label">' + esc(n.label) + '</span>' +
          (n.kbd ? '<span class="kbd">' + n.kbd + '</span>' : '') +
        '</a>';
      });
      html += '</div>';
    });
    html += '</nav>';
    html += '<div class="sidebar-foot">' +
      '<span class="trial-chip"><span class="dot"></span><span class="txt">' + esc(T.trial) + ' · ' + esc(T.trialDays) + '</span></span>' +
      '<button class="icon-btn chev-label" id="collapseBtn" aria-label="' + (collapsed ? "Развернуть меню" : "Свернуть меню") + '" title="Свернуть меню">' +
        icon(collapsed ? "chevron-right" : "chevron-left", { size: 16 }) + '</button>' +
    '</div>';
    return html;
  }

  function renderTopbar() {
    var themeIcon = effectiveTheme() === "dark" ? "moon" : "sun";
    var stored = getStoredTheme();
    var themeLabel = stored === "system" ? "Системная" : stored === "dark" ? "Тёмная" : "Светлая";
    var html = '';
    html += '<button class="icon-btn menu-btn" id="menuBtn" aria-label="Открыть меню">' + icon("menu", { size: 18 }) + '</button>';
    html += '<button class="icon-btn" id="collapseBtnTop" aria-label="Свернуть меню" title="Свернуть меню">' + icon(store.sidebarCollapsed ? "chevron-right" : "chevron-left", { size: 16 }) + '</button>';
    html += '<div class="search" id="searchBtn" role="button" tabindex="0" aria-label="Поиск">' +
      icon("search", { size: 16 }) + '<span class="ph">' + esc(T.search) + '</span>' +
      '<span class="kbd">⌘K</span></div>';
    html += '<span class="utc-clock"><span class="label">UTC</span><span id="utcTime">' + utcString() + '</span></span>';
    html += '<span class="agents-status"><span class="dot dot-status"></span><span class="num">' + agentsOnlineCount() + '</span> / <span class="num">' + agentsTotal() + '</span> ' + esc("агентов") + '</span>';
    html += '<div class="topbar-spacer"></div>';
    html += '<span class="trial-chip"><span class="dot dot-accent"></span><span class="txt">' + esc(T.trial) + ' · ' + esc(T.trialDays) + '</span></span>';
    var unread = D.NOTIFICATIONS.filter(function (n) { return !n.read; }).length;
    html += '<div class="notif-toggle" style="position:relative">' +
      '<button class="icon-btn" id="bellBtn" aria-label="Уведомления" title="Уведомления">' + icon("bell", { size: 18 }) +
      (unread ? '<span class="bell-dot">' + unread + '</span>' : '') + '</button>' +
      (store.notifOpen ? renderNotifPanel() : '') + '</div>';
    html += '<div class="theme-toggle">' +
      '<button class="icon-btn" id="themeBtn" aria-label="Переключить тему (' + themeLabel + ')" title="Тема: ' + themeLabel + '">' + icon(themeIcon, { size: 18 }) + '</button>' +
      (store.themeMenuOpen ? renderThemeMenu() : '') +
    '</div>';
    html += '<span class="avatar" title="Профиль">ВВ</span>';
    return html;
  }

  function renderThemeMenu() {
    var stored = getStoredTheme();
    function row(val, lab, ic) {
      var on = stored === val ? " active" : "";
      return '<button class="nav-item' + on + '" data-theme-val="' + val + '" style="width:100%">' + icon(ic, { size: 16 }) + '<span class="label">' + lab + '</span>' + (on ? icon("check", { size: 14 }) : '') + '</button>';
    }
    return '<div class="palette" style="position:absolute;right:0;top:40px;width:180px;padding:6px" role="menu">' +
      row("light", "Светлая", "sun") + row("dark", "Тёмная", "moon") + row("system", "Системная", "monitor") +
    '</div>';
  }

  function renderNotifPanel() {
    var list = D.NOTIFICATIONS;
    var unread = list.filter(function (n) { return !n.read; }).length;
    var ic = { lead: "users", doc: "file-text", alert: "alert-triangle", system: "bot" };
    var rows = list.map(function (n) {
      return '<button class="notif-row' + (n.read ? " read" : "") + '" data-notif="' + esc(n.id) + '">' +
        icon(ic[n.type] || "bell", { size: 16 }) +
        '<span class="body"><span class="t">' + esc(n.text) + '</span><span class="meta">' + esc(n.time) + '</span></span>' +
        (!n.read ? '<span class="dot dot-accent"></span>' : '') + '</button>';
    }).join("");
    return '<div class="notif-panel" role="menu">' +
      '<div class="notif-head"><span class="title">Уведомления</span>' +
      (unread ? '<button class="link" id="readAllNotif">Прочитать все</button>' : '') + '</div>' +
      '<div class="notif-list">' + (rows || '<div class="notif-empty">Нет уведомлений</div>') + '</div></div>';
  }

  function renderShell() {
    var app = el("app");
    app.className = "app" + (store.sidebarCollapsed ? " sidebar-collapsed" : "");
    app.innerHTML =
      '<aside class="sidebar" id="sidebar">' + renderSidebar(false) + '</aside>' +
      '<div class="main">' +
        '<header class="topbar" id="topbar">' + renderTopbar() + '</header>' +
        '<main class="content" id="content"><div class="content-inner" id="view"></div></main>' +
      '</div>';
    bindSidebar(); bindTopbar();
    renderView();
  }
  // Точечная перерисовка: топбар и сайдбар меняются независимо от вида, фокус в них сохраняется.
  function paintTopbar() {
    var t = el("topbar"); if (!t) return;
    var snap = captureUI(t);
    t.innerHTML = renderTopbar(); bindTopbar();
    restoreUI(t, snap, true);
  }
  function paintChrome() {
    var app = el("app"), sb = el("sidebar"); if (!app || !sb) return;
    var snap = captureUI(sb);
    app.className = "app" + (store.sidebarCollapsed ? " sidebar-collapsed" : "");
    sb.innerHTML = renderSidebar(false); bindSidebar();
    restoreUI(sb, snap, true);
    paintTopbar();
  }

  /* ----------------------------------------------------------- Command palette (⌘K) */
  function paletteItems() {
    var q = store.paletteQuery.trim().toLowerCase();
    var items = NAV.map(function (n) { return { type: "route", id: n.id, label: n.label, icon: n.icon, hint: "Перейти" }; });
    items.push({ type: "action", id: "toggle-theme", label: "Переключить тему", icon: effectiveTheme() === "dark" ? "sun" : "moon", hint: "Действие" });
    items.push({ type: "action", id: "new-agent", label: "Создать ИИ-сотрудника", icon: "bot", hint: "Действие" });
    items.push({ type: "action", id: "collapse", label: store.sidebarCollapsed ? "Развернуть меню" : "Свернуть меню", icon: "chevron-left", hint: "Действие" });
    if (q) {
      D.AGENTS.forEach(function (a) { items.push({ type: "agent", id: a.id, label: a.name, icon: "bot", hint: "Сотрудник" }); });
      D.LEADS.forEach(function (l) { items.push({ type: "lead", id: l.id, label: l.name + " · " + l.id, icon: "users", hint: "Лид" }); });
      items = items.filter(function (it) { return it.label.toLowerCase().indexOf(q) >= 0 || it.hint.toLowerCase().indexOf(q) >= 0; });
    }
    return items;
  }

  // Палитра создаётся один раз при открытии: поле ввода и слушатели живут до закрытия
  // (раньше слушатели копились на каждое нажатие, а поле пересоздавалось и сбрасывало каретку).
  var paletteReturnFocus = null;
  function renderPalette() {
    var root = el("paletteRoot");
    if (!store.paletteOpen) {
      if (root) {
        root.remove();
        if (paletteReturnFocus && document.contains(paletteReturnFocus) && paletteReturnFocus.focus) paletteReturnFocus.focus();
        paletteReturnFocus = null;
      }
      return;
    }
    if (!root) {
      paletteReturnFocus = document.activeElement;
      root = document.createElement("div");
      root.id = "paletteRoot"; root.className = "modal-overlay";
      root.innerHTML = '<div class="palette" role="dialog" aria-modal="true" aria-label="Командная палитра">' +
        '<input class="palette-input" id="paletteInput" role="combobox" aria-expanded="true" aria-controls="paletteList" aria-autocomplete="list" placeholder="' + esc(T.search) + '" autocomplete="off" />' +
        '<div class="palette-list" id="paletteList" role="listbox"></div></div>';
      document.body.appendChild(root);
      bindPalette(root);
      var input = el("paletteInput"); input.value = store.paletteQuery; input.focus();
    }
    paintPaletteList();
  }

  function paintPaletteList() {
    var list = el("paletteList"), input = el("paletteInput"); if (!list) return;
    var items = paletteItems();
    var idx = Math.min(store.paletteIndex, Math.max(0, items.length - 1));
    store.paletteIndex = idx;
    list.innerHTML = items.map(function (it, i) {
      return '<div class="palette-item' + (i === idx ? " sel" : "") + '" role="option" id="pal-' + i + '" aria-selected="' + (i === idx) + '" data-pidx="' + i + '">' +
        icon(it.icon, { size: 16 }) + '<span>' + esc(it.label) + '</span>' +
        '<span class="kbd">' + esc(it.hint) + '</span></div>';
    }).join("") || '<div class="palette-item" role="option" aria-disabled="true">Ничего не найдено</div>';
    if (input) input.setAttribute("aria-activedescendant", items.length ? "pal-" + idx : "");
    var sel = list.querySelector(".sel"); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
  }

  function bindPalette(root) {
    root.addEventListener("click", function (e) {
      if (e.target === root) { setState({ paletteOpen: false }); return; }
      var it = e.target.closest(".palette-item[data-pidx]");
      if (it) { runPaletteItem(paletteItems()[+it.getAttribute("data-pidx")]); }   // актуальный список в момент клика
    });
    var input = el("paletteInput");
    input.addEventListener("input", function () { setState({ paletteQuery: input.value, paletteIndex: 0 }); });
    input.addEventListener("keydown", function (e) {
      var items = paletteItems();
      if (e.key === "ArrowDown") { e.preventDefault(); setState({ paletteIndex: Math.min(store.paletteIndex + 1, items.length - 1) }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setState({ paletteIndex: Math.max(store.paletteIndex - 1, 0) }); }
      else if (e.key === "Enter") { e.preventDefault(); runPaletteItem(items[store.paletteIndex]); }
      else if (e.key === "Tab") { e.preventDefault(); }   // фокус остаётся в диалоге
    });
  }

  function go(route, patch) {
    var p = patch || {}; p.route = route;
    setState(p);
    if (location.hash !== "#/" + route) { location.hash = "#/" + route; }
  }

  global.AIWS.go = go;

  function runPaletteItem(it) {
    if (!it) return;
    setState({ paletteOpen: false });
    if (it.type === "route") { navigate(it.id); }
    else if (it.type === "agent") { go("agents", { agentDetail: it.id, agentTab: "instruction" }); }
    else if (it.type === "lead") {
      var l = D.LEADS.filter(function (x) { return x.id === it.id; })[0];
      go("crm", { crmView: "journal", selectedLead: it.id, crmFunnel: l ? l.funnelId : store.crmFunnel });
    }
    else if (it.id === "toggle-theme") { applyTheme(effectiveTheme() === "dark" ? "light" : "dark"); }
    else if (it.id === "new-agent") { navigate("agents"); setTimeout(function () { if (global.AIWS.openAgentWizard) global.AIWS.openAgentWizard(); }, 30); }
    else if (it.id === "collapse") { toggleCollapse(); }
  }

  /* ----------------------------------------------------------- Navigation */
  function navigate(route) {
    if (route === "agents") store.agentDetail = null;   // клик по разделу всегда ведёт к списку
    if (location.hash !== "#/" + route) { location.hash = "#/" + route; }
    else { setState({ route: route }); }
  }
  function routeFromHash() {
    var h = location.hash.replace(/^#\/?/, "");
    var ok = NAV.some(function (n) { return n.id === h; });
    return ok ? h : "overview";
  }

  /* ----------------------------------------------------------- View dispatch */
  var SECTIONS = {};
  function registerSection(id, fn) { SECTIONS[id] = fn; }
  // Недоступные в демо действия: честная пометка «Скоро» и сообщение по клику (вместо кнопок, которые молча ничего не делают)
  function decorateSoon(root) {
    root.querySelectorAll("[data-soon]").forEach(function (n) {
      n.setAttribute("title", "Недоступно в демо-прототипе: " + n.getAttribute("data-soon"));
      if (n.textContent.trim() && !n.querySelector(".soon-tag")) {
        var t = document.createElement("span"); t.className = "soon-tag"; t.textContent = "Скоро"; n.appendChild(t);
      }
    });
  }
  function bindSoon() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-soon]"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (global.AIWS.toast) global.AIWS.toast("«" + b.getAttribute("data-soon") + "» пока недоступно в демо-прототипе");
    }, true);
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[data-soon][role="button"], [data-kb]')) { e.preventDefault(); e.target.click(); }
    });
  }

  // Состояние «ошибка»: сбой отрисовки раздела не должен оставлять пустой экран
  function showViewError(view, err) {
    if (global.console) console.error(err);
    view.innerHTML = '<div class="card" role="alert" style="padding:24px;max-width:560px">' + icon("alert-triangle", { size: 22 }) +
      '<h2 style="font-size:16px;margin:10px 0 6px">Не удалось показать раздел</h2>' +
      '<p class="muted" style="margin:0 0 14px;font-size:13px">' + esc(err && err.message ? err.message : String(err)) + '</p>' +
      '<button class="btn btn-secondary btn-sm" id="retryView">Повторить</button></div>';
    var r = el("retryView"); if (r) r.addEventListener("click", function () { renderView(); });
  }
  // Доступность: роли вкладок, aria-current, клавиатура для кликабельных не-кнопок
  function enhanceA11y(root) {
    root.querySelectorAll(".tabs").forEach(function (t) {
      t.setAttribute("role", "tablist");
      t.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("role", "tab"); b.setAttribute("aria-selected", b.classList.contains("active") ? "true" : "false"); });
    });
    root.querySelectorAll("[data-conv], a[data-lead], .kanban-card[data-lead]").forEach(function (n) {
      n.setAttribute("tabindex", "0"); n.setAttribute("role", "button"); n.setAttribute("data-kb", "1");
    });
    root.querySelectorAll("[data-view], [data-docfilter], [data-taskfilter], [data-filter]").forEach(function (b) {
      if (!b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", (b.classList.contains("active") || b.classList.contains("chip-accent")) ? "true" : "false");
    });
  }

  var lastViewKey = null;
  function viewKey() { return store.route + "|" + (store.agentDetail || "") + "|" + (store.route === "dialogs" ? store.selectedConv : ""); }
  function renderView() {
    var view = el("view");
    if (!view) return;
    var key = viewKey(), keep = key === lastViewKey;   // тот же экран: сохраняем скролл/фокус/ввод
    lastViewKey = key;
    var c = el("content");
    var snap = keep ? captureUI(view) : null;
    var pageTop = keep && c ? c.scrollTop : 0;
    var fn = SECTIONS[store.route] || SECTIONS.overview;
    view.innerHTML = "";
    try {
      var node = fn();
      if (typeof node === "string") { view.innerHTML = node; }
      else if (node instanceof HTMLElement) { view.appendChild(node); }
      // allow sections to bind after insert
      if (global.AIWS.afterRender) { global.AIWS.afterRender(store.route); }
    } catch (err) { showViewError(view, err); }
    // mark active nav
    document.querySelectorAll(".nav-item[data-route]").forEach(function (a) {
      var on = a.getAttribute("data-route") === store.route;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    decorateSoon(view);
    enhanceA11y(view);
    restoreUI(view, snap, keep);
    if (c) c.scrollTop = pageTop;   // новый экран — вверх, тот же — на прежнее место
  }

  /* ----------------------------------------------------------- Interactions */
  function toggleCollapse() {
    var next = !store.sidebarCollapsed;
    lsSet("aiws-sidebar", next ? "1" : "0");
    setState({ sidebarCollapsed: next });
  }

  function bindSidebar() {
    document.querySelectorAll("#sidebar .nav-item[data-route]").forEach(function (a) {
      a.addEventListener("click", function () { navigate(a.getAttribute("data-route")); });
      a.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(a.getAttribute("data-route")); } });
    });
    var cb = el("collapseBtn"); if (cb) cb.addEventListener("click", toggleCollapse);
  }
  function bindTopbar() {
    var ct = el("collapseBtnTop"); if (ct) ct.addEventListener("click", toggleCollapse);
    var sb = el("searchBtn");
    if (sb) { sb.addEventListener("click", openPalette); sb.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPalette(); } }); }
    var mb = el("menuBtn");
    if (mb) mb.addEventListener("click", openDrawer);
    var tb = el("themeBtn");
    if (tb) tb.addEventListener("click", function (e) { e.stopPropagation(); setState({ themeMenuOpen: !store.themeMenuOpen }); });
    document.querySelectorAll("#topbar [data-theme-val]").forEach(function (b) {
      b.addEventListener("click", function () { applyTheme(b.getAttribute("data-theme-val")); setState({ themeMenuOpen: false }); });
    });
    var nb = el("bellBtn");
    if (nb) nb.addEventListener("click", function (e) { e.stopPropagation(); setState({ notifOpen: !store.notifOpen }); });
    document.querySelectorAll("#topbar [data-notif]").forEach(function (r) {
      r.addEventListener("click", function () { AIWS.db.markNotifRead(r.getAttribute("data-notif")); });
    });
    var ra = el("readAllNotif"); if (ra) ra.addEventListener("click", function () { AIWS.db.markAllNotifsRead(); });
  }

  function openPalette() { setState({ paletteOpen: true, paletteQuery: "", paletteIndex: 0 }); }

  function openDrawer() {
    var overlay = document.createElement("div");
    overlay.className = "drawer-overlay";
    var drawer = document.createElement("aside");
    drawer.className = "sidebar-drawer";
    drawer.innerHTML = renderSidebar(true);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) { overlay.remove(); }
    });
    drawer.querySelectorAll(".nav-item[data-route]").forEach(function (a) {
      a.addEventListener("click", function () { navigate(a.getAttribute("data-route")); overlay.remove(); });
    });
  }

  /* ----------------------------------------------------------- Clock tick */
  function tickClock() {
    var t = el("utcTime");
    if (t) t.textContent = utcString();
  }

  /* ----------------------------------------------------------- Keyboard */
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault(); openPalette(); return;
    }
    if (e.key === "Escape" && store.paletteOpen) { setState({ paletteOpen: false }); }
    // digit shortcuts 1..4 for main sections
    if (!e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName)) return;
    var map = { "1": "overview", "2": "agents", "3": "dialogs", "4": "crm" };
    if (map[e.key]) { navigate(map[e.key]); }
  });

  /* ----------------------------------------------------------- Boot */
  function boot() {
    // sync theme attribute (head script already set class; ensure data-theme)
    document.documentElement.setAttribute("data-theme", effectiveTheme());
    store.route = routeFromHash();
    // one-time global listeners (not per-render, to avoid accumulation)
    document.addEventListener("click", function (e) {
      if (store.themeMenuOpen && !e.target.closest(".theme-toggle")) { setState({ themeMenuOpen: false }); }
      if (store.notifOpen && !e.target.closest(".notif-toggle")) { setState({ notifOpen: false }); }
    }, { capture: true });
    window.addEventListener("hashchange", function () { var r = routeFromHash(); setState(r === "agents" ? { route: r } : { route: r, agentDetail: null }); });
    document.title = global.AIWS.config.APP_NAME + " — " + global.AIWS.config.APP_TAGLINE;
    renderShell();
    booted = true;
    bindSoon();
    setInterval(tickClock, 1000);
    // re-render view-only on theme change (full shell re-render also fine)
  }

  /* ----------------------------------------------------------- Public API */
  global.AIWS.store = store;
  global.AIWS.setState = setState;
  global.AIWS.subscribe = subscribe;
  global.AIWS.navigate = navigate;
  global.AIWS.registerSection = registerSection;
  global.AIWS.NAV = NAV;
  global.AIWS.helpers = { esc: esc, icon: icon, utcString: utcString, effectiveTheme: effectiveTheme };
  global.AIWS.applyTheme = applyTheme;
  global.AIWS.boot = boot;
})(typeof window !== "undefined" ? window : this);
