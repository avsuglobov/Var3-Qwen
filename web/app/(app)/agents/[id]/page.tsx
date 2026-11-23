import type { Metadata } from "next";
import { AgentDetailView } from "@/components/agents/agent-detail-view";

export const metadata: Metadata = { title: "AI-сотрудник" };

/** Страница сотрудника: /agents/[id]. Имя сотрудника приходит из localStorage-адаптера на клиенте, поэтому title статичен. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentDetailView agentId={id} />;
}
