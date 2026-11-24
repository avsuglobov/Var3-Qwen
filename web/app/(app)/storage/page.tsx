import type { Metadata } from "next";
import { StorageView } from "@/components/storage/storage-view";

export const metadata: Metadata = { title: "Хранилище" };

/** Раздел «Хранилище и база знаний»: описание компании, источники знаний. */
export default function Page() {
  return <StorageView />;
}
