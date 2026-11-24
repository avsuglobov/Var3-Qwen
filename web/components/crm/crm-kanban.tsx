"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { ChannelGlyph } from "@/components/agents/channel-icon";
import type { Channel, Lead, Stage } from "@/lib/schemas";
import { isCritical } from "@/lib/selectors/crm";
import { cn } from "@/lib/utils";

/**
 * Вид «Канбан» раздела CRM (этап 3, группа 3): колонки стадий воронки, карточки лидов,
 * перемещение между стадиями перетаскиванием (dnd-kit: мышь и тач; клавиатурная альтернатива —
 * список «Стадия» в инспекторе лида, как в прототипе). Клик по карточке открывает лид в журнале.
 */
export function CrmKanban({
  leads,
  stages,
  channels,
  onMoveStage,
  onSelect
}: {
  leads: readonly Lead[];
  stages: readonly Stage[];
  channels: Record<string, Channel>;
  onMoveStage: (leadId: string, stageId: string) => void;
  onSelect: (leadId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    const fromStage = active.data.current?.stageId as string | undefined;
    const toStage = String(over.id);
    if (fromStage && toStage && fromStage !== toStage) onMoveStage(String(active.id), toStage);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-2" data-testid="crm-kanban">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(240px,1fr)] items-start gap-3.5">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leads.filter((l) => l.stageId === stage.id)}
              channels={channels}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Перетащите карточку на стадию (мышь или касание); с клавиатуры стадию можно сменить списком «Стадия» в инспекторе лида.
      </p>
    </DndContext>
  );
}

function KanbanColumn({
  stage,
  leads,
  channels,
  onSelect
}: {
  stage: Stage;
  leads: readonly Lead[];
  channels: Record<string, Channel>;
  onSelect: (leadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn("min-h-[200px] rounded-card border bg-muted p-2.5", isOver ? "border-primary" : "border-border")}
      data-testid="crm-kanban-col"
      data-stage={stage.id}
    >
      <div className="flex items-center justify-between px-1 pb-2.5 pt-1">
        <span className="section-label">{stage.name}</span>
        <span className="font-data text-[11px] text-muted-foreground" data-testid="crm-kanban-col-count">
          {leads.length}
        </span>
      </div>
      <div className="space-y-2">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} channel={channels[lead.channel]} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ lead, channel, onSelect }: { lead: Lead; channel: Channel | undefined; onSelect: (leadId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { stageId: lead.stageId } });
  const critical = isCritical(lead.note);
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onSelect(lead.id)}
      className={cn(
        "block w-full cursor-grab rounded-chip border border-border bg-card p-3 text-left hover:shadow-[var(--shadow-pop)]",
        isDragging && "opacity-50"
      )}
      data-testid="crm-kanban-card"
      data-lead={lead.id}
    >
      <span className="mb-1.5 block text-[13px] font-medium">{lead.name}</span>
      <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        <ChannelGlyph name={channel?.icon ?? ""} />
        <span className="font-data">{lead.id}</span>
        {critical ? (
          <span className="inline-flex items-center gap-1 font-semibold text-critical dark:text-foreground" data-testid="crm-kanban-critical">
            <span className="size-1.5 shrink-0 rounded-full bg-critical" aria-hidden />
            КРИТИЧНО
          </span>
        ) : null}
      </span>
    </button>
  );
}
