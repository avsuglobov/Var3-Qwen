"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ChannelGlyph } from "@/components/agents/channel-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateAgent } from "@/lib/api/hooks";
import { buildAgentFromWizard, ROLE_LABELS } from "@/lib/selectors/agents";
import { CHANNEL_IDS, type Agent, type Channel } from "@/lib/schemas";
import type { AgentRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLES: readonly AgentRole[] = ["sales", "support", "supply", "hr", "rop"];
/** Демо-источники — как в мастере прототипа. Подключение реальных источников появится в «Хранилище» (этап 6). */
const KNOWLEDGE_OPTIONS = ["Демо-описание продукта.pdf", "Демо-сценарии продаж.docx"];

/**
 * Мастер создания сотрудника. Поведение прототипа: пустое название отклоняется (окно остаётся открытым),
 * каналы «Telegram» и «WhatsApp» предвыбраны, сотрудник сохраняется в этом браузере (честная пометка).
 */
export function AgentWizard({ open, onOpenChange, agents, channels }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: readonly Agent[];
  channels: readonly Channel[];
}) {
  const create = useCreateAgent();
  const [role, setRole] = useState<AgentRole>("sales");
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [knowledge, setKnowledge] = useState(KNOWLEDGE_OPTIONS[0] ?? "");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(["telegram", "whatsapp"]));
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Каждый вызов мастера начинается с чистого состояния (как в прототипе)
  useEffect(() => {
    if (!open) return;
    setRole("sales");
    setName("");
    setInstruction("");
    setKnowledge(KNOWLEDGE_OPTIONS[0] ?? "");
    setSelected(new Set(["telegram", "whatsapp"]));
    setError(null);
  }, [open]);

  const toggleChannel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Укажите название сотрудника");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    const agent = buildAgentFromWizard(
      { name: trimmed, role, instruction, knowledge: [knowledge], channels: CHANNEL_IDS.filter((c) => selected.has(c)) },
      agents
    );
    create.mutate(agent, {
      onSuccess: () => onOpenChange(false),
      onError: (e) => setError(e.message)
    });
  };

  const chip = (active: boolean) =>
    cn(
      "transition-ui inline-flex h-7 items-center gap-1.5 rounded-chip border px-2.5 text-xs font-medium",
      active ? "border-ring bg-accent-soft text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
    );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle className="pr-8 text-[15px] font-medium">Создание AI-сотрудника</DialogTitle>
        <DialogDescription className="sr-only">Роль, название, инструкция и каналы нового сотрудника</DialogDescription>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">Роль</span>
            <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Роль сотрудника">
              {ROLES.map((r) => (
                <button key={r} type="button" className={chip(role === r)} aria-pressed={role === r} onClick={() => setRole(r)}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wiz-name" className="text-[13px] font-medium text-muted-foreground">Название</label>
            <input
              id="wiz-name"
              ref={nameRef}
              maxLength={60}
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              placeholder="Например: Продажи — входящие"
              className="h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "wiz-error" : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wiz-instruction" className="text-[13px] font-medium text-muted-foreground">Инструкция</label>
            <textarea
              id="wiz-instruction"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Опишите, что делает сотрудник и как отвечает"
              className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wiz-knowledge" className="text-[13px] font-medium text-muted-foreground">База знаний</label>
            <select
              id="wiz-knowledge"
              value={knowledge}
              onChange={(e) => setKnowledge(e.target.value)}
              className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            >
              {KNOWLEDGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">Каналы</span>
            <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Каналы подключения">
              {channels.map((c) => {
                const active = selected.has(c.id);
                return (
                  <button key={c.id} type="button" className={chip(active)} aria-pressed={active} onClick={() => toggleChannel(c.id)}>
                    <ChannelGlyph name={c.icon} />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p id="wiz-error" role="alert" className="flex items-center gap-1.5 text-[13px]">
              <AlertTriangle className="size-4 shrink-0 text-critical" aria-hidden />
              {error}
            </p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            Сотрудник появится в списке и сохранится в этом браузере
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>Отмена</Button>
          <Button variant="default" onClick={submit} aria-busy={create.isPending}>Создать</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
