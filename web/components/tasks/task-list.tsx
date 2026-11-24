"use client";

import { Check, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";
import { PRIORITY_META, isOverdue, type TaskFilter } from "@/lib/selectors/tasks";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/schemas";

/**
 * Вид «Список» и «Доска» раздела «Задачи» (этап 3, группа 6) — порт tasks() прототипа:
 * строки с чек-тогглом, бейдж приоритета, исполнитель, «Просрочено · дата» точкой+текстом;
 * доска — три колонки приоритетов на dnd-kit (мышь и тач, клавиатурный сенсор dnd-kit).
 */
export function TaskList({
  tasks,
  filter,
  today,
  onToggle,
  onDelete
}: {
  tasks: readonly Task[];
  filter: TaskFilter;
  today: string;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <Card>
      <CardContent>
        <div className="min-w-0" data-testid="tasks-list">
          {tasks.length === 0 ? (
            <EmptyState title="Нет задач" hint="Создайте первую задачу или смените фильтр." />
          ) : (
            tasks.map((t) => <TaskRow key={t.id} task={t} today={today} onToggle={onToggle} onDelete={onDelete} />)
          )}
        </div>
        {filter === "done" && tasks.length > 0 ? (
          <p className="mt-3 text-[11.5px] text-muted-foreground">Выполненные задачи можно вернуть кнопкой-чекбоксом.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task, today, onToggle, onDelete }: { task: Task; today: string; onToggle: (task: Task) => void; onDelete: (task: Task) => void }) {
  const pri = PRIORITY_META[task.priority];
  const overdue = isOverdue(task, today);
  return (
    <div className={cn("flex min-w-0 flex-wrap items-start gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0")} data-testid="tasks-row" data-task={task.id}>
      <TaskCheck task={task} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", task.done && "text-muted-foreground line-through")} data-testid="tasks-row-title">
          {task.title}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {task.tag}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            <span className={cn("size-1.5 rounded-full", pri.tone === "critical" ? "bg-critical" : pri.tone === "accent" ? "bg-accent" : "bg-muted-foreground")} aria-hidden />
            {pri.label}
          </Badge>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <User className="size-3" aria-hidden />
            {task.assignee}
          </span>
          {overdue ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-critical dark:text-foreground" data-testid="tasks-overdue">
              <span className="size-1.5 rounded-full bg-critical" aria-hidden />
              Просрочено · {task.due}
            </span>
          ) : task.due ? (
            <span className="text-[11.5px] text-muted-foreground">{task.due}</span>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">—</span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onDelete(task)} aria-label={"Удалить " + task.title} title="Удалить" data-testid="tasks-delete" data-task={task.id}>
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

/** Чек-тоггл «Готово» (как task-check прототипа): иконка галочки только у выполненных. */
export function TaskCheck({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(task)}
      aria-label={task.done ? "Вернуть в работу" : "Готово"}
      aria-pressed={task.done}
      className={cn(
        "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
        task.done ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent hover:border-primary"
      )}
      data-testid="tasks-toggle"
      data-task={task.id}
    >
      <Check className="size-3" aria-hidden />
    </button>
  );
}
