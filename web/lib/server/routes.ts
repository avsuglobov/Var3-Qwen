import { ApiError, type Api, type Repository } from "@/lib/api/types";
import type { CollectionName } from "@/lib/schemas";
import { getServerStore } from "@/lib/server/store";

/** URL-слаг коллекции → имя коллекции снимка (формат прототипа, UPPER_SNAKE). */
const COLLECTION_BY_SLUG = {
  leads: "LEADS",
  conversations: "CONVERSATIONS",
  documents: "DOCUMENTS",
  onboarding: "ONBOARDING",
  tasks: "TASKS",
  "calendar-events": "CALENDAR_EVENTS",
  notifications: "NOTIFICATIONS",
  agents: "AGENTS",
  courses: "COURSES",
  certificates: "CERTIFICATES"
} as const satisfies Record<string, Exclude<CollectionName, "COMPANY_PROFILE">>;

/** Имя коллекции → ключ репозитория в интерфейсе Api. */
const REPO_BY_COLLECTION: Record<Exclude<CollectionName, "COMPANY_PROFILE">, keyof Api> = {
  LEADS: "leads",
  CONVERSATIONS: "conversations",
  DOCUMENTS: "documents",
  ONBOARDING: "onboarding",
  TASKS: "tasks",
  CALENDAR_EVENTS: "calendarEvents",
  NOTIFICATIONS: "notifications",
  AGENTS: "agents",
  COURSES: "courses",
  CERTIFICATES: "certificates"
};

export function collectionBySlug(slug: string): Exclude<CollectionName, "COMPANY_PROFILE"> {
  const name = COLLECTION_BY_SLUG[slug as keyof typeof COLLECTION_BY_SLUG];
  if (!name) throw new ApiError("not_found", `Неизвестная коллекция: ${slug}`);
  return name;
}

/** Репозиторий коллекции по слагу маршрута; неизвестный слаг → 404. */
export function repoOf(slug: string): Repository<Exclude<CollectionName, "COMPANY_PROFILE">> {
  const name = collectionBySlug(slug);
  return getServerStore().api[REPO_BY_COLLECTION[name]] as Repository<Exclude<CollectionName, "COMPANY_PROFILE">>;
}
