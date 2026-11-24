import type { ActivityPoint, ChainTemplate, Channel, CollectionName, CompanyProfile, Funnel, ItemOf, KnowledgeSource, Lead, QuizQuestion, Stage, SupplyOffer, SupplyRequest } from "@/lib/schemas";

export type ApiErrorCode = "validation" | "not_found" | "duplicate" | "unavailable" | "invalid_import";

/** Ошибка слоя данных: код + сообщение на русском (показывается пользователю в состоянии «ошибка»). */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/** Репозиторий коллекции. Реализации: localStorage (сейчас), REST/MSW (этап 10) — интерфейс общий.
 *  COMPANY_PROFILE — одиночная запись (объект), доступна через `api.companyProfile`, а не репозиторий. */
export interface Repository<K extends Exclude<CollectionName, "COMPANY_PROFILE">> {
  list(): Promise<ItemOf<K>[]>;
  get(id: string): Promise<ItemOf<K> | undefined>;
  create(item: ItemOf<K>): Promise<ItemOf<K>>;
  update(id: string, patch: Partial<ItemOf<K>>): Promise<ItemOf<K>>;
  remove(id: string): Promise<void>;
}

export interface ImportResult {
  imported: CollectionName[];
  /** Сколько записей пропущено как некорректные. */
  dropped: number;
}

/** Репозиторий лидов: дополнительно пакетное создание (импорт файла — одна запись в хранилище вместо сотен). */
export interface LeadRepository extends Repository<"LEADS"> {
  createMany(items: Lead[]): Promise<Lead[]>;
}

/** Репозиторий курсов: дополнительно завершение курса выдачей сертификата (db.js completeCourse). */
export interface CourseRepository extends Repository<"COURSES"> {
  complete(courseId: string, info: { name: string; score: number }): Promise<ItemOf<"CERTIFICATES">>;
}

/** Демо-тесты курсов: вопросы по курсам и проходной балл (data.js QUIZZES/QUIZ_PASS). */
export interface QuizBundle {
  pass: number;
  quizzes: Record<string, QuizQuestion[]>;
}

export interface Api {
  leads: LeadRepository;
  conversations: Repository<"CONVERSATIONS">;
  documents: Repository<"DOCUMENTS">;
  onboarding: Repository<"ONBOARDING">;
  tasks: Repository<"TASKS">;
  calendarEvents: Repository<"CALENDAR_EVENTS">;
  notifications: Repository<"NOTIFICATIONS">;
  agents: Repository<"AGENTS">;
  courses: CourseRepository;
  certificates: Repository<"CERTIFICATES">;
  companyProfile: {
    get(): Promise<CompanyProfile>;
    update(patch: Partial<CompanyProfile>): Promise<CompanyProfile>;
  };
  reference: {
    channels(): Promise<Channel[]>;
    stages(): Promise<Stage[]>;
    funnels(): Promise<Funnel[]>;
    activity(): Promise<ActivityPoint[]>;
    quizzes(): Promise<QuizBundle>;
    knowledgeSources(): Promise<KnowledgeSource[]>;
    chainTemplates(): Promise<ChainTemplate[]>;
    supplyRequests(): Promise<SupplyRequest[]>;
    supplyOffers(): Promise<SupplyOffer[]>;
  };
  data: {
    /** Снимок в формате прототипа (`version: 1` + коллекции): файлы обмениваются между версиями. */
    exportJSON(): Promise<string>;
    importJSON(text: string): Promise<ImportResult>;
    reset(): Promise<void>;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
