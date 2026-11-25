import { z } from "zod";

/**
 * Zod-схемы — единственный источник истины для форм данных. Правила перенесены из валидаторов прототипа (`../download/db.js`):
 * безопасный формат id (id попадает в атрибуты и URL), допустимые значения полей, границы длин.
 * Типы выводятся из схем (z.infer), поэтому код и валидация не расходятся.
 */

export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const id = z.string().regex(ID_RE, "Недопустимый id");
const text = (max = 2000) => z.string().max(max);
const optText = z.string().max(2000).nullish();

export const CHANNEL_IDS = ["telegram", "whatsapp", "max", "vk", "avito", "email", "phone", "site"] as const;
export const channelId = z.enum(CHANNEL_IDS);
export const agentRole = z.enum(["sales", "support", "supply", "hr", "rop"]);
export const agentStatus = z.enum(["online", "idle", "offline", "error"]);
export const actor = z.enum(["ai", "human"]);
export const conversationMode = z.enum(["ai", "human", "reading"]);

/* ---------------------------------------------------------------- справочники (не меняются пользователем) */
export const channelSchema = z.object({ id: channelId, name: text(100), icon: text(60) });
export const stageSchema = z.object({ id: id, name: text(100), order: z.number().int().min(0) });
export const funnelSchema = z.object({ id, name: text(100), agentId: id, stages: z.array(id) });
export const activityPointSchema = z.object({ day: text(20), ai: z.number().min(0), human: z.number().min(0) });

/* ---------------------------------------------------------------- сущности, которые сохраняются */
export const leadEventSchema = z.object({
  t: text(40),
  /** Метка времени (мс): у демо-событий нет, новые события всегда выше демо-событий. */
  ts: z.number().optional(),
  actor,
  text: text()
});

export const leadSchema = z.object({
  id,
  name: text(300),
  channel: channelId,
  stageId: id,
  funnelId: id,
  agentId: id,
  value: z.number().nullish(),
  lastActivity: optText,
  note: optText,
  events: z.array(leadEventSchema)
});

/* ---------------------------------------------------------------- вложения диалогов (этап 6) */
/** Лимиты: не больше трёх файлов на сообщение, каждый — до 1 МБ (содержимое хранится в снимке в base64). */
export const MAX_MESSAGE_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 1_048_576;
/** Граница поля data в снимке: base64 раздувает файл на ~⅓ (1 МБ → ~1,37 млн знаков) — с запасом до 1,5 млн. */
export const MAX_ATTACHMENT_DATA = 1_500_000;

export const attachmentSchema = z.object({
  /** Имя файла не бывает пустым (используется как имя при скачивании) — в отличие от текстовых полей. */
  name: z.string().min(1).max(300),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  mime: optText,
  /** Содержимое файла в base64; в демо-сидах вложений нет — поле необязательное. */
  data: z.string().max(MAX_ATTACHMENT_DATA).optional()
});

export const messageSchema = z.object({
  from: z.enum(["client", "ai", "human"]),
  text: text(10000),
  time: optText,
  attachments: z.array(attachmentSchema).max(MAX_MESSAGE_ATTACHMENTS).nullish()
});

export const conversationSchema = z.object({
  id,
  contactName: text(300),
  channel: channelId,
  agentId: id,
  mode: conversationMode,
  unread: z.number().int().min(0).optional(),
  lastPreview: optText,
  lastTime: optText,
  messages: z.array(messageSchema),
  context: z.object({ who: text(), channel: text(), history: text(), nextStep: text(), files: z.number().finite() })
});

/** Позиция печатной формы (pdf.js itemsFor); цены не выдумываются — null допустим. */
export const documentItemSchema = z.object({
  name: text(300),
  qty: z.number().finite(),
  price: z.number().nullish()
});

export const documentSchema = z.object({
  id,
  type: z.enum(["invoice", "offer", "act"]),
  number: text(300),
  client: text(300),
  status: z.enum(["pending", "approved", "rejected"]),
  approver: text(300),
  created: optText,
  /** Сумма в рублях; null — не задана (цены не выдумываем). */
  amount: z.number().nullish(),
  /** Позиции печатной формы; придут с бэкенда — в демо сиде их нет. */
  items: z.array(documentItemSchema).nullish()
});

export const onboardingStepSchema = z.object({ id, name: text(300), done: z.boolean() });

export const taskSchema = z.object({
  id, title: text(1000), done: z.boolean(), priority: z.enum(["high", "med", "low"]), due: optText, assignee: optText, tag: optText
});

export const calendarEventSchema = z.object({
  id, title: text(1000), date: optText, time: optText, duration: optText, type: optText, assignee: optText
});

export const notificationSchema = z.object({ id, text: text(), time: optText, type: optText, read: z.boolean() });

export const approvalRuleSchema = z.object({ action: text(300), mode: z.enum(["auto", "approve"]), note: text(500) });

