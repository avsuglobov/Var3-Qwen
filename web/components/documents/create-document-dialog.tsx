"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateDocument } from "@/lib/api/hooks";
import { APPROVERS, TYPE_META, buildDocument, type DocType } from "@/lib/selectors/documents";
import type { Document } from "@/lib/schemas";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Модалка «Создать документ» (как openDocModal прототипа): тип (Счёт/Коммерческое предложение/Акт),
 * клиент (из лидов), согласующий. Сумма не запрашивается (демо) — документ уходит в очередь согласования.
 */
export function CreateDocumentDialog({
  open,
  onOpenChange,
  docs,
  clients,
  defaultClient,
  onCreated
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  docs: readonly Document[];
  clients: readonly string[];
  defaultClient?: string;
  onCreated: (doc: Document) => void;
}) {
  const create = useCreateDocument();
  const [type, setType] = useState<DocType>("invoice");
  const [client, setClient] = useState("");
  const [approver, setApprover] = useState<string>(APPROVERS[0]);
  const [error, setError] = useState<string | null>(null);

  const options = clients.length ? clients : ["—"];

  // При открытии — дефолты прототипа (invoice, первый клиент, «Менеджер продаж»);
  // из CRM клиент подставляется по лида (openDocModal(client)).
  useEffect(() => {
    if (!open) return;
    setType("invoice");
    setApprover(APPROVERS[0]);
    setError(null);
    setClient(defaultClient && options.includes(defaultClient) ? defaultClient : options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultClient]);

  const close = (): void => onOpenChange(false);

  const submit = (): void => {
    const doc = buildDocument({ type, client, approver }, docs);
    create.mutate(doc, {
      onSuccess: (created) => {
        close();
        onCreated(created);
      },
      onError: (e) => setError(e.message)
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle className="pr-8 text-[15px] font-medium">Создать документ</DialogTitle>
        <DialogDescription className="sr-only">Тип документа, клиент и согласующий</DialogDescription>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="doc-type" className="text-[13px] font-medium text-muted-foreground">
              Тип документа
            </label>
            <select id="doc-type" value={type} onChange={(e) => setType(e.target.value as DocType)} className={FIELD} data-testid="docs-new-type">
              {(Object.keys(TYPE_META) as DocType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="doc-client" className="text-[13px] font-medium text-muted-foreground">
              Клиент
            </label>
            <select id="doc-client" value={client} onChange={(e) => setClient(e.target.value)} className={FIELD} data-testid="docs-new-client">
              {options.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="doc-approver" className="text-[13px] font-medium text-muted-foreground">
              Согласующий
            </label>
            <select id="doc-approver" value={approver} onChange={(e) => setApprover(e.target.value)} className={FIELD} data-testid="docs-new-approver">
              {APPROVERS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Сумма не запрашивается (демо). Документ уйдёт в очередь согласования.
          </p>
          {error ? (
            <p role="alert" aria-live="polite" className="text-[13px] text-destructive" data-testid="docs-new-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={create.isPending} data-testid="docs-new-cancel">
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="docs-new-save">
            Создать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
