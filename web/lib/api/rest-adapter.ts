import { ApiError, type Api, type ApiErrorCode, type ImportResult, type Repository } from "@/lib/api/types";
import { type CollectionName, type CompanyProfile, type ItemOf, type Lead } from "@/lib/schemas";

/**
 * REST-адаптер слоя данных (этап 4): интерфейс `Api` тот же, что у адаптера localStorage, но данные
 * приходят по HTTP из маршрутов `app/api/*` (серверное хранилище ведёт формат снимка прототипа).
 * Состояния loading/error настоящие: задержку и недоступность имитирует сервер (`/api/debug`),
 * клиент только ходит по сети и разворачивает ошибки в `ApiError`.
 *
 * На сервере (SSR) queryFn не вызывается — TanStack Query подписывается в effect на клиенте,
 * поэтому относительные URL безопасны.
 */

const STATUS_BY_CODE: Record<ApiErrorCode, number> = { validation: 400, not_found: 404, duplicate: 409, invalid_import: 422, unavailable: 503 };
const CODE_BY_STATUS: Record<number, ApiErrorCode> = { 400: "validation", 404: "not_found", 409: "duplicate", 422: "invalid_import" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isApiErrorCode = (v: unknown): v is ApiErrorCode => typeof v === "string" && v in STATUS_BY_CODE;

const JSON_HEADERS = { "content-type": "application/json" };

export interface RestApiOptions {
  /** Базовый URL сервиса (по умолчанию — тот же источник, относительные `/api/...`). */
  baseUrl?: string;
}

/** HTTP-ошибка или сетевой сбой → ApiError с кодом слоя данных и понятным сообщением. */
async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* пустое или не-JSON тело */
  }
  const code = isRecord(body) && isApiErrorCode(body["code"]) ? body["code"] : (CODE_BY_STATUS[res.status] ?? "unavailable");
  const message = isRecord(body) && typeof body["message"] === "string" ? body["message"] : `Сервис вернул ошибку ${res.status}`;
  return new ApiError(code, message);
}

async function request(path: string, init?: RequestInit, allow404 = false): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("unavailable", "Не удалось связаться с сервисом данных: сеть недоступна.");
  }
  // 404 для get() — штатный ответ «записи нет» (интерфейс возвращает undefined), разворачиваем его только остальные.
  if (!res.ok && !(allow404 && res.status === 404)) throw await toApiError(res);
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init);
  return (await res.json()) as T;
}

/** Репозиторий коллекции поверх REST-маршрутов (валидация — на сервере, схема та же). */
function repo<K extends Exclude<CollectionName, "COMPANY_PROFILE">>(base: string, slug: string): Repository<K> {
  const url = (id?: string): string => `${base}/api/collections/${slug}${id ? `/${encodeURIComponent(id)}` : ""}`;
  return {
    async list() {
      return json<ItemOf<K>[]>(url());
    },
    async get(id) {
      const res = await request(url(id), undefined, true);
      if (res.status === 404) return undefined;
      return (await res.json()) as ItemOf<K>;
    },
    async create(item) {
      return json<ItemOf<K>>(url(), { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(item) });
    },
    async update(id, patch) {
      return json<ItemOf<K>>(url(id), { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(patch) });
    },
    async remove(id) {
      await request(url(id), { method: "DELETE" });
    }
  };
}

export function createRestApi(options: RestApiOptions = {}): Api {
  const base = options.baseUrl ?? "";
  return {
    leads: {
      ...repo<'LEADS'>(base, "leads"),
      /** Пакетное создание (импорт базы): один запрос вместо сотен. */
      async createMany(batch) {
        const r = await json<{ items: Lead[] }>(`${base}/api/collections/leads/batch`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ items: batch }) });
        return r.items;
      }
    },
    conversations: repo<'CONVERSATIONS'>(base, "conversations"),
    documents: repo<'DOCUMENTS'>(base, "documents"),
    onboarding: repo<'ONBOARDING'>(base, "onboarding"),
    tasks: repo<'TASKS'>(base, "tasks"),
    calendarEvents: repo<'CALENDAR_EVENTS'>(base, "calendar-events"),
    notifications: repo<'NOTIFICATIONS'>(base, "notifications"),
    agents: repo<'AGENTS'>(base, "agents"),
    courses: {
      ...repo<'COURSES'>(base, "courses"),
      /** Завершение курса после успешного теста: сертификат приходит ответом сервера. */
      async complete(courseId, info) {
        return json<ItemOf<"CERTIFICATES">>(`${base}/api/collections/courses/${encodeURIComponent(courseId)}/complete`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(info) });
      }
    },
    certificates: repo<'CERTIFICATES'>(base, "certificates"),
    companyProfile: {
      async get() {
        return json<CompanyProfile>(`${base}/api/company-profile`);
      },
      async update(patch) {
        return json<CompanyProfile>(`${base}/api/company-profile`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(patch) });
      }
    },
    reference: {
      async channels() {
        return json(`${base}/api/reference/channels`);
      },
      async stages() {
        return json(`${base}/api/reference/stages`);
      },
      async funnels() {
        return json(`${base}/api/reference/funnels`);
      },
      async activity() {
        return json(`${base}/api/reference/activity`);
      },
      async quizzes() {
        return json(`${base}/api/reference/quizzes`);
      },
      async knowledgeSources() {
        return json(`${base}/api/reference/knowledge-sources`);
      },
      async chainTemplates() {
        return json(`${base}/api/reference/chain-templates`);
      },
      async supplyRequests() {
        return json(`${base}/api/reference/supply-requests`);
      },
      async supplyOffers() {
        return json(`${base}/api/reference/supply-offers`);
      },
      async integrations() {
        return json(`${base}/api/reference/integrations`);
      }
    },
    data: {
      /** Снимок текстом JSON (`version: 1` + коллекции; файлы обмениваются с прототипом и localStorage-адаптером). */
      async exportJSON() {
        return (await request(`${base}/api/data/export`)).text();
      },
      async importJSON(text): Promise<ImportResult> {
        return json<ImportResult>(`${base}/api/data/import`, { method: "POST", headers: JSON_HEADERS, body: text });
      },
      async reset() {
        await request(`${base}/api/data/reset`, { method: "POST" });
      }
    }
  };
}
