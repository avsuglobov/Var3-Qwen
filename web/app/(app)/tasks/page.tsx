import type { Metadata } from "next";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "Задачи" };

/** Раздел «Задачи»: KPI, список с фильтрами и доска приоритетов на dnd-kit. */
export default function Page() {
  return <TasksView />;
}
