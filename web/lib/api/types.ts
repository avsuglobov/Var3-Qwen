import type { ActivityPoint, Channel, CollectionName, Funnel, ItemOf, Lead, Stage } from "@/lib/schemas";

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

/** Репозиторий коллекции. Реализации: localStorage (сейчас), REST/MSW (этап 10) — интерфейс общий. */
export interface Repository<K extends CollectionName> {
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

export interface Api {
  leads: LeadRepository;
  conversations: Repository<"CONVERSATIONS">;
  documents: Repository<"DOCUMENTS">;
  onboarding: Repository<"ONBOARDING">;
  tasks: Repository<"TASKS">;
  calendarEvents: Repository<"CALENDAR_EVENTS">;
  notifications: Repository<"NOTIFICATIONS">;
  agents: Repository<"AGENTS">;
  courses: Repository<"COURSES">;
  certificates: Repository<"CERTIFICATES">;
  reference: {
    channels(): Promise<Channel[]>;
    stages(): Promise<Stage[]>;
    funnels(): Promise<Funnel[]>;
    activity(): Promise<ActivityPoint[]>;
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
