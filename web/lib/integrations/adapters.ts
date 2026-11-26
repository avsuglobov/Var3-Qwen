import { amocrmLead, bitrixLead } from "./import-map";
import { configError, netError, type ExternalLead, type IntegrationAdapter, type IntegrationRunOutcome } from "./types";

/**
 * Адаптеры внешних сервисов (этапы 8–10): реальные HTTP-запросы выполняются только на сервере.
 * Набор полей конфигурации задаёт адаптер — значения вводятся вручную в диалоге «Ключи» и
 * хранятся в .data/secrets.json. Секреты не попадают в тексты результатов: ошибки возвращают
 * только HTTP-статус и короткое пояснение. Этап 9: sync приносит не только доступность, но и
 * выборку лидов (до 25 записей) — их маппинг и запись в снимок делает маршрут синхронизации.
 * Этап 10: авторизация amoCRM — долгоживущий токен или OAuth-тройка; при OAuth свежие токены
 * возвращаются в rotate, исполнитель сохраняет их в .data/secrets.json автоматически.
 * Этап 12: синхронизация инкрементальная — курсор «последний успешный полный прогон» приходит
 * из secrets.json; amoCRM фильтрует по filter[updated_at][from] (unix-секунды), Bitrix24 — по
 * «>=DATE_MODIFY» (ISO 8601), выборка пагинируется до потолка 250 записей за прогон; при обрезке
 * адаптер помечает truncated и исполнитель не двигает курсор. Демо-источник и webhook курсор
 * не поддерживают — отдают выборку целиком, как раньше.
 * В e2e сеть не трогается: реальный обмен покрывают unit-тесты с подставленным fetch,
 * e2e использует webhook-адаптер с адресом самого приложения и демо-источник int-demo.
 */

const TIMEOUT_MS = 10_000;
/** Сколько записей запрашивает синхронизация за одну страницу amoCRM (потолок API — 250). */
const SYNC_PAGE = 25;
/** Этап 12: потолок записей одного прогона; изменённые сверх потолка остаются на следующие прогоны. */
const SYNC_CEILING = 250;
/** Этап 12: перекрытие курсора — фильтр берёт записи «обновлённые за минуту до сохранённого момента»; повторы гасит апсерт. */
const CURSOR_OVERLAP_MS = 60_000;

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

const AMOCRM_TOKEN_URL = "https://app.amocrm.ru/oauth2/access_token";

/**
 * Общий запрос токена amoCRM (этапы 10–11): обновление по refresh-токену и выдача по коду
 * авторизации идут на один эндпоинт и отличаются только grant_type. Итог — токены либо
 * готовый неуспешный outcome; тексты ошибок не содержат секретов, только HTTP-статус.
 */
export async function amocrmTokenRequest(action: string, payload: Record<string, string>, fetchImpl: typeof fetch): Promise<{ ok: true; accessToken: string; refreshToken?: string } | IntegrationRunOutcome> {
  try {
    const res = await fetchImpl(AMOCRM_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return { ok: false, detail: `amoCRM не смог ${action} (HTTP ${res.status})`, status: res.status };
    const body = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string } | null;
    if (!body?.access_token) return { ok: false, detail: "amoCRM ответил без access_token", status: res.status };
    return { ok: true, accessToken: body.access_token, refreshToken: body.refresh_token };
  } catch (e) {
    return netError(e);
  }
}

/**
 * Авторизация amoCRM (этап 10): долгоживущий токен или OAuth-тройка (ID интеграции,
 * секретный ключ, refresh-токен). При OAuth — запрос свежего токена перед каждым прогоном;
 * новые токены возвращаются в rotate — исполнитель сохранит их в .data/secrets.json
 * (amoCRM сменяет refresh-токен при каждом выпуске доступа). Итог — либо готовый токен,
 * либо готовый неуспешный outcome.
 */
type AmoAuth = { token: string; rotate?: Record<string, string> };

