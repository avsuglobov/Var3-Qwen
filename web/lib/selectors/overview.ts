import type { Conversation, Document, Lead, LeadEvent, OnboardingStep } from "@/lib/schemas";

export interface OverviewKpis {
  leads: number;
  documents: number;
  aiMessages: number;
  /** Лиды, переданные менеджеру (а не любое действие человека: перенос карточки передачей не считается). */
  handedOff: number;
  /** Лиды с пометкой об эскалации. */
  escalated: number;
}

export function computeKpis(leads: Lead[], documents: Document[], conversations: Conversation[]): OverviewKpis {
  return {
    leads: leads.length,
    documents: documents.length,
    aiMessages: conversations.reduce((n, c) => n + c.messages.filter((m) => m.from === "ai").length, 0),
    handedOff: leads.filter((l) => l.events.some((e) => e.actor === "human" && /передан/i.test(e.text))).length,
    escalated: leads.filter((l) => /эскалац/i.test(l.note ?? "")).length
  };
}

export interface JournalRow extends LeadEvent {
  leadId: string;
}

/** Новые события (с меткой ts) выше демо-событий (без ts); внутри группы — по времени ЧЧ:ММ; равные не меняют порядок. */
export function compareNewestFirst(a: LeadEvent, b: LeadEvent): number {
  const x = a.ts ?? 0;
  const y = b.ts ?? 0;
  if (x !== y) return y - x;
  return a.t < b.t ? 1 : a.t > b.t ? -1 : 0;
}

export function recentJournal(leads: Lead[], limit = 8): JournalRow[] {
  return leads
    .flatMap((l) => l.events.map((e) => ({ ...e, leadId: l.id })))
    .sort(compareNewestFirst)
    .slice(0, limit);
}

export interface OnboardingProgress {
  done: number;
  total: number;
  percent: number;
}

export function onboardingProgress(steps: OnboardingStep[]): OnboardingProgress {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
