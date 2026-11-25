import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { amocrmAdapter, adapterOf, bitrix24Adapter, INTEGRATION_ADAPTERS, webhookAdapter } from "@/lib/integrations/adapters";
import { maskSecret, readCredentials, saveCredentials } from "@/lib/server/secrets";
import { appendRun, readRuns } from "@/lib/server/runs";

/* Этап 8 — слой внешних интеграций: адаптеры с подставленным fetch (сеть не нужна),
   маскирование секретов, хранилище ключей и журнал прогонов во временном .data. */

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

describe("реестр адаптеров (этап 8)", () => {
  it("адаптеры у трёх карточек справочника: amoCRM, Bitrix24, REST API", () => {
    expect(INTEGRATION_ADAPTERS.map((a) => a.id)).toEqual(["int-amocrm", "int-bitrix", "int-api"]);
    expect(adapterOf("int-amocrm")).not.toBeNull();
    expect(adapterOf("int-tg")).toBeNull();
  });
  it("у адаптеров объявлены поля конфигурации, секретные помечены", () => {
    expect(amocrmAdapter.fields.map((f) => [f.key, f.secret])).toEqual([["subdomain", false], ["accessToken", true]]);
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
  it("синхронизация: список сделок получен, в выборке 1", async () => {
    const outcome = await amocrmAdapter.sync({ subdomain: "company", accessToken: "amo-token" }, fetchJson({ _embedded: { leads: [{ id: 1 }] } }));
    expect(outcome.ok).toBe(true);
    expect(outcome.detail).toBe("Список сделок получен (в выборке 1)");
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
  it("синхронизация: crm.lead.list.json с телом запроса, счётчик выборки", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: RequestInfo, init?: RequestInit) => {
      seen.push(String(url), String(init?.body));
      return new Response(JSON.stringify({ result: [{ ID: 1 }, { ID: 2 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await bitrix24Adapter.sync({ webhookUrl: "https://b24-x.bitrix24.ru/rest/1/secretkey/" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    expect(seen[0]).toBe("https://b24-x.bitrix24.ru/rest/1/secretkey/crm.lead.list.json");
    expect(JSON.parse(seen[1])).toEqual({ order: { ID: "DESC" }, limit: 1 });
    expect(outcome.detail).toContain("в выборке 2");
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
