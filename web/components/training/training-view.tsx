"use client";

import { Download, FileCheck2 } from "lucide-react";
import { useState } from "react";
import { QuizDialog } from "@/components/training/quiz-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useCertificates, useCourses, useQuizzes } from "@/lib/api/hooks";
import { courseAction, pctOf } from "@/lib/selectors/training";
import type { Course } from "@/lib/schemas";

/**
 * Раздел «Обучение» (этап 3, группа 7) — поведение training() прототипа: карточки курсов
 * (прогресс-бар, «N уроков · статус · тест: M вопр.», кнопка «Сертификат» у завершённых
 * и «Пройти тест» у курсов с демо-тестом), список выданных сертификатов с выгрузкой PDF.
 */
export function TrainingView() {
  const coursesQ = useCourses();
  const certificatesQ = useCertificates();
  const quizzesQ = useQuizzes();

  const [quizCourse, setQuizCourse] = useState<Course | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });
  const clearFeedback = (): void => setFeedback({ text: "", kind: "status" });

  const loading = coursesQ.isPending || certificatesQ.isPending || quizzesQ.isPending;
  const error = coursesQ.isError ? coursesQ.error : certificatesQ.isError ? certificatesQ.error : quizzesQ.isError ? quizzesQ.error : null;

  const courses = coursesQ.data ?? [];
  const certificates = certificatesQ.data ?? [];
  const quizzes = quizzesQ.data?.quizzes ?? {};

  const downloadCert = async (rec: { name: string; course: string; date: string }): Promise<void> => {
    clearFeedback();
    try {
      const { generateCertificatePdf } = await import("@/lib/pdf/certificate");
      const filename = await generateCertificatePdf({ name: rec.name, course: rec.course, date: rec.date });
      onFeedback("Сертификат сохранён: " + filename);
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Не удалось сохранить PDF", "alert");
    }
  };

  const courseCertificate = (course: Course): { name: string; course: string; date: string } => {
    const rec = certificates.find((c) => c.course === course.title);
    return { name: rec ? rec.name : "Слушатель (демо)", course: course.title, date: rec ? rec.date : "Демо" };
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка обучения">
        <Header />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header />
        <ErrorState message={error.message} onRetry={() => { void coursesQ.refetch(); void certificatesQ.refetch(); void quizzesQ.refetch(); }} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <Header />

      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="training-feedback">
          {feedback.text}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="training-courses">
        {courses.map((c) => {
          const pct = pctOf(c.progress);
          const quiz = quizzes[c.id];
          const action = courseAction(c.progress, !!quiz);
          return (
            <Card key={c.id}>
              <CardContent>
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 text-sm font-semibold" data-testid="training-course-title">
                    {c.title}
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    Демо
                  </Badge>
                </div>
                <div className="mb-3 text-xs text-muted-foreground">
                  {c.lessons} уроков · {c.status}
                  {quiz ? " · тест: " + quiz.length + " вопр." : ""}
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: pct + "%" }} data-testid="training-progress" data-pct={pct} />
                </div>
                <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
                  <Badge variant="outline" className="font-data text-[11px]">
                    {pct}%
                  </Badge>
                  {action === "cert" ? (
                    <Button variant="secondary" size="sm" onClick={() => void downloadCert(courseCertificate(c))} data-testid="training-cert-btn" data-course={c.id}>
                      <Download className="size-3.5" aria-hidden />
                      Сертификат
                    </Button>
                  ) : action === "quiz" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { clearFeedback(); setQuizCourse(c); }}
                      data-testid="training-quiz-btn"
                      data-course={c.id}
                    >
                      Пройти тест
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="min-w-0" aria-label="Выданные сертификаты">
        <h2 className="section-label mb-2">Выданные сертификаты</h2>
        <Card>
          <CardContent>
            {certificates.length === 0 ? (
              <EmptyState title="Сертификатов пока нет" hint="Пройдите демо-тест курса — сертификат появится здесь." />
            ) : (
              <div className="space-y-2.5" data-testid="training-certs">
                {certificates.map((c) => (
                  <div key={c.id} className="flex min-w-0 flex-wrap items-center gap-2.5 border-b border-border pb-2.5 last:border-b-0 last:pb-0" data-testid="training-cert" data-cert={c.id}>
                    <span className="inline-flex items-center gap-1.5 rounded-chip border border-border px-2.5 py-1 text-[13px]">
                      <FileCheck2 className="size-3.5 text-muted-foreground" aria-hidden />
                      {c.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.course}</span>
                    <span className="ml-auto" />
                    <Badge variant="outline" className="text-[11px]">
                      {c.date}
                    </Badge>
                    <Button variant="secondary" size="sm" onClick={() => void downloadCert(c)} data-testid="training-cert-pdf" data-cert={c.id}>
                      PDF
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {quizCourse && quizzes[quizCourse.id] ? (
        <QuizDialog
          course={{ id: quizCourse.id, title: quizCourse.title }}
          questions={quizzes[quizCourse.id]}
          pass={quizzesQ.data?.pass ?? 0.7}
          onOpenChange={(next) => { if (!next) setQuizCourse(null); }}
        />
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Обучение</h1>
      <p className="mt-1 text-sm text-muted-foreground">Программы из материалов хранилища, тесты, сертификаты</p>
    </header>
  );
}
