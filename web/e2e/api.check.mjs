/* api.check.mjs — проверки REST-слоя (этап 4): контракт маршрутов app/api против хранилища на сервере.
   Без браузера: чистый fetch. Покрывает CRUD, batch, complete, справочники, экспорт/импорт/сброс,
   панель сбоев /api/debug (503, задержка, битый файл с восстановлением демо-данных) и переживание
   перезапуска сервера (данные живут в .data/db.json, а не в браузере).
   Запуск: npm run build && node e2e/api.check.mjs */
import { apiItems, apiProfile, apiReset, importSnapshot, reporter, setFaults, startServer, waitReady } from "./lib/harness.mjs";

const { check, done } = reporter();
const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || "3101"}`;

const j = async (res) => ({ status: res.status, body: await res.text().then((t) => (t ? JSON.parse(t) : null)) });
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const put = (path, body) => fetch(BASE + path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const del = (path) => fetch(BASE + path, { method: "DELETE" });

async function main() {
  const server = startServer();
  let code = 1;
  try {
    await waitReady("/api/collections/leads");
    await apiReset();
    const seedLeads = await apiItems("leads");

    // ---------- чтение коллекций
    check("GET коллекции: 200, массив демо-лидов", (await j(await fetch(BASE + "/api/collections/leads"))).status === 200 && Array.isArray(seedLeads) && seedLeads.length === 6);
    check("неизвестная коллекция: 404 not_found", (await j(await fetch(BASE + "/api/collections/nope"))).body.code === "not_found");
    check("GET записи: 200; отсутствующей — 404", (await j(await fetch(`${BASE}/api/collections/leads/${seedLeads[0].id}`))).status === 200 && (await j(await fetch(BASE + "/api/collections/leads/LD-9999"))).status === 404);

    // ---------- CRUD
    const lead = { ...seedLeads[0], id: "LD-8001", name: "REST-лид" };
    const created = await j(await post("/api/collections/leads", lead));
    check("POST: 201 и запись в списке", created.status === 201 && (await apiItems("leads")).some((l) => l.id === "LD-8001"));
    check("повторный POST того же id: 409 duplicate", (await j(await post("/api/collections/leads", lead))).body.code === "duplicate");
    const patched = await j(await put("/api/collections/leads/LD-8001", { name: "REST-лид правка" }));
    check("PUT: 200, имя обновлено", patched.status === 200 && patched.body.name === "REST-лид правка");
    check("PUT битым патчем: 400 validation", (await j(await put("/api/collections/leads/LD-8001", { channel: "hacked" }))).body.code === "validation");
    check("DELETE: 204, затем 404", (await del("/api/collections/leads/LD-8001")).status === 204 && (await j(await fetch(BASE + "/api/collections/leads/LD-8001"))).status === 404);

    // ---------- batch (импорт базы)
    const batch = await j(await post("/api/collections/leads/batch", { items: [{ ...seedLeads[0], id: "LD-8100", name: "Импорт 1" }, { ...seedLeads[1], id: "LD-8101", name: "Импорт 2" }] }));
    check("batch: 201, оба лида созданы одним запросом", batch.status === 201 && (await apiItems("leads")).filter((l) => l.id.startsWith("LD-81")).length === 2);
    check("batch не для лидов: 400", (await j(await post("/api/collections/agents/batch", { items: [] }))).body.code === "validation");
    check("batch без массива items: 400", (await j(await post("/api/collections/leads/batch", { leads: [] }))).body.code === "validation");
    await apiReset();

    // ---------- завершение курса
    const cert = await j(await post("/api/collections/courses/crs-1/complete", { name: "Иван Иванов", score: 0.95 }));
    check("complete: 201, сертификат cert-2 с оценкой", cert.status === 201 && cert.body.id === "cert-2" && cert.body.score === 0.95);
    check("курс crs-1 после complete: «Завершён»", (await apiItems("courses")).find((c) => c.id === "crs-1")?.status === "Завершён");
    check("complete несуществующего курса: 404", (await j(await post("/api/collections/courses/crs-99/complete", { name: "Иван", score: 1 }))).status === 404);
    await apiReset();

    // ---------- профиль и справочники
    check("company-profile GET: объект с name", typeof (await apiProfile()).name === "string");
    check("company-profile PUT: патч применяется", (await j(await put("/api/company-profile", { about: "Новое описание" }))).status === 200 && (await apiProfile()).about === "Новое описание");
    const channels = await j(await fetch(BASE + "/api/reference/channels"));
    const quizzes = await j(await fetch(BASE + "/api/reference/quizzes"));
    check("справочники: channels массив, quizzes {pass, quizzes}", channels.status === 200 && Array.isArray(channels.body) && quizzes.status === 200 && typeof quizzes.body.pass === "number" && typeof quizzes.body.quizzes === "object");
    check("неизвестный справочник: 404", (await j(await fetch(BASE + "/api/reference/nope"))).status === 404);

    // ---------- экспорт / импорт / сброс
    const snap = await (await fetch(BASE + "/api/data/export")).text();
    check("export: снимок version:1 с коллекциями", JSON.parse(snap).version === 1 && Array.isArray(JSON.parse(snap).LEADS));
    const imp = await j(await post("/api/data/import", JSON.stringify({ version: 1, LEADS: [], NOTIFICATIONS: [] })));
    check("import: перечисленные коллекции заменены, отчёт {imported, dropped}", imp.status === 200 && imp.body.imported.length === 2 && imp.body.dropped === 0 && (await apiItems("leads")).length === 0);
    check("import битого JSON: 422 invalid_import", (await j(await post("/api/data/import", "{nope"))).body.code === "invalid_import");
    await apiReset();
    check("reset: демо-лиды возвращаются", (await apiItems("leads")).length === 6);

    // ---------- панель сбоев: настоящие сетевые состояния
    check("debug GET: сбои выключены", (await j(await fetch(BASE + "/api/debug"))).body.fail === false);
    await setFaults({ fail: true });
    check("fail: коллекции отвечают 503 unavailable", (await j(await fetch(BASE + "/api/collections/leads"))).body.code === "unavailable" && (await j(await fetch(BASE + "/api/collections/leads"))).status === 503);
    check("fail: справочники и профиль тоже 503", (await j(await fetch(BASE + "/api/reference/stages"))).status === 503 && (await j(await fetch(BASE + "/api/company-profile"))).status === 503);
    await setFaults({ fail: false, latencyMs: 600 });
    const slowStarted = Date.now();
    await fetch(BASE + "/api/collections/leads");
    const slowMs = Date.now() - slowStarted;
    await setFaults({ latencyMs: 0 });
    const quickStarted = Date.now();
    await fetch(BASE + "/api/collections/leads");
    check(`fail выключен, задержка сервера видна в ответе (${slowMs} мс, затем быстро)`, slowMs >= 550 && Date.now() - quickStarted < 400);

    // ---------- битый файл хранилища: приложение восстанавливает демо-данные
    await setFaults({ corrupt: true });
    check("corrupt: следующий запрос отдаёт демо-данные вместо ошибки", (await apiItems("leads")).length === 6);
    check("corrupt: файл вылечен записанным снимком", (await j(await fetch(BASE + "/api/data/export"))).status === 200 && JSON.parse(await (await fetch(BASE + "/api/data/export")).text()).LEADS.length === 6);

    // ---------- переживание перезапуска сервера: данные в файле, а не в памяти браузера
    await post("/api/collections/leads", { ...seedLeads[0], id: "LD-8200", name: "Переживает перезапуск" });
    check("запись перед перезапуском создана", (await apiItems("leads")).some((l) => l.id === "LD-8200"));
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    const second = startServer();
    await waitReady("/api/collections/leads");
    check("после перезапуска сервера данные на месте (файл .data/db.json)", (await apiItems("leads")).some((l) => l.id === "LD-8200"));
    await apiReset();
    second.kill("SIGTERM");

    code = done("api.check");
  } catch (e) {
    console.error("ошибка прогона:", e);
  } finally {
    if (server && server.exitCode === null) server.kill("SIGTERM");
  }
  process.exit(code);
}

main();