export const agentSchema = z.object({
  id,
  name: text(120),
  role: agentRole,
  status: agentStatus,
  monogram: text(6),
  summary: text(),
  instruction: text(5000),
  funnelId: id.nullable(),
  channels: z.array(channelId),
  knowledge: z.array(text(300)),
  funnel: z.array(text(300)),
  approvals: z.array(approvalRuleSchema)
});

export const courseSchema = z.object({
  id, title: text(300), lessons: z.number().int().min(0).max(200), progress: z.number().min(0).max(1), status: text(60)
});

export const certificateSchema = z.object({
  id, name: text(120), course: text(300), date: text(60), score: z.number().min(0).max(1).nullish()
});

/* Разделы «Хранилище», «Команда», «Снабжение», «Обучение» (этап 3, группа 7). */
export const knowledgeSourceSchema = z.object({ id, type: optText, name: text(300), status: optText });

export const chainNodeSchema = z.object({ role: text(60), name: text(300) });
export const chainTemplateSchema = z.object({ id, name: text(120), nodes: z.array(chainNodeSchema).min(1) });

export const supplyRequestSchema = z.object({
  id, item: text(300), suppliers: z.number().int().min(0).max(1000), replies: z.number().int().min(0).max(1000), status: optText
});

export const supplyOfferSchema = z.object({ supplier: text(300), price: z.number().min(0).nullish(), term: text(60), note: optText });

/** Интеграция раздела «Интеграции» (data.js INTEGRATIONS): справочник карточек со статусом подключения. */
export const integrationSchema = z.object({ id, name: text(100), desc: text(300), connected: z.boolean(), icon: text(60) });

export const companyProfileSchema = z.object({ name: text(300), about: text(2000), audience: text(2000) });

/** Вопрос демо-теста курса: 2–6 вариантов, один верный (порог — QUIZ_PASS). */
export const quizQuestionSchema = z.object({
  q: text(500),
  options: z.array(text(300)).min(2).max(6),
  answer: z.number().int().min(0).max(5)
});

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export type ChainNode = z.infer<typeof chainNodeSchema>;
export type ChainTemplate = z.infer<typeof chainTemplateSchema>;
export type SupplyRequest = z.infer<typeof supplyRequestSchema>;
export type SupplyOffer = z.infer<typeof supplyOfferSchema>;
export type Integration = z.infer<typeof integrationSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/* ---------------------------------------------------------------- типы */
export type Channel = z.infer<typeof channelSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Funnel = z.infer<typeof funnelSchema>;
export type ActivityPoint = z.infer<typeof activityPointSchema>;
export type LeadEvent = z.infer<typeof leadEventSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Document = z.infer<typeof documentSchema>;
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;
export type Task = z.infer<typeof taskSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type AppNotification = z.infer<typeof notificationSchema>;
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Certificate = z.infer<typeof certificateSchema>;
/* ---------------------------------------------------------------- коллекции и снимок хранилища */
export const COLLECTION_SCHEMAS = {
  LEADS: leadSchema,
  CONVERSATIONS: conversationSchema,
  DOCUMENTS: documentSchema,
  ONBOARDING: onboardingStepSchema,
  TASKS: taskSchema,
  CALENDAR_EVENTS: calendarEventSchema,
  NOTIFICATIONS: notificationSchema,
  AGENTS: agentSchema,
  COURSES: courseSchema,
  CERTIFICATES: certificateSchema
} as const;

/** COMPANY_PROFILE — одиночная запись (объект, без id): валидируется companyProfileSchema отдельно (load/import/API). */
export const COMPANY_PROFILE_SCHEMA = companyProfileSchema;

export type CollectionName = keyof typeof COLLECTION_SCHEMAS;
export const COLLECTION_NAMES = Object.keys(COLLECTION_SCHEMAS) as CollectionName[];

export interface DbSnapshot {
  LEADS: Lead[];
  CONVERSATIONS: Conversation[];
  DOCUMENTS: Document[];
  ONBOARDING: OnboardingStep[];
  TASKS: Task[];
  CALENDAR_EVENTS: CalendarEvent[];
  NOTIFICATIONS: AppNotification[];
  AGENTS: Agent[];
  COURSES: Course[];
  CERTIFICATES: Certificate[];
  COMPANY_PROFILE: CompanyProfile;
}

export type ItemOf<K extends CollectionName> = DbSnapshot[K][number];

/**
 * Разбор коллекции из недоверенного источника (localStorage, импорт файла). Тот же алгоритм, что `pickValid` в прототипе:
 * не массив → null; битые записи отбрасываются; дубли id отбрасываются; если во входе были записи, но ни одна не валидна → null.
 */
export function parseCollection<K extends CollectionName>(name: K, value: unknown): { items: ItemOf<K>[]; dropped: number } | null {
  if (!Array.isArray(value)) return null;
  const schema = COLLECTION_SCHEMAS[name];
  const seen = new Set<string>();
  const items: ItemOf<K>[] = [];
  for (const raw of value) {
    const r = schema.safeParse(raw);
    if (!r.success) continue;
    const item = r.data as ItemOf<K>;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  if (value.length > 0 && items.length === 0) return null;
  return { items, dropped: value.length - items.length };
}
