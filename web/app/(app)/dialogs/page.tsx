import type { Metadata } from "next";
import { ConversationsView } from "@/components/dialogs/conversations-view";

export const metadata: Metadata = { title: "Диалоги" };

/** Раздел «Диалоги»: единый inbox — список чатов, переписка с режимами ИИ/менеджера, контекст клиента. */
export default function Page() {
  return <ConversationsView />;
}
