"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCompleteCourse } from "@/lib/api/hooks";
import { pctOf, quizResultTitle, quizScore } from "@/lib/selectors/training";
import { cn } from "@/lib/utils";
import type { Certificate, QuizQuestion } from "@/lib/schemas";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Демо-тест курса (этап 3, группа 7) — порт openQuiz() прототипа: имя для сертификата →
 * вопросы по одному (radio, «Далее» активна после выбора, последний — «Завершить») →
 * результат: порог QUIZ_PASS (70%), успех — сертификат + PDF, провал — разбор ошибок
 * и «Попробовать снова». Успешное завершение обновляет фон (курс «Завершён»).
 */
export function QuizDialog({ course, questions, pass, onOpenChange }: {
  course: { id: string; title: string };
  questions: readonly QuizQuestion[];
  pass: number;
  onOpenChange: (next: boolean) => void;
}) {
  const complete = useCompleteCourse();
  const [stage, setStage] = useState<"intro" | "question" | "result">("intro");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const result = useMemo(() => (stage === "result" ? quizScore(questions, picks) : null), [stage, questions, picks]);
  const last = index === questions.length - 1;

  const start = (): void => {
    const v = name.trim();
    if (!v) {
      setError("Введите имя для сертификата");
      return;
    }
    setError(null);
    setIndex(0);
    setPicks([]);
    setCurrent(null);
    setStage("question");
  };

  const next = (): void => {
    if (current == null) return;
    const all = [...picks, current];
    setPicks(all);
    setCurrent(null);
    if (last) {
      const r = quizScore(questions, all);
      if (r.passed) {
        setSaving(true);
        complete.mutate(
          { courseId: course.id, name: name.trim(), score: r.score },
          {
            onSuccess: (c) => { setCert(c); setStage("result"); setSaving(false); },
            onError: (e) => { setError(e.message); setStage("intro"); setSaving(false); }
          }
        );
      } else {
        setStage("result");
      }
    } else {
      setIndex(index + 1);
    }
  };

  const retry = (): void => {
    setIndex(0);
    setPicks([]);
    setCurrent(null);
    setStage("question");
  };

  const download = async (): Promise<void> => {
    if (!cert) return;
    try {
      const { generateCertificatePdf } = await import("@/lib/pdf/certificate");
      const filename = await generateCertificatePdf({ name: cert.name, course: cert.course, date: cert.date });
      setFeedback("Сертификат сохранён: " + filename);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Не удалось сохранить PDF");
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!saving && !complete.isPending) onOpenChange(next); }}>
      <DialogContent data-testid="quiz-dialog">
        <DialogTitle className="pr-8 text-[15px] font-medium">Тест · {course.title}</DialogTitle>
        <DialogDescription className="sr-only">Тест по материалам курса</DialogDescription>

        {stage === "intro" ? (
          <div className="space-y-4" data-testid="quiz-intro">
            <p className="text-[13px] text-muted-foreground">
              Вопросов: {questions.length} · проходной балл: {pctOf(pass)}%. Тест по материалам курса.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="quizName" className="text-[13px] font-medium text-muted-foreground">
                Имя для сертификата
              </label>
              <input
                id="quizName"
                value={name}
                maxLength={80}
                autoComplete="name"
                placeholder="Например: Анна Смирнова"
                onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); start(); } }}
                className={FIELD}
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "quiz-error" : undefined}
                data-testid="quiz-name"
              />
            </div>
            {error ? (
              <p role="alert" aria-live="polite" className="text-[13px] text-destructive" id="quiz-error" data-testid="quiz-error">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="quiz-cancel">
                Отмена
              </Button>
              <Button onClick={start} data-testid="quiz-start">
                Начать тест
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "question" && questions[index] ? (
          <div className="space-y-4" data-testid="quiz-question">
            <p className="text-xs text-muted-foreground" role="status">
              Вопрос {index + 1} из {questions.length}
            </p>
            <fieldset className="border-0 p-0">
              <legend className="mb-3 text-sm font-medium">{questions[index].q}</legend>
              <div className="space-y-2">
                {questions[index].options.map((o, k) => (
                  <label
                    key={k}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-chip border px-3 py-2.5 text-sm",
                      current === k ? "border-primary bg-accent-soft" : "border-border hover:border-primary"
                    )}
                  >
                    <input
                      type="radio"
                      name="qa"
                      value={k}
                      checked={current === k}
                      onChange={() => setCurrent(k)}
                      className="accent-primary"
                      data-testid="quiz-option"
                    />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={next} disabled={current == null} data-testid="quiz-next">
                {last ? "Завершить" : "Далее"}
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "result" && result ? (
          <div className="space-y-4" data-testid="quiz-result">
            {result.passed ? (
              <>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-7 shrink-0 text-status" aria-hidden />
                  <div>
                    <div className="text-sm font-medium">{quizResultTitle(result)}</div>
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      Сертификат выдан на имя «{cert?.name ?? name.trim()}». Он добавлен в список выданных.
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="quiz-close">
                    Закрыть
                  </Button>
                  <Button onClick={() => void download()} disabled={!cert} data-testid="quiz-pdf">
                    Скачать сертификат (PDF)
                  </Button>
                </div>
                {feedback ? (
                  <p role="status" aria-live="polite" className="text-[13px]" data-testid="quiz-feedback">
                    {feedback}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-7 shrink-0 text-critical" aria-hidden />
                  <div>
                    <div className="text-sm font-medium">{quizResultTitle(result)}</div>
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      Нужно не меньше {pctOf(pass)}%. Разберите ошибки и попробуйте снова.
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {result.missed.map((q, k) => (
                    <div key={k} className="rounded-chip border border-border p-2.5 text-[13px]" data-testid="quiz-missed">
                      <b>{q.q}</b>
                      <div className="mt-0.5 text-muted-foreground">Верный ответ: {q.options[q.answer]}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="quiz-close">
                    Закрыть
                  </Button>
                  <Button onClick={retry} data-testid="quiz-retry">
                    Попробовать снова
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
