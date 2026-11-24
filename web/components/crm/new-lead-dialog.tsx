"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateLead } from "@/lib/api/hooks";
import { buildLead } from "@/lib/selectors/crm";
import { CHANNEL_IDS, type Agent, type Channel, type Funnel, type Lead } from "@/lib/schemas";

/**
 * Модалка «Создать лид» (как openLeadModal прототипа): имя (пустое → «Новый лид»), канал,
 * воронка, агент, заметка. Пустое имя ошибкой не считается — лид создаётся с именем «Новый лид».
 */
export function NewLeadDialog({
  open,
  onOpenChange,
  leads,
  funnels,
  channels,
  agents,
  defaultFunnelId,
  onCreated
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  leads: readonly Lead[];
  funnels: readonly Funnel[];
  channels: Record<string, Channel>;
  agents: readonly Agent[];
  defaultFunnelId: string;
  onCreated: (lead: Lead) => void;
}) {
  const create = useCreateLead();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Lead["channel"]>("site");
  const [funnelId, setFunnelId] = useState(defaultFunnelId);
  const [agentId, setAgentId] = useState("ag-sales");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setName("");
    setChannel("site");
    setFunnelId(defaultFunnelId);
    setAgentId("ag-sales");
    setNote("");
    setError(null);
    onOpenChange(false);
  };

  const submit = (): void => {
    const lead = buildLead({ name, channel, funnelId, agentId, note }, leads);
    create.mutate(lead, {
      onSuccess: (created) => {
        close();
        onCreated(created);
      },
      onError: (e) => setError(e.message)
    });
  };

  const field = "h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle className="pr-8 text-[15px] font-medium">Создать лид</DialogTitle>
        <DialogDescription className="sr-only">Имя клиента, канал, воронка, агент и заметка нового лида</DialogDescription>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="lead-name" className="text-[13px] font-medium text-muted-foreground">
              Имя клиента
            </label>
            <input
              id="lead-name"
              value={name}
              maxLength={300}
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              placeholder="Например: ООО Ромашка"
              className="h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "lead-error" : undefined}
              data-testid="crm-new-lead-name"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-channel" className="text-[13px] font-medium text-muted-foreground">
              Канал
            </label>
            <select id="lead-channel" value={channel} onChange={(e) => setChannel(e.target.value as Lead["channel"])} className={field} data-testid="crm-new-lead-channel">
              {CHANNEL_IDS.map((c) => (
                <option key={c} value={c}>
                  {channels[c]?.name ?? c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-funnel" className="text-[13px] font-medium text-muted-foreground">
              Воронка
            </label>
            <select id="lead-funnel" value={funnelId} onChange={(e) => setFunnelId(e.target.value)} className={field} data-testid="crm-new-lead-funnel">
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-agent" className="text-[13px] font-medium text-muted-foreground">
              Агент
            </label>
            <select id="lead-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} className={field} data-testid="crm-new-lead-agent">
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-note" className="text-[13px] font-medium text-muted-foreground">
              Заметка
            </label>
            <textarea
              id="lead-note"
              rows={2}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Контекст обращения"
              className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              data-testid="crm-new-lead-note"
            />
          </div>
          {error && (
            <p id="lead-error" role="alert" className="flex items-center gap-1.5 text-[13px]" data-testid="crm-new-lead-error">
              <AlertTriangle className="size-4 shrink-0 text-critical" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} data-testid="crm-new-lead-cancel">
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="crm-new-lead-save">
            Создать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
