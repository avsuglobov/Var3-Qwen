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
import { User } from "lucide-react";
import { TaskCheck } from "@/components/tasks/task-list";
import { PRIORITIES, type TaskPriority } from "@/lib/selectors/tasks";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/schemas";

/**
 * Вид «Доска» раздела «Задачи» (этап 3, группа 6): три колонки приоритетов, перемещение
 * карточек перетаскиванием (dnd-kit: мышь, тач и клавиатура) — как kanban-колонки прототипа.
 * Кнопка-чекбокс внутри карточки не захватывает drag (listeners — только на области названия).
 */
export function TaskBoard({
  tasks,
  onMove,
  onToggle
}: {
  tasks: readonly Task[];
  onMove: (taskId: string, toPriority: TaskPriority) => void;
  onToggle: (task: Task) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    const toPriority = String(over.id) as TaskPriority;
    if (active.data.current?.priority !== toPriority) onMove(String(active.id), toPriority);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-2" data-testid="tasks-board">
        <div className="grid min-w-max grid-flow-col auto-cols-[minmax(240px,1fr)] items-start gap-3.5">
          {PRIORITIES.map((p) => (
            <TaskColumn key={p.id} priority={p.id} label={p.label} tone={p.tone} tasks={tasks} onMove={onMove} onToggle={onToggle} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Перетащите карточку в колонку приоритета (мышь, касание или клавиатура dnd-kit).
      </p>
    </DndContext>
  );
}

function TaskColumn({
  priority,
  label,
  tone,
  tasks,
  onMove,
  onToggle
}: {
  priority: TaskPriority;
  label: string;
  tone: "critical" | "accent" | "muted";
  tasks: readonly Task[];
  onMove: (taskId: string, toPriority: TaskPriority) => void;
  onToggle: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: priority });
  const items = tasks.filter((t) => t.priority === priority);
  return (
    <div
      ref={setNodeRef}
      className={cn("min-h-[200px] rounded-card border bg-muted p-2.5", isOver ? "border-primary" : "border-border")}
      data-testid="tasks-col"
      data-priority={priority}
    >
      <div className="flex items-center justify-between px-1 pb-2.5 pt-1">
        <span className="section-label inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", tone === "critical" ? "bg-critical" : tone === "accent" ? "bg-accent" : "bg-muted-foreground")} aria-hidden />
          {label}
        </span>
        <span className="font-data text-[11px] text-muted-foreground" data-testid="tasks-col-count">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11.5px] text-muted-foreground">Перетащите карточку сюда</div>
        ) : (
          items.map((t) => <TaskCard key={t.id} task={t} onMove={onMove} onToggle={onToggle} />)
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onMove, onToggle }: { task: Task; onMove: (taskId: string, toPriority: TaskPriority) => void; onToggle: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { priority: task.priority } });
  return (
    <div
      ref={setNodeRef}
      className={cn("flex items-start gap-2 rounded-chip border border-border bg-card p-2.5", isDragging && "opacity-50")}
      data-testid="tasks-card"
      data-task={task.id}
    >
      <TaskCheck task={task} onToggle={onToggle} />
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="min-w-0 flex-1 cursor-grab text-left focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={task.title}
      >
        <span className={cn("block text-[13px] font-medium", task.done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
          <span className="rounded-chip border border-border px-1.5 py-0.5">{task.tag}</span>
          <span className="inline-flex items-center gap-1">
            <User className="size-2.5" aria-hidden />
            {task.assignee}
          </span>
          <span>{task.due || "—"}</span>
        </span>
      </button>
    </div>
  );
}
