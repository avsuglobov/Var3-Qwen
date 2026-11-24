import type { Metadata } from "next";
import { HelpView } from "@/components/system/help-view";

export const metadata: Metadata = { title: "Помощь" };

/** Раздел «Помощь»: карточка поддержки и чат обучения с ответами по сценарию. */
export default function Page() {
  return <HelpView />;
}
