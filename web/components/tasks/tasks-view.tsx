"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useDeleteTask, useToggleTask, useTasks, useUpdateTask } from "@/lib/api/hooks";
import { TASK_FILTERS, TASK_VIEWS, filterTasks, taskStats, todayISO, type TaskFilter, type TaskView } from "@/lib/selectors/tasks";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/schemas";

/**
 * Раздел «Задачи» (этап 3, группа 6): KPI (Всего/Активные/Выполнено/Просрочено), список
 * и доска приоритетов на dnd-kit, создание задачи — поведение tasks() прототипа.
 */
export function TasksView() {
  const tasksQ = useTasks();
  const toggle = useToggleTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const [view, setView] = useState<TaskView>("list");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });
  const clearFeedback = (): void => setFeedback({ text: "", kind: "status" });

  const loading = tasksQ.isPending;
  const error = tasksQ.isError ? tasksQ.error : null;
  const tasks = tasksQ.data ?? [];
  const today = todayISO();
  const stats = taskStats(tasks, today);
  const visible = filterTasks(tasks, filter);

  const onToggle = (task: Task): void => {
    clearFeedback();
    toggle.mutate(
      { id: task.id, done: !task.done },
      {
        onSuccess: () => onFeedback(task.done ? "Задача возвращена в работу" : "Задача выполнена"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );
  };

  const onDelete = (task: Task): void => {
    clearFeedback();
    remove.mutate(task.id, {
      onSuccess: () => onFeedback("Задача удалена"),
      onError: (e) => onFeedback(e.message, "alert")
    });
  };

  const onMove = (taskId: string, toPriority: Task["priority"]): void => {
    clearFeedback();
    update.mutate(
      { id: taskId, patch: { priority: toPriority } },
      {
        onSuccess: () => onFeedback("Приоритет изменён"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-6">
        <Header view={view} filter={filter} onViewChange={() => undefined} onFilterChange={() => undefined} onCreate={() => undefined} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Загрузка задач">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header view={view} filter={filter} onViewChange={() => undefined} onFilterChange={() => undefined} onCreate={() => undefined} />
        <ErrorState message={error.message} onRetry={() => void tasksQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Header view={view} filter={filter} onViewChange={setView} onFilterChange={setFilter} onCreate={() => { clearFeedback(); setCreateOpen(true); }} />

      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="tasks-feedback">
          {feedback.text}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Всего" value={stats.total} testId="tasks-kpi-total" />
        <Kpi label="Активные" value={stats.active} testId="tasks-kpi-active" />
        <Kpi label="Выполнено" value={stats.done} testId="tasks-kpi-done" />
        <Kpi label="Просрочено" value={stats.overdue} testId="tasks-kpi-overdue" critical={stats.overdue > 0} />
      </div>

      {view === "board" ? (
        <TaskBoard tasks={visible} onMove={onMove} onToggle={onToggle} />
      ) : (
        <TaskList tasks={visible} filter={filter} today={today} onToggle={onToggle} onDelete={onDelete} />
      )}

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tasks={tasks}
        onCreated={() => onFeedback("Задача создана")}
      />
    </div>
  );
}

function Kpi({ label, value, testId, critical }: { label: string; value: number; testId: string; critical?: boolean }) {
  return (
    <Card>
      <CardContent>
        <div className="section-label inline-flex items-center gap-1.5">
          {label}
          {critical ? <span className="size-1.5 rounded-full bg-critical" aria-hidden /> : null}
        </div>
        <div className="mt-1.5 font-data text-2xl leading-tight" data-testid={testId}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

/** Шапка раздела: заголовок, «Список/Доска», фильтры и «Новая задача» (pageHead прототипа). */
function Header({
  view,
  filter,
  onViewChange,
  onFilterChange,
  onCreate
}: {
  view: TaskView;
  filter: TaskFilter;
  onViewChange: (v: TaskView) => void;
  onFilterChange: (f: TaskFilter) => void;
  onCreate: () => void;
}) {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Задачи</h1>
      <p className="mt-1 text-sm text-muted-foreground">Дедлайны команды и AI-сотрудников</p>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <Button onClick={onCreate} data-testid="tasks-create-btn">
          <Plus aria-hidden />
          Новая задача
        </Button>
        <Segmented
          group="Вид раздела"
          active={view}
          items={TASK_VIEWS}
          onChange={(v) => onViewChange(v as TaskView)}
          testId="tasks-view"
        />
        <Segmented
          group="Фильтр задач"
          active={filter}
          items={TASK_FILTERS}
          onChange={(f) => onFilterChange(f as TaskFilter)}
          testId="tasks-filter"
        />
      </div>
    </header>
  );
}

function Segmented({
  group,
  active,
  items,
  onChange,
  testId
}: {
  group: string;
  active: string;
  items: readonly { id: string; label: string }[];
  onChange: (id: string) => void;
  testId: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-chip border border-border bg-card p-0.5" role="group" aria-label={group}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={active === it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "inline-flex h-7 items-center rounded-chip px-2.5 text-xs font-medium",
            active === it.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          data-testid={testId}
          data-value={it.id}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
