import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Настройки" };

export default function Page() {
  return <PagePlaceholder id="settings" />;
}
