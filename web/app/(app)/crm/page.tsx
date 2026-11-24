import type { Metadata } from "next";
import { CrmView } from "@/components/crm/crm-view";

export const metadata: Metadata = { title: "CRM" };

/** Раздел «CRM»: журнал смены с инспектором лида, канбан стадий на dnd-kit, таблица. */
export default function Page() {
  return <CrmView />;
}
