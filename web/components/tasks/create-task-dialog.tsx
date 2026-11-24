"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateTask } from "@/lib/api/hooks";
import { ASSIGNEES, TASK_TAGS, buildTask, type NewTaskInput, type TaskPriority } from "@/lib/selectors/tasks";
import type { Task } from "@/lib/schemas";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Модалка «Новая задача» (как openTaskModal прототипа): название (пустое → ошибка «Введите
 * название задачи»), приоритет (средний по умолчанию), срок (дата), исполнитель, раздел.
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  tasks,
  onCreated
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  tasks: readonly Task[];
  onCreated: (task: Task) => void;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("med");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState<string>(ASSIGNEES[0]);
  const [tag, setTag] = useState<string>(TASK_TAGS[0]);
  const [error, setError] = useState<string | null>(null);

  // При открытии — дефолты прототипа (med, «Менеджер», «CRM»).
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setPriority("med");
    setDue("");
    setAssignee(ASSIGNEES[0]);
    setTag(TASK_TAGS[0]);
    setError(null);
  }, [open]);

  const submit = (): void => {
    if (!title.trim()) {
      setError("Введите название задачи");
      return;
    }
    const input: NewTaskInput = { title, priority, due, assignee, tag };
    create.mutate(buildTask(input, tasks), {
      onSuccess: (created) => {
        onOpenChange(false);
        onCreated(created);
      },
      onError: (e) => setError(e.message)
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle className="pr-8 text-[15px] font-medium">Новая задача</DialogTitle>
        <DialogDescription className="sr-only">Название, приоритет, срок, исполнитель и раздел</DialogDescription>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="text-[13px] font-medium text-muted-foreground">
              Что сделать
            </label>
            <input
              id="task-title"
              value={title}
              maxLength={1000}
              onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              placeholder="Напр. Отправить КП клиенту"
              className="h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "task-error" : undefined}
              data-testid="tasks-new-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="task-priority" className="text-[13px] font-medium text-muted-foreground">
                Приоритет
              </label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={FIELD} data-testid="tasks-new-priority">
                <option value="high">Высокий</option>
                <option value="med">Средний</option>
                <option value="low">Низкий</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="task-due" className="text-[13px] font-medium text-muted-foreground">
                Срок
              </label>
              <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={FIELD} data-testid="tasks-new-due" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="task-assignee" className="text-[13px] font-medium text-muted-foreground">
                Исполнитель
              </label>
              <select id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={FIELD} data-testid="tasks-new-assignee">
                {ASSIGNEES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="task-tag" className="text-[13px] font-medium text-muted-foreground">
                Раздел
              </label>
              <select id="task-tag" value={tag} onChange={(e) => setTag(e.target.value)} className={FIELD} data-testid="tasks-new-tag">
                {TASK_TAGS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? (
            <p role="alert" aria-live="polite" className="text-[13px] text-destructive" data-testid="tasks-new-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending} data-testid="tasks-new-cancel">
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="tasks-new-save">
            Создать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
