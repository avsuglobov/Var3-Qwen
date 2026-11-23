import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Задачи" };

export default function Page() {
  return <PagePlaceholder id="tasks" />;
}
