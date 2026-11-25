"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateCourse } from "@/lib/api/hooks";
import { buildTestCourse } from "@/lib/selectors/training";
import type { Course } from "@/lib/schemas";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Модалка «Тест из материала» (этап 7): генерация теста курса из тезисов материала
 * источника знаний. Содержание не выдумывается — вопросы собираются механически из
 * тезисов пользователя (materialQuiz/buildTestCourse), курс сохраняется в хранилище
 * (demo:false, sourceId) и сразу доступен для прохождения в «Обучении».
 */
export function MaterialTestDialog({
  open,
  onOpenChange,
  source,
  courses,
  onCreated
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  source: { id: string; name: string } | null;
  courses: readonly Course[];
  onCreated: (course: Course) => void;
}) {
  const create = useCreateCourse();
  // Состояние инициализируется от источника; родитель передаёт key={source.id}, поэтому
  // при выборе другой строки форма пересоздаётся с чистыми полями.
  const [name, setName] = useState(source?.name ?? "");
  const [statements, setStatements] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setName("");
    setStatements("");
    setError(null);
    onOpenChange(false);
  };

  const submit = (): void => {
    if (!source) return;
    const built = buildTestCourse({ sourceId: source.id, sourceName: name, statements: statements.split("\n") }, courses);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    create.mutate(built, {
      onSuccess: (created) => {
        close();
        onCreated(created);
      },
      onError: (e) => setError(e.message)
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DialogContent data-testid="material-dialog">
        <DialogTitle className="pr-8 text-[15px] font-medium">Тест из материала</DialogTitle>
        <DialogDescription className="sr-only">Тезисы материала источника знаний — из них собирается тест курса</DialogDescription>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="material-source-name" className="text-[13px] font-medium text-muted-foreground">
              Источник
            </label>
            <input
              id="material-source-name"
              value={name}
              maxLength={240}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className={FIELD}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "material-error" : undefined}
              data-testid="material-source-name"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="material-statements" className="text-[13px] font-medium text-muted-foreground">
              Тезисы материала
            </label>
            <textarea
              id="material-statements"
              value={statements}
              rows={6}
              maxLength={6000}
              onChange={(e) => { setStatements(e.target.value); setError(null); }}
              placeholder={"По одному утверждению на строку, минимум четыре.\nНапример: Возврат оформляется в течение 14 дней"}
              className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              aria-describedby="material-help"
              data-testid="material-statements"
            />
            <p id="material-help" className="text-[11.5px] text-muted-foreground">
              Из каждого тезиса (до 300 знаков) соберётся вопрос «Какое утверждение соответствует материалу?» с четырьмя вариантами. Тест появится в «Обучении».
            </p>
          </div>
          {error ? (
            <p id="material-error" role="alert" className="flex items-center gap-1.5 text-[13px]" data-testid="material-error" aria-live="polite">
              <AlertTriangle className="size-4 shrink-0 text-critical" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} data-testid="material-cancel">
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending || !source} data-testid="material-save">
            Создать тест
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
