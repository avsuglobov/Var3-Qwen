"use client";

import { AlertTriangle, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateCourse } from "@/lib/api/hooks";
import { buildCourse } from "@/lib/selectors/training";
import type { Course } from "@/lib/schemas";

/** Вариант ответа вопроса теста в форме: 4 варианта, как в демо-тестах. */
const OPTION_COUNT = 4;

interface QuestionDraft {
  q: string;
  options: string[];
  answer: number | null;
}

const emptyQuestion = (): QuestionDraft => ({ q: "", options: Array.from({ length: OPTION_COUNT }, () => ""), answer: null });

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Модалка «Создать курс» (этап 6): название, уроки (список с добавлением/удалением) и
 * необязательный тест (вопросы с 4 вариантами и верным ответом). Курс сохраняется в хранилище
 * (CR-NNNN, прогресс 0, «Не начат», demo:false) и сразу доступен для прохождения теста.
 */
export function CreateCourseDialog({
  open,
  onOpenChange,
  courses,
  onCreated
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  courses: readonly Course[];
  onCreated: (course: Course) => void;
}) {
  const create = useCreateCourse();
  const [title, setTitle] = useState("");
  const [lessons, setLessons] = useState<string[]>([""]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setTitle("");
    setLessons([""]);
    setQuestions([]);
    setError(null);
    onOpenChange(false);
  };

  const submit = (): void => {
    const built = buildCourse(
      { title, lessonTitles: lessons, questions: questions.filter((q) => q.q.trim() || q.options.some((o) => o.trim())).map((q) => ({ q: q.q.trim(), options: q.options.map((o) => o.trim()), answer: q.answer ?? -1 })) },
      courses
    );
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

  /** Ошибка уровня формы до buildCourse: частично заполненный вопрос теста. */
  const questionError = (): string | null => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const touched = q.q.trim() || q.options.some((o) => o.trim());
      if (!touched) continue;
      if (!q.q.trim()) return `Заполните текст вопроса ${i + 1}`;
      if (q.options.some((o) => !o.trim())) return `Заполните все 4 варианта ответа в вопросе ${i + 1}`;
      if (q.answer == null) return `Выберите верный ответ в вопросе ${i + 1}`;
    }
    return null;
  };

  const validationError = questionError() ?? error;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!create.isPending) onOpenChange(next); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="course-dialog">
        <DialogTitle className="pr-8 text-[15px] font-medium">Создать курс</DialogTitle>
        <DialogDescription className="sr-only">Название курса, уроки и необязательный тест с верными ответами</DialogDescription>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="course-title" className="text-[13px] font-medium text-muted-foreground">
              Название курса
            </label>
            <input
              id="course-title"
              value={title}
              maxLength={300}
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              placeholder="Например: Онбординг менеджеров"
              className={FIELD}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={validationError ? "course-error" : undefined}
              data-testid="course-title"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">Уроки</span>
            <div className="space-y-1.5" data-testid="course-lessons">
              {lessons.map((l, i) => (
                <div key={i} className="flex items-center gap-1.5" data-testid="course-lesson-row">
                  <input
                    value={l}
                    maxLength={300}
                    aria-label={`Урок ${i + 1}`}
                    placeholder={`Урок ${i + 1}`}
                    onChange={(e) => setLessons((cur) => cur.map((x, k) => (k === i ? e.target.value : x)))}
                    className={FIELD}
                    data-testid="course-lesson-input"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Убрать урок ${i + 1}`}
                    title="Убрать урок"
                    disabled={lessons.length === 1}
                    data-testid="course-lesson-remove"
                    onClick={() => setLessons((cur) => cur.filter((_, k) => k !== i))}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" data-testid="course-lesson-add" onClick={() => setLessons((cur) => [...cur, ""])}>
              <Plus className="size-3.5" aria-hidden />
              Добавить урок
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-muted-foreground">Тест курса (необязательно)</span>
              <Button variant="secondary" size="sm" data-testid="course-question-add" onClick={() => setQuestions((cur) => [...cur, emptyQuestion()])}>
                <Plus className="size-3.5" aria-hidden />
                Добавить вопрос
              </Button>
            </div>
            {questions.map((q, i) => (
              <div key={i} className="space-y-2 rounded-chip border border-border p-3" data-testid="course-question">
                <div className="flex items-center gap-1.5">
                  <input
                    value={q.q}
                    maxLength={500}
                    aria-label={`Текст вопроса ${i + 1}`}
                    placeholder={`Вопрос ${i + 1}`}
                    onChange={(e) => setQuestions((cur) => cur.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)))}
                    className={FIELD}
                    data-testid="course-q"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Убрать вопрос ${i + 1}`}
                    title="Убрать вопрос"
                    data-testid="course-question-remove"
                    onClick={() => setQuestions((cur) => cur.filter((_, k) => k !== i))}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, k) => (
                    <label key={k} className="flex items-center gap-2 text-[13px]">
                      <input
                        type="radio"
                        name={`course-answer-${i}`}
                        checked={q.answer === k}
                        onChange={() => setQuestions((cur) => cur.map((x, j) => (j === i ? { ...x, answer: k } : x)))}
                        className="accent-primary"
                        aria-label={`Вариант ${k + 1} — верный ответ`}
                        data-testid="course-answer"
                      />
                      <input
                        value={o}
                        maxLength={300}
                        aria-label={`Вариант ответа ${k + 1} вопроса ${i + 1}`}
                        placeholder={`Вариант ${k + 1}`}
                        onChange={(e) => setQuestions((cur) => cur.map((x, j) => (j === i ? { ...x, options: x.options.map((y, m) => (m === k ? e.target.value : y)) } : x)))}
                        className={FIELD}
                        data-testid="course-option"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Отметьте верный ответ кружком. Проходной балл теста — 70%.</p>
              </div>
            ))}
          </div>

          {validationError ? (
            <p id="course-error" role="alert" className="flex items-center gap-1.5 text-[13px]" data-testid="course-error" aria-live="polite">
              <AlertTriangle className="size-4 shrink-0 text-critical" aria-hidden />
              {validationError}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} data-testid="course-cancel">
            Отмена
          </Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="course-save">
            Создать курс
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