async function amocrmAuth(creds: Record<string, string>, fetchImpl: typeof fetch): Promise<AmoAuth | IntegrationRunOutcome> {
  const token = (creds.accessToken ?? "").trim();
  if (token) return { token };
  const clientId = (creds.clientId ?? "").trim();
  const clientSecret = (creds.clientSecret ?? "").trim();
  const refreshToken = (creds.refreshToken ?? "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return configError("Не задан токен доступа amoCRM и не заполнена OAuth-тройка (ID интеграции, секретный ключ, refresh-токен) — заполните либо токен, либо все три поля");
  }
  const issued = await amocrmTokenRequest("обновить токен", { client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
  if (!("accessToken" in issued)) return issued;
  return { token: issued.accessToken, rotate: { accessToken: issued.accessToken, refreshToken: issued.refreshToken ?? refreshToken } };
}

/** amoCRM (int-amocrm): API v4; авторизация — долгоживущий токен либо OAuth с автообновлением. */
export const amocrmAdapter: IntegrationAdapter = {
  id: "int-amocrm",
  fields: [
    { key: "subdomain", label: "Поддомен", secret: false, hint: "Например, company — адрес будет company.amocrm.ru" },
    { key: "accessToken", label: "Токен доступа", secret: true, required: false, hint: "Долгоживущий токен; если пуст — автообновление по OAuth-тройке ниже" },
    { key: "clientId", label: "ID интеграции (OAuth)", secret: false, required: false, hint: "Необязательно, если задан токен доступа" },
    { key: "clientSecret", label: "Секретный ключ (OAuth)", secret: true, required: false, hint: "Необязательно, если задан токен доступа" },
    { key: "refreshToken", label: "Refresh-токен (OAuth)", secret: true, required: false, hint: "Обновляется автоматически при каждом прогоне" }
  ],
  async check(creds, fetchImpl = fetch) {
    const subdomain = (creds.subdomain ?? "").trim();
    if (!AMOCRM_SUBDOMAIN_RE.test(subdomain)) return configError("Не задан корректный поддомен amoCRM (буквы, цифры и дефис)");
    const auth = await amocrmAuth(creds, fetchImpl);
    if (!("token" in auth)) return auth;
    try {
      const res = await fetchImpl(`https://${subdomain}.amocrm.ru/api/v4/accounts?with=version`, {
        headers: { authorization: `Bearer ${auth.token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { ok: false, detail: `amoCRM ответил HTTP ${res.status} (проверьте токен)`, status: res.status };
      const body = (await res.json().catch(() => null)) as { _embedded?: { accounts?: { name?: string; version?: string }[] } } | null;
      const account = body?._embedded?.accounts?.[0];
      const outcome: IntegrationRunOutcome = {
        ok: true,
        detail: account ? `Связь есть: аккаунт «${(account.name ?? "без названия").slice(0, 100)}», API v4${account.version ? ` (версия ${account.version})` : ""}` : `HTTP ${res.status}, аккаунт получен`,
        status: res.status,
        ...(auth.rotate ? { rotate: auth.rotate } : {})
      };
      return outcome;
    } catch (e) {
      return netError(e);
    }
  },
  async sync(creds, fetchImpl = fetch, cursorAt?: number) {
    const subdomain = (creds.subdomain ?? "").trim();
    if (!AMOCRM_SUBDOMAIN_RE.test(subdomain)) return configError("Не задан корректный поддомен amoCRM (буквы, цифры и дефис)");
    const auth = await amocrmAuth(creds, fetchImpl);
    if (!("token" in auth)) return auth;
    try {
      // Этап 12: инкрементальный фильтр по updated_at (unix-секунды) с минутным перекрытием — расхождение часов гасит апсерт.
      const fromSec = typeof cursorAt === "number" ? Math.floor((cursorAt - CURSOR_OVERLAP_MS) / 1000) : null;
      const filter = fromSec !== null ? `&filter[updated_at][from]=${fromSec}` : "";
      const leads: ExternalLead[] = [];
      let status = 200;
      for (let page = 1; ; page += 1) {
        const res = await fetchImpl(`https://${subdomain}.amocrm.ru/api/v4/leads?limit=${SYNC_PAGE}&page=${page}${filter}`, {
          headers: { authorization: `Bearer ${auth.token}` },
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        status = res.status;
        if (!res.ok) return { ok: false, detail: `amoCRM ответил HTTP ${res.status} при запросе сделок (страница ${page})`, status: res.status };
        const body = (await res.json().catch(() => null)) as { _embedded?: { leads?: unknown[] }; _links?: { next?: { href?: string } } } | null;
        for (const raw of body?._embedded?.leads ?? []) {
          const lead = amocrmLead(raw);
          if (lead) leads.push(lead);
        }
        if (!body?._links?.next?.href) break; // ссылки на следующую страницу нет — выборка кончилась
        if (leads.length >= SYNC_CEILING) {
          // Потолок прогона: остальное — на следующие прогоны, курсор не сдвигается (решает исполнитель).
          return { ok: true, detail: `Получено сделок: ${leads.length}`, status, leads, truncated: true, ...(auth.rotate ? { rotate: auth.rotate } : {}) };
        }
      }
      return { ok: true, detail: `Получено сделок: ${leads.length}`, status, leads, ...(auth.rotate ? { rotate: auth.rotate } : {}) };
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
  async sync(creds, fetchImpl = fetch, cursorAt?: number) {
    const base = normalizeWebhook(creds.webhookUrl);
    if (!base) return configError("Не задан корректный адрес вебхука Bitrix24 (https://…/rest/…)");
    try {
      // Этап 12: инкрементальный фильтр по дате изменения (ISO 8601) с минутным перекрытием;
      // страница REST Bitrix24 фиксирована (50 записей), смещение следующей — из поля next ответа.
      const fromIso = typeof cursorAt === "number" ? new Date(cursorAt - CURSOR_OVERLAP_MS).toISOString().slice(0, 19) : null;
      const leads: ExternalLead[] = [];
      let status = 200;
      let start: number | null = null;
      for (;;) {
        const res = await fetchImpl(`${base}crm.lead.list.json`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            order: { ID: "DESC" },
            ...(fromIso !== null ? { filter: { ">=DATE_MODIFY": fromIso } } : {}),
            ...(start !== null ? { start } : {})
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        status = res.status;
        if (!res.ok) return { ok: false, detail: `Bitrix24 ответил HTTP ${res.status} при запросе лидов`, status: res.status };
        const body = (await res.json().catch(() => null)) as { result?: unknown[]; next?: number } | null;
        for (const raw of Array.isArray(body?.result) ? body.result : []) {
          const lead = bitrixLead(raw);
          if (lead) leads.push(lead);
        }
        const next = typeof body?.next === "number" ? body.next : null;
        if (next === null) break; // поля next нет — выборка кончилась
        if (leads.length >= SYNC_CEILING) {
          // Потолок прогона: остальное — на следующие прогоны, курсор не сдвигается (решает исполнитель).
          return { ok: true, detail: `Получено лидов: ${leads.length}`, status, leads, truncated: true };
        }
        start = next;
      }
      return { ok: true, detail: `Получено лидов: ${leads.length}`, status, leads };
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
