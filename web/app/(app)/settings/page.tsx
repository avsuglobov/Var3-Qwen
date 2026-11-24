import type { Metadata } from "next";
import { SettingsView } from "@/components/system/settings-view";

export const metadata: Metadata = { title: "Настройки" };

/** Раздел «Настройки»: 7 вкладок, переключатели уведомлений, экспорт/импорт/сброс данных. */
export default function Page() {
  return <SettingsView />;
}
