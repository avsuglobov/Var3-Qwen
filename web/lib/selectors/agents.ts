import type { Agent, Stage, Lead } from "@/lib/schemas";
import type { AgentRole, AgentStatus } from "@/lib/types";

/**
 * Чистые функции раздела «AI-сотрудники» (этап 3, группа 1). Поведение перенесено из прототипа
 * (`../download/sections.js`, `db.js`): монограмма из названия, генерация id, счётчики воронки.
 */

export const ROLE_LABELS: Record<AgentRole, string> = { sales: "Продажи", support: "Поддержка", supply: "Снабжение", hr: "HR", rop: "РОП" };

/**
 * Статус не передаётся только цветом: точка + текстовая подпись.
 * Критичный цвет — только у точки (не у мелкого текста, особенно в тёмной теме).
 */
export const STATUS_META: Record<AgentStatus, { label: string; dotClass: string; textClass: string }> = {
  online: { label: "В сети", dotClass: "bg-status", textClass: "text-foreground" },
  idle: { label: "Ожидание", dotClass: "bg-primary", textClass: "text-muted-foreground" },
  error: { label: "Критично", dotClass: "bg-critical", textClass: "text-foreground" },
  offline: { label: "Не в сети", dotClass: "bg-border", textClass: "text-muted-foreground" }
};

/** Монограмма: первые буквы до двух слов без пунктуации; если слов нет — «AI» (правило этапа 3 вместо «ИИ»). */
export function monogramFromName(name: string): string {
  const letters = name
    .replace(/[^A-Za-zА-Яа-яЁё0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "AI";
}

/** id вида «ag-new-N»: сначала длина списка, конфликты пропускаются (как в мастере прототипа). */
export function nextAgentId(agents: readonly Pick<Agent, "id">[]): string {
  let n = agents.length + 1;
  while (agents.some((a) => a.id === `ag-new-${n}`)) n++;
  return `ag-new-${n}`;
}

export interface WizardAgentInput {
  name: string;
  role: AgentRole;
  instruction: string;
  knowledge: string[];
  channels: Agent["channels"];
}

/** Новый сотрудник из мастера: те же значения по умолчанию, что в прототипе (sections.js, wizardModal). */
export function buildAgentFromWizard(input: WizardAgentInput, existing: readonly Agent[]): Agent {
  return {
    id: nextAgentId(existing),
    name: input.name,
    role: input.role,
    status: "idle",
    channels: input.channels,
    funnelId: null,
    monogram: monogramFromName(input.name),
    summary: "Создан в мастере.",
    instruction: input.instruction.trim() || "Инструкция не задана.",
    knowledge: input.knowledge,
    funnel: [],
    approvals: []
  };
}

export interface FunnelColumn {
  stage: Stage;
  count: number;
}

/** Столбцы воронки сотрудника: стадия + число лидов этой воронки на стадии (как на вкладке «Воронка»). */
export function funnelColumns(funnelId: string, stages: readonly Stage[], leads: readonly Lead[]): FunnelColumn[] {
  return stages.map((stage) => ({ stage, count: leads.filter((l) => l.stageId === stage.id && l.funnelId === funnelId).length }));
}
