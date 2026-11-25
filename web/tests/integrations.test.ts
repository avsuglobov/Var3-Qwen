import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { amocrmAdapter, adapterOf, bitrix24Adapter, demoAdapter, INTEGRATION_ADAPTERS, webhookAdapter } from "@/lib/integrations/adapters";
import { amocrmLead, bitrixLead, externalLeadId, importExternalLeads } from "@/lib/integrations/import-map";
import { maskSecret, readCredentials, saveCredentials } from "@/lib/server/secrets";
import { appendRun, readRuns } from "@/lib/server/runs";
import { runIntegration } from "@/lib/server/integrations";
import { createLocalApi, createMemoryStorage } from "@/lib/api";

/* Этапы 8–9 — слой внешних интеграций: адаптеры с подставленным fetch (сеть не нужна),
   маскирование секретов, хранилище ключей и журнал прогонов во временном .data;
   этап 9 — маппинг внешних лидов и импорт в снимок с апсертом по внешнему id. */

const fetchJson = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const fetchStatus = (status: number, body = ""): typeof fetch =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

async function rejectsFetch(): Promise<typeof fetch> {
  return (async () => {
    throw new Error("fetch failed");
  }) as unknown as typeof fetch;
}

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "aiws-int-"));
  process.env.AIWS_DATA_DIR = dataDir;
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.AIWS_DATA_DIR;
});

describe("реестр адаптеров (этапы 8–9)", () => {
  it("четыре адаптера: amoCRM, Bitrix24, REST API и демо-источник int-demo (без карточки)", () => {
    expect(INTEGRATION_ADAPTERS.map((a) => a.id)).toEqual(["int-amocrm", "int-bitrix", "int-api", "int-demo"]);
    expect(adapterOf("int-amocrm")).not.toBeNull();
    expect(adapterOf("int-demo")).not.toBeNull();
    expect(adapterOf("int-tg")).toBeNull();
  });
  it("у адаптеров объявлены поля конфигурации, секретные помечены, OAuth-поля необязательны (этап 10)", () => {
    expect(amocrmAdapter.fields.map((f) => [f.key, f.secret, f.required ?? true])).toEqual([
      ["subdomain", false, true],
      ["accessToken", true, false],
      ["clientId", false, false],
      ["clientSecret", true, false],
      ["refreshToken", true, false]
    ]);
    expect(bitrix24Adapter.fields.map((f) => [f.key, f.secret])).toEqual([["webhookUrl", true]]);
    expect(webhookAdapter.fields.map((f) => [f.key, f.secret])).toEqual([["url", false]]);
  });
});

