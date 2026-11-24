"use client";

import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CreateDocumentDialog } from "@/components/documents/create-document-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useDeleteDocument, useDocuments, useLeads, useUpdateDocument } from "@/lib/api/hooks";
import { generateDocPdf, pdfFilename } from "@/lib/pdf/documents";
import { printDocument } from "@/lib/pdf/print";
import {
  DOC_FILTERS,
  DOC_TEMPLATES,
  STATUS_META,
  TYPE_META,
  filterDocs,
  type DocFilter
} from "@/lib/selectors/documents";
import { cn } from "@/lib/utils";
import type { Document } from "@/lib/schemas";

/**
 * Раздел «Документы и согласование» (этап 3, группа 5): шаблоны, очередь согласования,
 * создание/удаление документов, PDF и печать (поведение docs() прототипа). Цены не
 * выдумываются: у документов демо-сида суммы нет — в печатных формах «—» и пометка.
 */
export function DocumentsView() {
  const docsQ = useDocuments();
  const leadsQ = useLeads();
  const updateDoc = useUpdateDocument();
  const removeDoc = useDeleteDocument();

  const [filter, setFilter] = useState<DocFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [defaultClient, setDefaultClient] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });
  const clearFeedback = (): void => setFeedback({ text: "", kind: "status" });

  const loading = docsQ.isPending || leadsQ.isPending;
  const error = docsQ.isError || leadsQ.isError ? docsQ.error ?? leadsQ.error : null;
  const docs = docsQ.data ?? [];
  const leads = leadsQ.data ?? [];
  const clients = leads.map((l) => l.name);
  const visible = filterDocs(docs, filter);

  const openCreate = (client?: string): void => {
    clearFeedback();
    setDefaultClient(client);
    setCreateOpen(true);
  };

  const onPdf = (doc: Document): void => {
    clearFeedback();
    void generateDocPdf(doc)
      .then((fname) => onFeedback("PDF сформирован: " + fname))
      .catch((e: Error) => onFeedback(e.message, "alert"));
  };

  const onPrint = (doc: Document): void => {
    clearFeedback();
    onFeedback("Открываю печать…");
    printDocument(doc, { onUnavailable: () => onFeedback("Печать недоступна в этом окружении", "alert") });
  };

  const onApprove = (doc: Document): void => {
    clearFeedback();
    updateDoc.mutate(
      { id: doc.id, patch: { status: "approved" } },
      {
        onSuccess: () => onFeedback("Документ одобрен"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );
  };

  const onReject = (doc: Document): void => {
    clearFeedback();
    updateDoc.mutate(
      { id: doc.id, patch: { status: "rejected" } },
      {
        onSuccess: () => onFeedback("Документ отклонён"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );
  };

  const onDelete = (doc: Document): void => {
    clearFeedback();
    removeDoc.mutate(doc.id, {
      onSuccess: () => onFeedback("Документ удалён"),
      onError: (e) => onFeedback(e.message, "alert")
    });
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-6">
        <Header onCreate={() => undefined} />
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1fr_1.6fr]" aria-busy="true" aria-label="Загрузка документов">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header onCreate={() => undefined} />
        <ErrorState
          message={error.message}
          onRetry={() => { void docsQ.refetch(); void leadsQ.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Header onCreate={() => openCreate()} />

      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="docs-feedback">
          {feedback.text}
        </p>
      ) : null}

      <section aria-label="Шаблоны документов">
        <div className="section-label mb-2">Шаблоны</div>
        <div className="flex flex-wrap gap-2" data-testid="docs-templates">
          {DOC_TEMPLATES.map((t) => (
            <Badge key={t.id} variant="outline">
              <FileText className="size-3.5" aria-hidden />
              {t.name}
            </Badge>
          ))}
        </div>
      </section>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardContent>
            <div className="section-label mb-3">Что ИИ делает сам</div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <span className="size-1.5 rounded-full bg-status" aria-hidden />
                  Сам
                </Badge>
                <span className="text-xs text-muted-foreground">Формирует счёт по шаблону</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <span className="size-1.5 rounded-full bg-status" aria-hidden />
                  Сам
                </Badge>
                <span className="text-xs text-muted-foreground">Готовит КП по тарифам</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                  Согласует
                </Badge>
                <span className="text-xs text-muted-foreground">Счёт свыше лимита</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="section-label">Очередь согласования</div>
              <div className="inline-flex items-center gap-0.5 rounded-chip border border-border bg-card p-0.5" role="group" aria-label="Фильтр очереди">
                {DOC_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => { setFilter(f.id); clearFeedback(); }}
                    className={cn(
                      "inline-flex h-7 items-center rounded-chip px-2.5 text-xs font-medium",
                      filter === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    data-testid="docs-filter"
                    data-filter={f.id}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto" data-testid="docs-table-wrap">
              <table className="w-full min-w-max border-collapse text-sm" data-testid="docs-table">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Документ", "Тип", "Клиент", "Согласующий", "Статус", ""].map((h, i) => (
                      <th key={h + i} className="section-label px-3 py-2 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground" data-testid="docs-table-empty">
                        Нет документов по выбранному фильтру
                      </td>
                    </tr>
                  ) : (
                    visible.map((doc) => {
                      const meta = STATUS_META[doc.status];
                      return (
                        <tr key={doc.id} className="border-b border-border last:border-b-0" data-testid="docs-row" data-doc={doc.id}>
                          <td className="font-data px-3 py-2.5">{doc.number}</td>
                          <td className="px-3 py-2.5">{TYPE_META[doc.type].label}</td>
                          <td className="px-3 py-2.5">{doc.client}</td>
                          <td className="px-3 py-2.5">{doc.approver}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline">
                              <span className={cn("size-1.5 rounded-full", meta.tone === "status" ? "bg-status" : meta.tone === "critical" ? "bg-critical" : "bg-accent")} aria-hidden />
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {doc.status === "pending" ? (
                                <>
                                  <Button variant="secondary" size="sm" onClick={() => onApprove(doc)} data-testid="docs-approve" data-doc={doc.id}>
                                    Одобрить
                                  </Button>
                                  <Button variant="destructive" size="sm" onClick={() => onReject(doc)} data-testid="docs-reject" data-doc={doc.id}>
                                    Отклонить
                                  </Button>
                                </>
                              ) : null}
                              <Button variant="secondary" size="sm" onClick={() => onPdf(doc)} title={"Скачать " + pdfFilename(doc)} data-testid="docs-pdf" data-doc={doc.id}>
                                <Download className="size-3.5" aria-hidden />
                                PDF
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => onPrint(doc)} data-testid="docs-print" data-doc={doc.id}>
                                <FileText className="size-3.5" aria-hidden />
                                Печать
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onDelete(doc)} aria-label={"Удалить " + doc.number} title="Удалить" data-testid="docs-delete" data-doc={doc.id}>
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={(next) => { setCreateOpen(next); if (!next) setDefaultClient(undefined); }}
        docs={docs}
        clients={clients}
        defaultClient={defaultClient}
        onCreated={() => onFeedback("Документ создан")}
      />
    </div>
  );
}

/** Шапка раздела: заголовок и «Создать документ» (pageHead прототипа). */
function Header({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Документы и согласование</h1>
      <p className="mt-1 text-sm text-muted-foreground">Шаблоны, очередь согласования, отправка PDF</p>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <Button onClick={onCreate} data-testid="docs-create-btn">
          <Plus aria-hidden />
          Создать документ
        </Button>
      </div>
    </header>
  );
}
