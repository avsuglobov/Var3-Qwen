import { amocrmLead, bitrixLead } from "./import-map";
import { configError, netError, type ExternalLead, type IntegrationAdapter, type IntegrationRunOutcome } from "./types";

/**
 * Адаптеры внешних сервисов (этапы 8–9): реальные HTTP-запросы выполняются только на сервере.
 * Набор полей конфигурации задаёт адаптер — значения вводятся вручную в диалоге «Ключи» и
 * хранятся в .data/secrets.json. Секреты не попадают в тексты результатов: ошибки возвращают
 * только HTTP-статус и короткое пояснение. Этап 9: sync приносит не только доступность, но и
 * выборку лидов (до 25 записей) — их маппинг и запись в снимок делает маршрут синхронизации.
 * В e2e сеть не трогается: реальный обмен покрывают unit-тесты с подставленным fetch,
 * e2e использует webhook-адаптер с адресом самого приложения и демо-источник int-demo.
 */

const TIMEOUT_MS = 10_000;
/** Сколько записей запрашивает синхронизация за один прогон (первая страница, новые сверху). */
const SYNC_PAGE = 25;

/** Базовый вызов: единая обработка статусов, таймаута и сетевых ошибок. */
async function call(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<IntegrationRunOutcome> {
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.text();
    return {
      ok: res.ok,
      detail: res.ok
        ? `HTTP ${res.status}, ответ ${body.length} Б`
        : `Внешний сервис ответил HTTP ${res.status}: ${body.slice(0, 200)}`,
      status: res.status
    };
  } catch (e) {
    return netError(e);
  }
}

const AMOCRM_SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;

