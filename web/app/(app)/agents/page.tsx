import type { Metadata } from "next";
import { AgentsView } from "@/components/agents/agents-view";

export const metadata: Metadata = { title: "AI-сотрудники" };

export default function Page() {
  return <AgentsView />;
}
