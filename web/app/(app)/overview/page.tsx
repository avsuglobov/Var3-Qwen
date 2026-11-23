import type { Metadata } from "next";
import { OverviewView } from "@/components/overview/overview-view";

export const metadata: Metadata = { title: "Обзор" };

export default function Page() {
  return <OverviewView />;
}
