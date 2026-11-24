import type { Metadata } from "next";
import { TrainingView } from "@/components/training/training-view";

export const metadata: Metadata = { title: "Обучение" };

/** Раздел «Обучение»: курсы с прогрессом, демо-тесты, сертификаты (PDF). */
export default function Page() {
  return <TrainingView />;
}
