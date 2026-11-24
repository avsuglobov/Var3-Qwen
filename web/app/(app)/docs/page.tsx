import type { Metadata } from "next";
import { DocumentsView } from "@/components/documents/documents-view";

export const metadata: Metadata = { title: "Документы и согласование" };

/** Раздел «Документы и согласование»: шаблоны, очередь согласования, PDF и печать. */
export default function Page() {
  return <DocumentsView />;
}
