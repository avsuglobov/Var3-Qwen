/**
 * Доменные типы. Сущности, которые хранятся и валидируются, выводятся из Zod-схем (`lib/schemas`) — единый источник истины.
 * Ниже — типы, для которых схемы появятся на своих этапах (Deal, Template, KnowledgeSource, Integration).
 */
export type {
  ActivityPoint, Agent, ApprovalRule, AppNotification, CalendarEvent, Certificate, Channel, Conversation, Course, DbSnapshot, Document,
  Funnel, Lead, LeadEvent, Message, OnboardingStep, Stage, Task
} from "@/lib/schemas";

export type ChannelId = import("zod").infer<typeof import("@/lib/schemas").channelId>;
export type AgentRole = import("zod").infer<typeof import("@/lib/schemas").agentRole>;
export type AgentStatus = import("zod").infer<typeof import("@/lib/schemas").agentStatus>;
export type Actor = import("zod").infer<typeof import("@/lib/schemas").actor>;
export type ConversationMode = import("zod").infer<typeof import("@/lib/schemas").conversationMode>;
export type DocumentType = import("@/lib/schemas").Document["type"];
export type DocumentStatus = import("@/lib/schemas").Document["status"];

export interface Deal {
  id: string;
  leadId: string;
  title: string;
  /** Сумма в рублях; null — не задана (цены не выдумываем). */
  amount: number | null;
  stageId: string;
}

export interface Template {
  id: string;
  type: DocumentType;
  name: string;
}

export type KnowledgeSourceType = "pdf" | "docx" | "xlsx" | "web" | "api";

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  name: string;
  updated: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  icon: string;
}
