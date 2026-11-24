import type { Metadata } from "next";
import { IntegrationsView } from "@/components/system/integrations-view";

export const metadata: Metadata = { title: "Интеграции" };

/** Раздел «Интеграции»: карточки сервисов со статусами, «Запросить интеграцию». */
export default function Page() {
  return <IntegrationsView />;
}
