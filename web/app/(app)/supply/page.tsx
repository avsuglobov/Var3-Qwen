import type { Metadata } from "next";
import { SupplyView } from "@/components/supply/supply-view";

export const metadata: Metadata = { title: "Снабжение" };

/** Раздел «Снабжение»: запросы поставщикам и сводка условий (без цен). */
export default function Page() {
  return <SupplyView />;
}
