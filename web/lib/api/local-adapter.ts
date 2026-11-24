import { ACTIVITY, CHAIN_TEMPLATES, CHANNELS, FUNNELS, KNOWLEDGE_SOURCES, QUIZZES, QUIZ_PASS, STAGES, SUPPLY_OFFERS, SUPPLY_REQUESTS } from "@/lib/mock-data/reference";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { certificateSchema, COLLECTION_NAMES, COLLECTION_SCHEMAS, companyProfileSchema, parseCollection, type Certificate, type CollectionName, type CompanyProfile, type DbSnapshot, type ItemOf } from "@/lib/schemas";
import { ApiError, type Api, type ImportResult, type Repository, type StorageLike } from "@/lib/api/types";

/** Ключ и формат совпадают с прототипом (`aiws-db-v2`, `version: 1`): данные переносятся экспортом/импортом JSON. */
export const STORAGE_KEY = "aiws-db-v2";
export const SNAPSHOT_VERSION = 1;
/** Флаг имитации сбоя сервиса: `localStorage["aiws-mock-fail"] = "1"` → все запросы падают (для проверки состояния «ошибка»). */
export const FAIL_FLAG_KEY = "aiws-mock-fail";
/** Переопределение задержки имитации сети, мс: `localStorage["aiws-mock-latency"] = "1200"` (для проверки состояния «загрузка»). */
export const LATENCY_KEY = "aiws-mock-latency";

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

export interface LocalApiOptions {
  /** Хранилище; если недоступно или выбрасывает исключения (приватный режим) — работаем в памяти. */
  storage?: StorageLike | null;
  seed?: DbSnapshot;
  /** Имитация сетевой задержки, мс. */
  latencyMs?: number;
}

