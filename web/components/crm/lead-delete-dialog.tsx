"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDeleteLead } from "@/lib/api/hooks";
import type { Lead } from "@/lib/schemas";

/**
 * Подтверждение удаления лида (как модалка прототипа): лид будет удалён без возможности
 * восстановления; удаление — только после явного «Удалить».
 */
export function LeadDeleteDialog({
  lead,
  onOpenChange,
  onDeleted
}: {
  lead: Lead | null;
  onOpenChange: (next: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteLead();
  return (
    <Dialog open={lead !== null} onOpenChange={(next) => { if (!remove.isPending) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle className="pr-8 text-[15px] font-medium">Удалить лид?</DialogTitle>
        <DialogDescription className="sr-only">Лид будет удалён без возможности восстановления</DialogDescription>
        {lead ? (
          <p className="text-sm text-muted-foreground" data-testid="crm-delete-text">
            Лид «{lead.name}» ({lead.id}) будет удалён без возможности восстановления.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="crm-delete-cancel">
            Отмена
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (!lead) return;
              remove.mutate(lead.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  onDeleted();
                }
              });
            }}
            data-testid="crm-delete-confirm"
          >
            Удалить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
