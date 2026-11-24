import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Календарь" };

/** Раздел «Календарь»: сетка месяца, ближайшие события и экспорт .ics (RFC 5545). */
export default function Page() {
  return <CalendarView />;
}
