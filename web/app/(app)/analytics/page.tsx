import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Аналитика" };

/** Раздел «Аналитика»: разбор диалогов менеджеров и чат «Вопрос руководителю». */
export default function Page() {
  return <AnalyticsView />;
}
