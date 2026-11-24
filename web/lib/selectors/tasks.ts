import type { Task } from "@/lib/schemas";

/**
 * Чистые функции раздела «Задачи» (этап 3, группа 6). Поведение перенесено из прототипа
 * (`../download/sections3.js` tasks()/openTaskModal(), `db.js` TASKS): фильтры «Все/Активные/
 * Выполненные», KPI (Всего/Активные/Выполнено/Просрочено), доска по приоритетам,
 * правила создания задачи.
 */

/** Виды раздела: «Список» и «Доска» (segmented в шапке прототипа). */
export type TaskView = "list" | "board";
export const TASK_VIEWS: readonly { id: TaskView; label: string }[] = [
  { id: "list", label: "Список" },
  { id: "board", label: "Доска" }
];

/** Фильтры списка. */
export type TaskFilter = "all" | "active" | "done";
export const TASK_FILTERS: readonly { id: TaskFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "done", label: "Выполненные" }
];

export type TaskPriority = Task["priority"];

/** Приоритеты: подписи и порядок колонок доски (Высокий → Средний → Низкий). */
export const PRIORITIES: readonly { id: TaskPriority; label: string; tone: "critical" | "accent" | "muted" }[] = [
  { id: "high", label: "Высокий", tone: "critical" },
  { id: "med", label: "Средний", tone: "accent" },
  { id: "low", label: "Низкий", tone: "muted" }
];

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: "critical" | "accent" | "muted" }> = {
  high: { label: "Высокий", tone: "critical" },
  med: { label: "Средний", tone: "accent" },
  low: { label: "Низкий", tone: "muted" }
};

/** Варианты «Исполнитель» в модалке (assigneeOpts прототипа; «ИИ-» переименованы в «AI-»). */
export const ASSIGNEES: readonly string[] = ["Менеджер", "AI-Продажи", "AI-Снабжение", "AI-РОП", "Бухгалтерия"];

/** Варианты «Раздел» (тег задачи). */
export const TASK_TAGS: readonly string[] = ["CRM", "Документы", "Диалоги", "Снабжение", "Команда"];

export function filterTasks(tasks: readonly Task[], filter: TaskFilter): Task[] {
  if (filter === "active") return tasks.filter((t) => !t.done);
  if (filter === "done") return tasks.filter((t) => t.done);
  return [...tasks];
}

/** Просрочена: не выполнена и срок раньше сегодняшнего дня (сравнение строк YYYY-MM-DD). */
export function isOverdue(task: Task, today: string): boolean {
  return !task.done && !!task.due && task.due < today;
}

export interface TaskStats {
  total: number;
  active: number;
  done: number;
  overdue: number;
}

/** KPI-карточки раздела (grid-4 прототипа). */
export function taskStats(tasks: readonly Task[], today: string = todayISO()): TaskStats {
  return {
    total: tasks.length,
    active: tasks.filter((t) => !t.done).length,
    done: tasks.filter((t) => t.done).length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length
  };
}

/** Сегодняшняя дата в формате YYYY-MM-DD (локальная, как todayStr прототипа). */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number): string => (n < 10 ? "0" + n : String(n));
  return now.getFullYear() + "-" + p(now.getMonth() + 1) + "-" + p(now.getDate());
}

/** Задачи колонки доски по приоритету. */
export function tasksByPriority(tasks: readonly Task[], priority: TaskPriority): Task[] {
  return tasks.filter((t) => t.priority === priority);
}

/** Следующий номер задачи: max числовой части «TK-N» + 1 (как nextNum("TK-") db.js; сид до TK-6 → TK-7). */
export function nextTaskId(tasks: readonly Task[]): string {
  let max = 0;
  for (const t of tasks) {
    const m = /^TK-(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TK-${max + 1}`;
}

export interface NewTaskInput {
  title: string;
  priority: TaskPriority;
  due: string;
  assignee: string;
  tag: string;
}

/** Создание задачи (db.addTask): пустое название не проходит (модалка блокирует), done=false. */
export function buildTask(input: NewTaskInput, tasks: readonly Task[]): Task {
  return {
    id: nextTaskId(tasks),
    title: input.title.trim(),
    done: false,
    priority: input.priority,
    due: input.due || "",
    assignee: input.assignee || "Менеджер",
    tag: input.tag || "CRM"
  };
}
