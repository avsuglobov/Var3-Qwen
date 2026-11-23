"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateAgent } from "@/lib/api/hooks";
import type { Agent } from "@/lib/schemas";

/**
 * Вкладка «Инструкция»: текст и правка. Поведение прототипа: пустая инструкция отклоняется,
 * успешное сохранение подтверждается строкой статуса (role=status), ошибки — понятным текстом.
 */
export function AgentInstructionCard({ agent }: { agent: Agent }) {
  const update = useUpdateAgent();
  const [value, setValue] = useState(agent.instruction);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Если инструкция изменилась снаружи (импорт данных) — поле обновляется
  useEffect(() => { setValue(agent.instruction); }, [agent.instruction]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Инструкция не может быть пустой");
      setSaved(false);
      return;
    }
    setError(null);
    update.mutate(
      { id: agent.id, patch: { instruction: trimmed } },
      {
        onSuccess: () => {
          setSaved(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setSaved(false), 2500);
        },
        onError: (e) => {
          setSaved(false);
          setError(e.message);
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="section-label">Инструкция сотруднику</h3>
      <p className="text-sm">{agent.instruction}</p>
      <div className="space-y-1.5">
        <label htmlFor="agent-instruction" className="text-[13px] font-medium text-muted-foreground">Текст инструкции</label>
        <textarea
          id="agent-instruction"
          rows={4}
          value={value}
          onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "agent-instruction-error" : undefined}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
        <Button variant="default" size="sm" onClick={save} aria-busy={update.isPending}>Сохранить</Button>
        <span className="text-xs text-muted-foreground">ИИ применяет инструкцию к каждому диалогу</span>
        {saved && <span role="status" className="text-xs font-medium" data-testid="instruction-saved">Инструкция сохранена</span>}
        {error && (
          <span id="agent-instruction-error" role="alert" className="flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3.5 shrink-0 text-critical" aria-hidden />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
