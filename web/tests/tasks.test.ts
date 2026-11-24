import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import {
  ASSIGNEES,
  buildTask,
  filterTasks,
  isOverdue,
  nextTaskId,
  PRIORITY_META,
  taskStats,
  tasksByPriority,
  todayISO,
  type NewTaskInput
} from "@/lib/selectors/tasks";

/* Селекторы раздела «Задачи»: фильтры, KPI, просрочка, доска по приоритетам, создание. */

const tasks = SEED_DATA.TASKS;

describe("селекторы «Задачи»: фильтры и KPI", () => {
  it("filterTasks: all — все 6, active — 5, done — только TK-5", () => {
    expect(filterTasks(tasks, "all").length).toBe(6);
    expect(filterTasks(tasks, "active").every((t) => !t.done)).toBe(true);
    expect(filterTasks(tasks, "active").length).toBe(5);
    expect(filterTasks(tasks, "done").map((t) => t.id)).toEqual(["TK-5"]);
  });
  it("taskStats: Всего 6, Активные 5, Выполнено 1; просрочка строго раньше сегодня", () => {
    const s = taskStats(tasks, "2026-11-17");
    expect(s).toEqual({ total: 6, active: 5, done: 1, overdue: 2 }); // TK-1 (11-16) и TK-2 (11-15); TK-3 (11-17) не просрочена
    expect(taskStats(tasks, "2026-11-24").overdue).toBe(5);
  });
  it("isOverdue: выполненная задача не просрочена, без срока — нет", () => {
    expect(isOverdue(tasks[0], "2026-11-24")).toBe(true);
    expect(isOverdue(tasks[4], "2026-11-24")).toBe(false);
    expect(isOverdue({ ...tasks[0], due: "" }, "2026-11-24")).toBe(false);
  });
  it("todayISO: локальная дата YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 10, 24))).toBe("2026-11-24");
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("селекторы «Задачи»: доска и создание", () => {
  it("tasksByPriority: колонки доски high/med/low", () => {
    expect(tasksByPriority(tasks, "high").map((t) => t.id)).toEqual(["TK-1", "TK-2"]);
    expect(tasksByPriority(tasks, "med").length).toBe(2);
    expect(tasksByPriority(tasks, "low").length).toBe(2);
  });
  it("PRIORITIES: порядок колонок и подписи, метки без «ИИ-»", () => {
    expect(PRIORITY_META.high.label).toBe("Высокий");
    expect(ASSIGNEES).toContain("AI-Продажи");
    expect(ASSIGNEES.every((a) => !a.includes("ИИ-"))).toBe(true);
  });
  it("nextTaskId: max числовой части + 1 (сид до TK-6 → TK-7)", () => {
    expect(nextTaskId(tasks)).toBe("TK-7");
    expect(nextTaskId([])).toBe("TK-1");
  });
  it("buildTask: TK-7, не выполнена, «Новая задача»-поля по умолчанию, название обрезается", () => {
    const input: NewTaskInput = { title: "  Отправить КП  ", priority: "med", due: "2026-11-25", assignee: "Менеджер", tag: "Документы" };
    const t = buildTask(input, tasks);
    expect(t.id).toBe("TK-7");
    expect(t.title).toBe("Отправить КП");
    expect(t.done).toBe(false);
    expect(t.due).toBe("2026-11-25");
    expect(buildTask({ ...input, title: "x", due: "", assignee: "", tag: "" }, tasks)).toMatchObject({ due: "", assignee: "Менеджер", tag: "CRM" });
  });
});
