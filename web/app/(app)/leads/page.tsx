import type { Metadata } from "next";
import { LeadsView } from "@/components/leads/leads-view";

export const metadata: Metadata = { title: "Лиды и автокасания" };

/** Раздел «Лиды и автокасания»: импорт базы из .xlsx/.csv и сценарий реактивации. */
export default function Page() {
  return <LeadsView />;
}
