import type { Metadata } from "next";
import { TeamView } from "@/components/team/team-view";

export const metadata: Metadata = { title: "Команда" };

/** Раздел «Команда»: шаблоны и визуализация цепочек AI-сотрудников. */
export default function Page() {
  return <TeamView />;
}