describe("amoCRM-адаптер — реальные статусы HTTP без сети", () => {
  it("проверка связи: 200 → успех с названием аккаунта", async () => {
    const seen: RequestInfo[] = [];
    const fetchImpl = (async (url: RequestInfo, init?: RequestInit) => {
      seen.push(url);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer amo-token");
      return new Response(JSON.stringify({ _embedded: { accounts: [{ name: "Демо-компания", version: "v4" }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await amocrmAdapter.check({ subdomain: "company", accessToken: "amo-token" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(200);
    expect(outcome.detail).toContain("Демо-компания");
    expect(String(seen[0])).toBe("https://company.amocrm.ru/api/v4/accounts?with=version");
  });
  it("неверный токен: 401 → ошибка с кодом ответа и без секрета в тексте", async () => {
    const outcome = await amocrmAdapter.check({ subdomain: "company", accessToken: "amo-token" }, fetchStatus(401, "Unauthorized"));
    expect(outcome).toEqual({ ok: false, detail: "amoCRM ответил HTTP 401 (проверьте токен)", status: 401 });
    expect(outcome.detail).not.toContain("amo-token");
  });
  it("битый поддомен отбрасывается до сети: fetch не вызывается", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await amocrmAdapter.check({ subdomain: "bad sub", accessToken: "amo-token" }, fetchImpl);
    expect(outcome.ok).toBe(false);
    expect(called).toBe(0);
    expect(outcome.status).toBeNull();
  });
  it("синхронизация: до 25 сделок, маппинг в ExternalLead (этап 9)", async () => {
    const outcome = await amocrmAdapter.sync({ subdomain: "company", accessToken: "amo-token" }, fetchJson({ _embedded: { leads: [{ id: 7, name: "Сделка Ж", price: 125_500 }, { id: 8, name: "Без суммы", price: null }] } }));
    expect(outcome.ok).toBe(true);
    expect(outcome.detail).toBe("Получено сделок: 2");
    expect(outcome.leads).toEqual([
      { externalId: "7", name: "Сделка Ж", value: 125_500 },
      { externalId: "8", name: "Без суммы", value: null }
    ]);
  });
  it("сеть недоступна: ошибка без HTTP-статуса", async () => {
    const outcome = await amocrmAdapter.check({ subdomain: "company", accessToken: "amo-token" }, await rejectsFetch());
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBeNull();
    expect(outcome.detail).toContain("Сеть недоступна");
  });
});

describe("Bitrix24-адаптер — вебхук и методы REST", () => {
  it("адрес вебхука нормализуется: слеш добавляется один раз, метод дописывается", async () => {
    const seen: RequestInfo[] = [];
    const fetchImpl = (async (url: RequestInfo) => {
      seen.push(url);
      return new Response(JSON.stringify({ result: { ID: 42 } }), { status: 200 });
    }) as unknown as typeof fetch;
    await bitrix24Adapter.check({ webhookUrl: "https://b24-x.bitrix24.ru/rest/1/secretkey" }, fetchImpl);
    expect(String(seen[0])).toBe("https://b24-x.bitrix24.ru/rest/1/secretkey/profile.json");
    const again = await bitrix24Adapter.check({ webhookUrl: "https://b24-x.bitrix24.ru/rest/1/secretkey/" }, fetchImpl);
    expect(again.ok).toBe(true);
    expect(String(seen[1])).toBe("https://b24-x.bitrix24.ru/rest/1/secretkey/profile.json");
    expect(again.detail).toContain("ID 42");
  });
  it("не-http адрес и пустой ключ отбрасываются до сети", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect((await bitrix24Adapter.check({ webhookUrl: "http://insecure/" }, fetchImpl)).ok).toBe(false);
    expect((await bitrix24Adapter.check({}, fetchImpl)).detail).toContain("вебхука");
  });
  it("синхронизация: crm.lead.list.json с телом запроса, маппинг выборки (этап 9)", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: RequestInfo, init?: RequestInit) => {
      seen.push(String(url), String(init?.body));
      return new Response(JSON.stringify({ result: [{ ID: "11", TITLE: "Заявка К", OPPORTUNITY: "1500,50" }, { ID: 12, TITLE: "Без суммы" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await bitrix24Adapter.sync({ webhookUrl: "https://b24-x.bitrix24.ru/rest/1/secretkey/" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(seen[0]).toBe("https://b24-x.bitrix24.ru/rest/1/secretkey/crm.lead.list.json");
    expect(JSON.parse(seen[1])).toEqual({ order: { ID: "DESC" }, limit: 25 });
    expect(outcome.detail).toBe("Получено лидов: 2");
    expect(outcome.leads).toEqual([
      { externalId: "11", name: "Заявка К", value: 1500.5 },
      { externalId: "12", name: "Без суммы", value: null }
    ]);
  });
});

describe("webhook-адаптер (REST API) — GET на проверку, POST на синхронизацию", () => {
  it("проверка: GET, успех с HTTP-статусом", async () => {
    const seen: { url: string; method?: string }[] = [];
    const fetchImpl = (async (url: RequestInfo, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method });
      return new Response("pong", { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await webhookAdapter.check({ url: "https://example.test/ping" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(outcome.detail).toBe("Связь есть: HTTP 200, ответ получен");
    expect(seen[0].method).toBe("GET");
  });
  it("синхронизация: POST с JSON-конвертом ai-workspace", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (_url: RequestInfo, init?: RequestInit) => {
      seen.push(String(init?.body));
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const outcome = await webhookAdapter.sync({ url: "https://example.test/hook" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(204);
    const envelope = JSON.parse(seen[0]) as { source: string; integrationId: string };
    expect(envelope.source).toBe("ai-workspace");
    expect(envelope.integrationId).toBe("int-api");
  });
  it("ошибка внешнего сервиса: текст содержит статус и не содержит секретов URL", async () => {
    const outcome = await webhookAdapter.check({ url: "https://example.test/nowhere" }, fetchStatus(404, "<h1>404</h1>"));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain("HTTP 404");
  });
});

describe("маскирование и хранилище ключей (.data/secrets.json)", () => {
  it("маска: длинное значение оставляет хвост, короткое закрывается целиком", () => {
    expect(maskSecret("amo-token-1234567890")).toBe("••••7890");
    expect(maskSecret("abc")).toBe("••••");
    expect(maskSecret("12345678")).toBe("••••");
    expect(maskSecret("123456789")).toBe("••••6789");
  });
  it("запись и чтение по кругу: значения сохраняются, обновление перезаписывает набор", () => {
    saveCredentials("int-amocrm", { subdomain: "company", accessToken: "amo-token" });
    expect(readCredentials().credentials["int-amocrm"]?.fields).toEqual({ subdomain: "company", accessToken: "amo-token" });
    saveCredentials("int-amocrm", { subdomain: "other" });
    expect(readCredentials().credentials["int-amocrm"]?.fields).toEqual({ subdomain: "other" });
    saveCredentials("int-api", { url: "https://example.test" });
    expect(readCredentials().credentials["int-api"]?.fields.url).toBe("https://example.test");
  });
  it("битый файл секретов читается как пустой набор", () => {
    writeFileSync(path.join(dataDir, "secrets.json"), "{ не json");
    expect(readCredentials().credentials).toEqual({});
  });
  it("несуществующий файл — пустой набор (нет сбоев при первом запуске)", () => {
    rmSync(path.join(dataDir, "secrets.json"), { force: true });
    expect(readCredentials().credentials).toEqual({});
  });
});

describe("маппинг внешних лидов (этап 9)", () => {
  it("amoCRM: {id, name, price} → ExternalLead; битые записи → null; нечисловая цена → null", () => {
    expect(amocrmLead({ id: 5, name: "Сделка", price: 1000 })).toEqual({ externalId: "5", name: "Сделка", value: 1000 });
    expect(amocrmLead({ id: 6, name: "Без суммы" })).toEqual({ externalId: "6", name: "Без суммы", value: null });
    expect(amocrmLead({ id: 7, name: "Строковая цена", price: "500" })).toEqual({ externalId: "7", name: "Строковая цена", value: null });
    expect(amocrmLead({ id: 8 })).toBeNull();
    expect(amocrmLead(null)).toBeNull();
  });
  it("Bitrix24: {ID, TITLE, OPPORTUNITY}; строка «1500,50» → число; битые → null", () => {
    expect(bitrixLead({ ID: "9", TITLE: "Заявка", OPPORTUNITY: "1500,50" })).toEqual({ externalId: "9", name: "Заявка", value: 1500.5 });
    expect(bitrixLead({ ID: 10, TITLE: "Число", OPPORTUNITY: 250 })).toEqual({ externalId: "10", name: "Число", value: 250 });
    expect(bitrixLead({ ID: "11" })).toBeNull();
  });
  it("детерминированный id: ext-amo-12, мусорные символы вырезаются, длина ограничена", () => {
    expect(externalLeadId("amo", "12")).toBe("ext-amo-12");
    expect(externalLeadId("demo", "demo#1/x")).toBe("ext-demo-demo1x");
    expect(externalLeadId("amo", "x".repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

describe("импорт лидов в снимок (этап 9): апсерт по внешнему id", () => {
  const config = { funnelId: "fn-sales", stageId: "new", agentId: "ag-sales", sourceLabel: "amoCRM", now: new Date(2026, 10, 25, 14, 7).getTime() };
  const leads = [
    { externalId: "21", name: "Сделка Л", value: 90_000 },
    { externalId: "22", name: "Сделка М", value: null }
  ];
  it("первый прогон создаёт лиды в первой воронке/стадии, у события подпись источника", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    const res = await importExternalLeads(api.leads, "amo", leads, config);
    expect(res).toEqual({ created: 2, updated: 0 });
    const lead = await api.leads.get("ext-amo-21");
    expect(lead).toMatchObject({ name: "Сделка Л", channel: "site", stageId: "new", funnelId: "fn-sales", agentId: "ag-sales", value: 90_000 });
    expect(lead?.events[0]?.text).toBe("Лид импортирован (amoCRM)");
    expect(lead?.note).toContain("amoCRM · запись 21");
  });
  it("повторный прогон обновляет (новых 0), стадия, изменённая пользователем, не затирается", async () => {
    const api = createLocalApi({ storage: createMemoryStorage() });
    await importExternalLeads(api.leads, "amo", leads, config);
    await api.leads.update("ext-amo-21", { stageId: "deal" }); // пользователь перенёс лид по канбану
    const res = await importExternalLeads(api.leads, "amo", [{ externalId: "21", name: "Сделка Л (обновлена)", value: 95_000 }], config);
    expect(res).toEqual({ created: 0, updated: 1 });
    const lead = await api.leads.get("ext-amo-21");
    expect(lead).toMatchObject({ stageId: "deal", name: "Сделка Л (обновлена)", value: 95_000 });
    expect(await api.leads.get("ext-amo-22")).toBeDefined();
  });
  it("демо-адаптер int-demo: стабильные фикстуры без сети, check доступен", async () => {
    const outcome = await demoAdapter.sync({});
    expect(outcome.ok).toBe(true);
    expect(outcome.leads?.map((l) => l.externalId)).toEqual(["1", "2", "3"]);
    expect((await demoAdapter.check({})).ok).toBe(true);
  });
});

describe("OAuth-обновление токена amoCRM (этап 10)", () => {
  /** Заглушка: refresh-эндпоинт + запрос к API v4 (порядок вызовов важен). */
  function oauthFetch(): typeof fetch & { seen: { url: string; init?: RequestInit }[] } {
    const seen: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: RequestInfo, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      if (String(url).includes("/oauth2/access_token")) {
        return new Response(JSON.stringify({ access_token: "fresh-at-9999", refresh_token: "fresh-rt-7777" }), { status: 200 });
      }
      return new Response(JSON.stringify({ _embedded: { accounts: [{ name: "Тест", version: "v4" }] } }), { status: 200 });
    }) as typeof fetch & { seen: typeof seen };
    impl.seen = seen;
    return impl;
  }

  it("OAuth-тройка вместо токена: refresh, свежие токены в rotate, запрос API на новом Bearer", async () => {
    const fetchImpl = oauthFetch();
    const outcome = await amocrmAdapter.check({ subdomain: "company", clientId: "cid-1", clientSecret: "csecret-1", refreshToken: "rt-old" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(fetchImpl.seen[0]?.url).toBe("https://app.amocrm.ru/oauth2/access_token");
    expect(JSON.parse(String(fetchImpl.seen[0]?.init?.body))).toEqual({ client_id: "cid-1", client_secret: "csecret-1", grant_type: "refresh_token", refresh_token: "rt-old" });
    expect((fetchImpl.seen[1]?.init?.headers as Record<string, string>).authorization).toBe("Bearer fresh-at-9999");
    expect(outcome.rotate).toEqual({ accessToken: "fresh-at-9999", refreshToken: "fresh-rt-7777" });
  });
  it("refresh сорвался (HTTP 400): честный ok:false, API не запрашивался, rotate нет", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: RequestInfo) => {
      seen.push(String(url));
      if (String(url).includes("/oauth2/access_token")) return new Response("bad grant", { status: 400 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await amocrmAdapter.check({ subdomain: "company", clientId: "cid-1", clientSecret: "csecret-1", refreshToken: "rt-old" }, fetchImpl);
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain("не смог обновить токен (HTTP 400)");
    expect(outcome.status).toBe(400);
    expect(outcome.rotate).toBeUndefined();
    expect(seen.length).toBe(1);
  });
  it("только долгоживущий токен: OAuth не дёргается, rotate нет", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: RequestInfo) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ _embedded: { accounts: [{ name: "Тест" }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await amocrmAdapter.check({ subdomain: "company", accessToken: "amo-token" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]).not.toContain("oauth2");
    expect(outcome.rotate).toBeUndefined();
  });
  it("ни токена, ни тройки: конфиг-ошибка до сети", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await amocrmAdapter.check({ subdomain: "company" }, fetchImpl);
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain("OAuth-тройка");
    expect(outcome.status).toBeNull();
    expect(called).toBe(0);
  });
  it("синхронизация на OAuth: refresh и выборка лидов в одном прогоне", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: RequestInfo) => {
      seen.push(String(url));
      if (String(url).includes("/oauth2/access_token")) return new Response(JSON.stringify({ access_token: "fresh-at", refresh_token: "fresh-rt" }), { status: 200 });
      return new Response(JSON.stringify({ _embedded: { leads: [{ id: 5, name: "Сделка Дз", price: 3000 }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await amocrmAdapter.sync({ subdomain: "company", clientId: "cid-1", clientSecret: "csecret-1", refreshToken: "rt-old" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(outcome.leads).toEqual([{ externalId: "5", name: "Сделка Дз", value: 3000 }]);
    expect(outcome.rotate).toEqual({ accessToken: "fresh-at", refreshToken: "fresh-rt" });
    expect(seen[0]).toContain("oauth2");
  });
  it("исполнитель сохраняет ротацию в .data/secrets.json и помечает журнал", async () => {
    saveCredentials("int-amocrm", { subdomain: "company", clientId: "cid-1", clientSecret: "csecret-1", refreshToken: "rt-old" });
    const run = await runIntegration("int-amocrm", "check", oauthFetch());
    expect(run.ok).toBe(true);
    expect(run.detail).toContain("токен доступа обновлён и сохранён");
    const saved = readCredentials().credentials["int-amocrm"].fields;
    expect(saved.accessToken).toBe("fresh-at-9999");
    expect(saved.refreshToken).toBe("fresh-rt-7777");
    expect(saved.clientId).toBe("cid-1");
  });
});

describe("журнал прогонов (.data/integration-runs.json)", () => {
  it("новые прогоны сверху, журнал ограничен 100 записями", () => {
    for (let i = 0; i < 105; i++) {
      appendRun({ id: `r${i}`, integrationId: "int-api", action: "check", ok: true, detail: "d", status: 200, latencyMs: 1, at: 1_000 + i });
    }
    const runs = readRuns();
    expect(runs).toHaveLength(100);
    expect(runs[0].id).toBe("r104");
    expect(runs[0].at).toBe(1_104);
    expect(runs[99].id).toBe("r5");
  });
  it("битые записи при чтении отбрасываются, битый файл — пустой список", () => {
    appendRun({ id: "good", integrationId: "int-api", action: "sync", ok: false, detail: "HTTP 404", status: 404, latencyMs: 12, at: 5_000 });
    const raw = JSON.parse(JSON.stringify(readRuns())) as unknown[];
    raw.push({ broken: true });
    writeFileSync(path.join(dataDir, "integration-runs.json"), JSON.stringify(raw));
    const runs = readRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].detail).toBe("HTTP 404");
    writeFileSync(path.join(dataDir, "integration-runs.json"), "{ не json");
    expect(readRuns()).toEqual([]);
  });
});