const clone = <T>(v: T): T => structuredClone(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sleep = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export function createLocalApi(options: LocalApiOptions = {}): Api {
  const storage = options.storage ?? createMemoryStorage();
  const seed = options.seed ?? SEED_DATA;
  const latency = options.latencyMs ?? 0;
  let db: DbSnapshot | null = null;

  const read = (): string | null => { try { return storage.getItem(STORAGE_KEY); } catch { return null; } };
  const persist = (): void => {
    if (!db) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify({ version: SNAPSHOT_VERSION, ...db })); } catch { /* квота/запрет: работаем дальше в памяти */ }
  };

  /** Загрузка: невалидные коллекции заменяются демо-данными, битые записи отбрасываются (приложение не «кирпичится»). */
  function load(): DbSnapshot {
    if (db) return db;
    const snapshot = clone(seed);
    const raw = read();
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed) && parsed["version"] === SNAPSHOT_VERSION) {
          for (const name of COLLECTION_NAMES) {
            const r = parseCollection(name, parsed[name]);
            if (r) (snapshot as unknown as Record<string, unknown>)[name] = r.items;
          }
          // COMPANY_PROFILE — объект (не массив): та же валидация схемой, иначе остаётся демо-профиль
          const p = companyProfileSchema.safeParse(parsed["COMPANY_PROFILE"]);
          if (p.success) (snapshot as unknown as Record<string, unknown>)["COMPANY_PROFILE"] = p.data;
        }
      } catch { /* битый JSON → демо-данные */ }
    }
    db = snapshot;
    persist();
    return db;
  }

  async function guard(): Promise<DbSnapshot> {
    let failing = false;
    let delay = latency;
    try {
      failing = storage.getItem(FAIL_FLAG_KEY) === "1";
      const override = Number(storage.getItem(LATENCY_KEY));
      if (Number.isFinite(override) && override > 0) delay = override;
    } catch { /* ignore */ }
    await sleep(delay);
    if (failing) throw new ApiError("unavailable", "Не удалось получить данные: сервис недоступен (имитация сбоя).");
    return load();
  }

  function repo<K extends Exclude<CollectionName, "COMPANY_PROFILE">>(name: K): Repository<K> {
    const schema = COLLECTION_SCHEMAS[name];
    const items = (): ItemOf<K>[] => (load() as unknown as Record<K, ItemOf<K>[]>)[name];
    const set = (next: ItemOf<K>[]): void => { (load() as unknown as Record<K, ItemOf<K>[]>)[name] = next; persist(); };
    return {
      async list() { await guard(); return clone(items()); },
      async get(id) { await guard(); const f = items().find((x) => x.id === id); return f ? clone(f) : undefined; },
      async create(item) {
        await guard();
        const r = schema.safeParse(item);
        if (!r.success) throw new ApiError("validation", `Некорректные данные: ${r.error.issues[0]?.path.join(".") || "запись"}`);
        const next = r.data as ItemOf<K>;
        if (items().some((x) => x.id === next.id)) throw new ApiError("duplicate", `Запись ${next.id} уже существует`);
        set([...items(), next]);
        return clone(next);
      },
      async update(id, patch) {
        await guard();
        const cur = items().find((x) => x.id === id);
        if (!cur) throw new ApiError("not_found", `Запись ${id} не найдена`);
        const r = schema.safeParse({ ...cur, ...patch, id: cur.id });
        if (!r.success) throw new ApiError("validation", `Некорректные данные: ${r.error.issues[0]?.path.join(".") || "запись"}`);
        const next = r.data as ItemOf<K>;
        set(items().map((x) => (x.id === id ? next : x)));
        return clone(next);
      },
      async remove(id) {
        await guard();
        if (!items().some((x) => x.id === id)) throw new ApiError("not_found", `Запись ${id} не найдена`);
        set(items().filter((x) => x.id !== id));
      }
    };
  }

  return {
    leads: {
      ...repo("LEADS"),
      /** Пакетное создание (импорт файла): валидация каждой записи, одна запись в хранилище вместо сотен. */
      async createMany(batch) {
        await guard();
        const schema = COLLECTION_SCHEMAS.LEADS;
        const out: ItemOf<"LEADS">[] = [];
        for (const item of batch) {
          const r = schema.safeParse(item);
          if (!r.success) throw new ApiError("validation", `Некорректные данные: ${r.error.issues[0]?.path.join(".") || "запись"}`);
          out.push(r.data as ItemOf<"LEADS">);
        }
        const store = load() as unknown as Record<"LEADS", ItemOf<"LEADS">[]>;
        store.LEADS = [...store.LEADS, ...out];
        persist();
        return clone(out);
      }
    },
    conversations: repo("CONVERSATIONS"),
    documents: repo("DOCUMENTS"),
    onboarding: repo("ONBOARDING"),
    tasks: repo("TASKS"),
    calendarEvents: repo("CALENDAR_EVENTS"),
    notifications: repo("NOTIFICATIONS"),
    agents: repo("AGENTS"),
    courses: {
      ...repo("COURSES"),
      /** Завершение курса после успешного теста: сертификат с оценкой, курс → «Завершён» (db.js completeCourse). */
      async complete(courseId, info) {
        await guard();
        const name = String(info?.name ?? "").trim().slice(0, 80);
        if (!name) throw new ApiError("validation", "Введите имя для сертификата");
        const db = load();
        const course = db.COURSES.find((c) => c.id === courseId);
        if (!course) throw new ApiError("not_found", `Курс ${courseId} не найден`);
        let max = 0;
        for (const c of db.CERTIFICATES) { const m = /^cert-(\d+)$/.exec(c.id); if (m) max = Math.max(max, Number(m[1])); }
        const cert = { id: `cert-${max + 1}`, name, course: course.title, date: new Date().toISOString().slice(0, 10), score: Math.min(1, Math.max(0, info.score)) };
        const r = certificateSchema.safeParse(cert);
        if (!r.success) throw new ApiError("validation", "Некорректные данные сертификата");
        db.COURSES = db.COURSES.map((c) => (c.id === courseId ? { ...c, progress: 1, status: "Завершён" } : c));
        db.CERTIFICATES = [...db.CERTIFICATES, r.data as Certificate];
        persist();
        return clone(r.data as Certificate);
      }
    },
    certificates: repo("CERTIFICATES"),
    companyProfile: {
      async get() { await guard(); return clone((load() as unknown as Record<"COMPANY_PROFILE", CompanyProfile>).COMPANY_PROFILE); },
      async update(patch) {
        await guard();
        const db = load() as unknown as Record<"COMPANY_PROFILE", CompanyProfile>;
        const next = companyProfileSchema.safeParse({ ...db.COMPANY_PROFILE, ...patch });
        if (!next.success) throw new ApiError("validation", "Некорректное описание компании");
        db.COMPANY_PROFILE = next.data;
        persist();
        return clone(next.data);
      }
    },
    reference: {
      async channels() { await guard(); return clone(Object.values(CHANNELS)); },
      async stages() { await guard(); return clone(STAGES); },
      async funnels() { await guard(); return clone(FUNNELS); },
      async activity() { await guard(); return clone(ACTIVITY); },
      async quizzes() { await guard(); return { pass: QUIZ_PASS, quizzes: clone(QUIZZES) }; },
      async knowledgeSources() { await guard(); return clone(KNOWLEDGE_SOURCES); },
      async chainTemplates() { await guard(); return clone(CHAIN_TEMPLATES); },
      async supplyRequests() { await guard(); return clone(SUPPLY_REQUESTS); },
      async supplyOffers() { await guard(); return clone(SUPPLY_OFFERS); }
    },
    data: {
      async exportJSON() { await guard(); return JSON.stringify({ version: SNAPSHOT_VERSION, ...load() }, null, 2); },
      async importJSON(text): Promise<ImportResult> {
        await guard();
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new ApiError("invalid_import", "Файл не является корректным JSON"); }
        if (!isRecord(parsed) || parsed["version"] !== SNAPSHOT_VERSION) throw new ApiError("invalid_import", "Неподдерживаемый формат файла");
        const next = load();
        const imported: CollectionName[] = [];
        let dropped = 0;
        for (const name of COLLECTION_NAMES) {
          if (parsed[name] === undefined) continue;
          const r = parseCollection(name, parsed[name]);
          if (!r) { dropped += Array.isArray(parsed[name]) ? (parsed[name] as unknown[]).length : 1; continue; }   // не массив считается одной пропущенной коллекцией (как в прототипе)
          (next as unknown as Record<string, unknown>)[name] = r.items;
          dropped += r.dropped;
          imported.push(name);
        }
        // COMPANY_PROFILE — объект (не массив): та же валидация схемой; в отчёте импорта не числится, но перезаписывается
        if (parsed["COMPANY_PROFILE"] !== undefined) {
          const p = companyProfileSchema.safeParse(parsed["COMPANY_PROFILE"]);
          if (p.success) (next as unknown as Record<string, unknown>)["COMPANY_PROFILE"] = p.data; else dropped += 1;
        }
        if (imported.length === 0) throw new ApiError("invalid_import", "Файл не содержит допустимых данных");
        persist();
        return { imported, dropped };
      },
      async reset() { await guard(); db = clone(seed); persist(); }
    }
  };
}
