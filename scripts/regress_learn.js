/* regress_learn.js — ИИ-сотрудники сохраняются в хранилище; тест в «Обучении» выдаёт сертификат.
   Запуск: node scripts/regress_learn.js (jsdom) */
const fs = require("fs"), path = require("path");
const { load, DL } = require("./jsdom_harness");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = [], fail = []; const check = (n, c) => (c ? pass : fail).push(n);
const KEY = "aiws-db-v2";
const reload = async (w) => { const n = load({ storage: { [KEY]: w.localStorage.getItem(KEY) } }).window; await wait(30); return n; };
const readBlob = (w, b) => new Promise((r) => { const fr = new w.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(b); });

(async () => {
  let w = load().window, d = w.document; await wait(30); let A = w.AIWS;
  const seedAgents = A.data.AGENTS.length;

  // ================= агенты
  let w2 = await reload(w);
  check("агенты: все демо-агенты проходят валидацию и переживают перезагрузку", w2.AIWS.data.AGENTS.length === seedAgents && w2.AIWS.data.AGENTS.every((a, i) => a.id === A.data.AGENTS[i].id && a.approvals.length === A.data.AGENTS[i].approvals.length));

  A.navigate("agents"); await wait(15);
  d.getElementById("newAgentBtn").click(); await wait(10);
  d.getElementById("wizName").value = "Постоянный Агент"; d.querySelector('[data-role="support"]').click();
  d.querySelector('[data-ch="telegram"]').click(); d.querySelector('[data-ch="email"]').click();
  d.getElementById("wizInstr").value = "Отвечать кратко"; d.getElementById("wizSave").click(); await wait(15);
  w2 = await reload(w);
  const kept = w2.AIWS.data.AGENTS.find((a) => a.name === "Постоянный Агент");
  check("агенты: созданный в мастере сотрудник сохраняется после перезагрузки", !!kept && kept.role === "support" && kept.instruction === "Отвечать кратко" && kept.channels.includes("email") && !kept.channels.includes("telegram") && kept.monogram === "ПА");
  w2.AIWS.navigate("agents"); await wait(15);
  check("агенты: и виден в списке после перезагрузки", /Постоянный Агент/.test(w2.document.getElementById("view").textContent));

  A.setState({ route: "agents", agentDetail: "ag-sales", agentTab: "instruction" }); await wait(15);
  d.getElementById("agentInstr").value = "Сохранённая инструкция"; d.getElementById("agentSave").click(); await wait(10);
  w2 = await reload(w);
  check("агенты: изменённая инструкция сохраняется", w2.AIWS.data.AGENTS.find((a) => a.id === "ag-sales").instruction === "Сохранённая инструкция");
  const onlineBefore = A.data.AGENTS.filter((a) => a.status === "online").length;
  d.getElementById("agentPause").click(); await wait(10);
  w2 = await reload(w);
  check("агенты: пауза сохраняется, счётчик агентов в шапке обновился", w2.AIWS.data.AGENTS.find((a) => a.id === "ag-sales").status === "offline" && new RegExp((onlineBefore - 1) + "\\s*/\\s*" + A.data.AGENTS.length).test(d.getElementById("topbar").textContent));

  check("агенты: updateAgent с некорректными данными отклоняется", A.db.updateAgent("ag-sales", { role: "hacker" }) === false && A.db.updateAgent("ag-sales", { channels: ["telegram", "zzz"] }) === false && A.data.AGENTS.find((a) => a.id === "ag-sales").role === "sales");
  check("агенты: createAgent отклоняет дубль id и битую запись", A.db.createAgent(Object.assign({}, A.data.AGENTS[0])) === null && A.db.createAgent({ id: "x", name: "y" }) === null);

  const snap = JSON.parse(w.localStorage.getItem(KEY));
  snap.AGENTS.push({ id: 'bad"><b id="pwnA">', name: "x", role: "sales", status: "online", monogram: "X", summary: "", instruction: "", funnelId: null, channels: [], knowledge: [], funnel: [], approvals: [] },
    { id: "ag-bad-role", name: "x", role: "hacker", status: "online", monogram: "X", summary: "", instruction: "", funnelId: null, channels: [], knowledge: [], funnel: [], approvals: [] },
    { id: "ag-bad-ch", name: "x", role: "hr", status: "online", monogram: "X", summary: "", instruction: "", funnelId: null, channels: ["zzz"], knowledge: [], funnel: [], approvals: [] });
  w2 = load({ storage: { [KEY]: JSON.stringify(snap) } }).window; await wait(30); w2.AIWS.navigate("agents"); await wait(15);
  check("агенты: битые записи в хранилище (XSS-id, роль, канал) отбрасываются", w2.AIWS.data.AGENTS.length === seedAgents + 1 && !w2.document.getElementById("pwnA"));
  snap.AGENTS = "oops"; w2 = load({ storage: { [KEY]: JSON.stringify(snap) } }).window; await wait(30);
  check("агенты: AGENTS не массив -> демо-агенты, приложение работает", w2.AIWS.data.AGENTS.length === seedAgents && w2.document.getElementById("view").children.length > 0);

  A.db.exportJSON(); await wait(10);
  const exp = JSON.parse(await readBlob(w, w.__lastBlob));
  check("экспорт JSON содержит AGENTS, COURSES, CERTIFICATES", Array.isArray(exp.AGENTS) && Array.isArray(exp.COURSES) && Array.isArray(exp.CERTIFICATES) && exp.AGENTS.some((a) => a.name === "Постоянный Агент"));
  A.db.resetAll(); await wait(10);
  check("сброс данных возвращает демо-агентов, курсы и сертификаты", A.data.AGENTS.length === seedAgents && !A.data.AGENTS.some((a) => a.name === "Постоянный Агент") && A.data.CERTIFICATES.length === 1 && A.data.COURSES[0].progress === 0.5);

  // ================= обучение: тест
  w = load().window; d = w.document; await wait(30); A = w.AIWS;
  const Q = A.data.QUIZZES, PASS = A.data.QUIZ_PASS;
  A.navigate("training"); await wait(15);
  const btn = (id) => d.querySelector('[data-quiz="' + id + '"]');
  check("тест: у незавершённых курсов кнопка «Пройти тест», у завершённого «Сертификат»", !!btn("crs-1") && !!btn("crs-2") && !btn("crs-3") && !!d.querySelector('[data-cert="crs-3"]') && !d.querySelector('#view [data-soon="Прохождение курса"]'));
  check("тест: у каждого демо-курса есть вопросы, ответ в диапазоне вариантов", ["crs-1", "crs-2", "crs-3"].every((id) => Q[id].length >= 4 && Q[id].every((q) => q.options.length === 4 && q.answer >= 0 && q.answer < 4)) && Math.abs(PASS - 0.7) < 1e-9);

  const open = async (id) => { A.navigate("training"); await wait(10); btn(id).click(); await wait(10); };
  const answer = async (id, picks) => { for (let i = 0; i < picks.length; i++) { const r = d.querySelector('input[name=qa][value="' + picks[i] + '"]'); r.checked = true; r.dispatchEvent(new w.Event("change")); d.getElementById("quizNext").click(); await wait(8); } };
  const correct = (id) => Q[id].map((q) => q.answer), wrong = (id) => Q[id].map((q) => (q.answer + 1) % 4);

  await open("crs-1");
  const modal = d.querySelector(".modal-card");
  check("тест: модалка с именем и условиями, фокус в поле имени", !!modal && !!d.getElementById("quizName") && /проходной балл: 70%/.test(modal.textContent) && d.activeElement.id === "quizName");
  d.getElementById("quizStart").click(); await wait(10);
  check("тест: без имени тест не начинается", !!d.getElementById("quizName") && /Введите имя/.test(d.body.textContent));
  d.getElementById("quizName").value = "Тестов Тест"; d.getElementById("quizStart").click(); await wait(10);
  check("тест: «Далее» заблокирована, пока не выбран ответ; вопрос в fieldset/legend", d.getElementById("quizNext").disabled && !!d.querySelector("fieldset legend") && d.querySelectorAll("input[name=qa]").length === 4 && /Вопрос 1 из 5/.test(d.body.textContent));
  const r0 = d.querySelector("input[name=qa]"); r0.checked = true; r0.dispatchEvent(new w.Event("change"));
  check("тест: после выбора ответа кнопка доступна, на последнем вопросе «Завершить»", !d.getElementById("quizNext").disabled);
  d.getElementById("quizNext").click(); await wait(8);
  // провал: 3 из 5 (60%) — первый ответ мы уже дали выше (0), остальные считаем заново с начала через «Попробовать снова»
  await answer("crs-1", [wrong("crs-1")[1], wrong("crs-1")[2], wrong("crs-1")[3], wrong("crs-1")[4]]);
  check("тест: провал — сообщение, список ошибок с верными ответами, сертификат не выдан", /Не хватило баллов/.test(d.querySelector(".modal-card").textContent) && /Верный ответ:/.test(d.querySelector(".modal-card").textContent) && A.data.COURSES[0].progress === 0.5 && A.data.CERTIFICATES.length === 1);
  d.getElementById("quizRetry").click(); await wait(10);
  check("тест: «Попробовать снова» возвращает к первому вопросу", /Вопрос 1 из 5/.test(d.body.textContent) && !d.getElementById("quizNext").disabled === false);
  const c1 = correct("crs-1"); const three = [c1[0], c1[1], c1[2], (c1[3] + 1) % 4, (c1[4] + 1) % 4];     // 3 из 5 = 60% < 70%
  await answer("crs-1", three);
  check("граница: 3 из 5 (60%) — не пройдено", /Не хватило баллов: 3 из 5 \(60%\)/.test(d.querySelector(".modal-card").textContent) && A.data.CERTIFICATES.length === 1);
  d.getElementById("quizRetry").click(); await wait(10);
  const four = [c1[0], c1[1], c1[2], c1[3], (c1[4] + 1) % 4];                                           // 4 из 5 = 80% >= 70%
  await answer("crs-1", four);
  const cert = A.data.CERTIFICATES[A.data.CERTIFICATES.length - 1];
  check("граница: 4 из 5 (80%) — пройдено, сообщение с результатом", /Тест пройден: 4 из 5 \(80%\)/.test(d.querySelector(".modal-card").textContent));
  check("сертификат: имя, курс, дата ГГГГ-ММ-ДД (UTC), оценка, уникальный id", cert.name === "Тестов Тест" && cert.course === A.data.COURSES[0].title && cert.date === new Date().toISOString().slice(0, 10) && Math.abs(cert.score - 0.8) < 1e-9 && cert.id === "cert-2");
  check("курс завершён: прогресс 100%, статус «Завершён»", A.data.COURSES[0].progress === 1 && A.data.COURSES[0].status === "Завершён");

  // PDF из результата (перехват jsPDF)
  w.eval(fs.readFileSync(path.join(DL, "vendor/jspdf.umd.min.js"), "utf8")); w.eval(fs.readFileSync(path.join(DL, "pdf-font.js"), "utf8"));
  const oa = d.head.appendChild.bind(d.head); d.head.appendChild = (el) => { if (el.tagName === "SCRIPT") { setTimeout(() => el.onload && el.onload(), 0); return el; } return oa(el); };
  const texts = []; let saved = null; const Orig = w.jspdf.jsPDF;
  w.jspdf.jsPDF = function () { const doc = new Orig(...arguments); const t = doc.text.bind(doc); doc.text = (x, ...r) => { texts.push(Array.isArray(x) ? x.join(" ") : String(x)); return t(x, ...r); }; doc.save = (n) => { saved = n; return doc; }; return doc; };
  d.getElementById("quizPdf").click(); await wait(300);
  check("сертификат: PDF на имя прошедшего, с названием курса", saved && /\.pdf$/.test(saved) && texts.includes("Тестов Тест") && texts.some((x) => /Продукт и тарифы/.test(x)));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(10);
  check("тест: Esc закрывает окно", !d.querySelector(".modal-card"));
  A.navigate("training"); await wait(15);
  check("фон обновился: у курса «Сертификат», в списке выданных новый сертификат", !btn("crs-1") && !!d.querySelector('[data-cert="crs-1"]') && /Тестов Тест/.test(d.getElementById("view").textContent));
  const w3 = await reload(w);
  check("итоги теста сохраняются после перезагрузки (курс и сертификат)", w3.AIWS.data.COURSES[0].progress === 1 && w3.AIWS.data.CERTIFICATES.some((c) => c.name === "Тестов Тест"));

  // граница порога на курсе из 4 вопросов (3/4 = 75% -> пройдено; 2/4 = 50% -> нет)
  await open("crs-2"); d.getElementById("quizName").value = "Аня"; d.getElementById("quizStart").click(); await wait(8);
  const c2 = correct("crs-2"); await answer("crs-2", [c2[0], c2[1], (c2[2] + 1) % 4, (c2[3] + 1) % 4]);
  check("граница: 2 из 4 (50%) — не пройдено", /Не хватило баллов: 2 из 4 \(50%\)/.test(d.querySelector(".modal-card").textContent));
  d.getElementById("quizRetry").click(); await wait(8);
  await answer("crs-2", [c2[0], c2[1], c2[2], (c2[3] + 1) % 4]);
  check("граница: 3 из 4 (75%) — пройдено; id следующего сертификата cert-3", /Тест пройден: 3 из 4 \(75%\)/.test(d.querySelector(".modal-card").textContent) && A.data.CERTIFICATES.slice(-1)[0].id === "cert-3");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(10);

  // безопасность и защита db
  check("db.completeCourse: пустое имя / неизвестный курс -> null, данные не меняются", A.db.completeCourse("crs-3", { name: "  ", score: 1 }) === null && A.db.completeCourse("nope", { name: "A", score: 1 }) === null && A.data.CERTIFICATES.length === 3);
  A.db.resetAll(); await wait(10); A.navigate("training"); await wait(15); btn("crs-2").click(); await wait(10);
  d.getElementById("quizName").value = '<b id="xssq">Имя</b>'; d.getElementById("quizStart").click(); await wait(8);
  await answer("crs-2", correct("crs-2")); await wait(10);
  check("имя с HTML не исполняется ни в окне результата, ни в списке сертификатов", !d.getElementById("xssq") && /&lt;|<b id="xssq">Имя<\/b>/.test(A.data.CERTIFICATES.slice(-1)[0].name));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(10); A.navigate("training"); await wait(15);
  check("список сертификатов экранирует имя", !d.getElementById("xssq") && d.getElementById("view").textContent.includes('<b id="xssq">Имя</b>'));
  check("нет ошибок в консоли", w.__errors.length === 0);

  console.log("PASS (" + pass.length + ")"); console.log("FAIL (" + fail.length + "): " + (fail.length ? "\n - " + fail.join("\n - ") : "(none)"));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(String(e.stack).split("\n").slice(0, 4).join("\n")); process.exit(1); });