/** amoCRM (int-amocrm): долгоживущий токен доступа, API v4. OAuth-обновление токена — следующий шаг. */
export const amocrmAdapter: IntegrationAdapter = {
  id: "int-amocrm",
  fields: [
    { key: "subdomain", label: "Поддомен", secret: false, hint: "Например, company — адрес будет company.amocrm.ru" },
    { key: "accessToken", label: "Токен доступа", secret: true }
  ],
  async check(creds, fetchImpl = fetch) {
    const subdomain = (creds.subdomain ?? "").trim();
    const token = (creds.accessToken ?? "").trim();
    if (!AMOCRM_SUBDOMAIN_RE.test(subdomain)) return configError("Не задан корректный поддомен amoCRM (буквы, цифры и дефис)");
    if (!token) return configError("Не задан токен доступа amoCRM");
    try {
      const res = await fetchImpl(`https://${subdomain}.amocrm.ru/api/v4/accounts?with=version`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { ok: false, detail: `amoCRM ответил HTTP ${res.status} (проверьте токен)`, status: res.status };
      const body = (await res.json().catch(() => null)) as { _embedded?: { accounts?: { name?: string; version?: string }[] } } | null;
      const account = body?._embedded?.accounts?.[0];
      return {
        ok: true,
        detail: account ? `Связь есть: аккаунт «${(account.name ?? "без названия").slice(0, 100)}», API v4${account.version ? ` (версия ${account.version})` : ""}` : `HTTP ${res.status}, аккаунт получен`,
        status: res.status
      };
    } catch (e) {
      return netError(e);
    }
  },
  async sync(creds, fetchImpl = fetch) {
    const subdomain = (creds.subdomain ?? "").trim();
    const token = (creds.accessToken ?? "").trim();
    if (!AMOCRM_SUBDOMAIN_RE.test(subdomain)) return configError("Не задан корректный поддомен amoCRM (буквы, цифры и дефис)");
    if (!token) return configError("Не задан токен доступа amoCRM");
    try {
      const res = await fetchImpl(`https://${subdomain}.amocrm.ru/api/v4/leads?limit=${SYNC_PAGE}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { ok: false, detail: `amoCRM ответил HTTP ${res.status} при запросе сделок`, status: res.status };
      const body = (await res.json().catch(() => null)) as { _embedded?: { leads?: unknown[] } } | null;
      const leads = (body?._embedded?.leads ?? []).flatMap((raw) => {
        const lead = amocrmLead(raw);
        return lead ? [lead] : [];
      });
      return { ok: true, detail: `Получено сделок: ${leads.length}`, status: res.status, leads };
    } catch (e) {
      return netError(e);
    }
  }
};

/** Адрес входящего вебхука Bitrix24 — нормализация к виду https://…/rest/…/ (без лишнего слеша). */
function normalizeWebhook(raw: string | undefined): string {
  const url = (raw ?? "").trim();
  if (!/^https:\/\/.+/i.test(url)) return "";
  return url.endsWith("/") ? url : `${url}/`;
}

/** Bitrix24 (int-bitrix): входящий вебхук, методы REST поверх URL вебхука. */
export const bitrix24Adapter: IntegrationAdapter = {
  id: "int-bitrix",
  fields: [
    { key: "webhookUrl", label: "Адрес входящего вебхука", secret: true, hint: "https://company.bitrix24.ru/rest/1/xxxxxxxx/" }
  ],
  async check(creds, fetchImpl = fetch) {
    const base = normalizeWebhook(creds.webhookUrl);
    if (!base) return configError("Не задан корректный адрес вебхука Bitrix24 (https://…/rest/…)");
    try {
      const res = await fetchImpl(`${base}profile.json`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { ok: false, detail: `Bitrix24 ответил HTTP ${res.status} (проверьте вебхук)`, status: res.status };
      const body = (await res.json().catch(() => null)) as { result?: { ID?: string | number } } | null;
      return {
        ok: true,
        detail: body?.result?.ID ? `Связь есть: профиль вебхука получен (ID ${body.result.ID})` : `HTTP ${res.status}, профиль получен`,
        status: res.status
      };
    } catch (e) {
      return netError(e);
    }
  },
  async sync(creds, fetchImpl = fetch) {
    const base = normalizeWebhook(creds.webhookUrl);
    if (!base) return configError("Не задан корректный адрес вебхука Bitrix24 (https://…/rest/…)");
    try {
      const res = await fetchImpl(`${base}crm.lead.list.json`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: { ID: "DESC" }, limit: SYNC_PAGE }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { ok: false, detail: `Bitrix24 ответил HTTP ${res.status} при запросе лидов`, status: res.status };
      const body = (await res.json().catch(() => null)) as { result?: unknown[] } | null;
      const leads = (Array.isArray(body?.result) ? body.result : []).flatMap((raw) => {
        const lead = bitrixLead(raw);
        return lead ? [lead] : [];
      });
      return { ok: true, detail: `Получено лидов: ${leads.length}`, status: res.status, leads };
    } catch (e) {
      return netError(e);
    }
  }
};

/**
 * Универсальный webhook (int-api, карточка «REST API»): любой внешний адрес.
 * Проверка — GET, синхронизация — POST с JSON-конвертом. Этот же адаптер используется
 * в e2e с адресом самого приложения — реальная сеть не нужна.
 */
export const webhookAdapter: IntegrationAdapter = {
  id: "int-api",
  fields: [
    { key: "url", label: "URL внешнего сервиса", secret: false, hint: "https://… — GET для проверки, POST для синхронизации" }
  ],
  async check(creds, fetchImpl = fetch) {
    const url = (creds.url ?? "").trim();
    if (!/^https?:\/\/.+/i.test(url)) return configError("Не задан корректный URL (http(s)://…)");
    const outcome = await call(url, { method: "GET" }, fetchImpl);
    return outcome.ok ? { ...outcome, detail: `Связь есть: HTTP ${outcome.status}, ответ получен` } : outcome;
  },
  async sync(creds, fetchImpl = fetch) {
    const url = (creds.url ?? "").trim();
    if (!/^https?:\/\/.+/i.test(url)) return configError("Не задан корректный URL (http(s)://…)");
    return call(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "ai-workspace", integrationId: "int-api", at: new Date().toISOString() })
    }, fetchImpl);
  }
};

/**
 * Демо-источник (int-demo): встроенный адаптер без сети — три стабильных лида-фикстуры.
 * Нужен для проверки цикла «синхронизация → снимок» в e2e и при развёртывании без ключей;
 * в справочнике карточек его нет, поэтому в интерфейсе он не появляется.
 */
export const demoAdapter: IntegrationAdapter = {
  id: "int-demo",
  fields: [],
  async check() {
    return { ok: true, detail: "Демо-источник доступен (без сети)", status: 200 };
  },
  async sync() {
    const leads: ExternalLead[] = [
      { externalId: "1", name: "Импорт: сделка Г", value: 150_000 },
      { externalId: "2", name: "Импорт: сделка Д", value: null },
      { externalId: "3", name: "Импорт: сделка Е", value: 42_000 }
    ];
    return { ok: true, detail: `Демо-источник вернул ${leads.length} лида`, status: 200, leads };
  }
};

/**
 * Реестр адаптеров. Карточки справочника INTEGRATIONS с адаптером: int-amocrm, int-bitrix,
 * int-api («Адаптер появится позже» — у остальных). int-demo в справочнике отсутствует:
 * маршрут /api/integrations/sync принимает его, интерфейс — нет.
 */
export const INTEGRATION_ADAPTERS: readonly IntegrationAdapter[] = [amocrmAdapter, bitrix24Adapter, webhookAdapter, demoAdapter];

const ADAPTER_BY_ID = new Map(INTEGRATION_ADAPTERS.map((a) => [a.id, a] as const));

/** Адаптер по id справочника INTEGRATIONS; null — адаптера для этой интеграции нет. */
export function adapterOf(integrationId: string): IntegrationAdapter | null {
  return ADAPTER_BY_ID.get(integrationId) ?? null;
}
