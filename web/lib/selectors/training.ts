import { QUIZ_PASS } from "@/lib/mock-data/reference";
import type { QuizQuestion } from "@/lib/schemas";

/**
 * Чистые функции раздела «Обучение» (этап 3, группа 7) — поведение training()/openQuiz()
 * прототипа: процент прогресса, выбор действия карточки курса, подсчёт результата теста
 * с проходным баллом QUIZ_PASS (0.7) и разбором ошибок.
 */

/** Проценты курса для карточки (Math.round(progress * 100), как в прототипе). */
export function pctOf(progress: number): number {
  return Math.round(progress * 100);
}

/** Действие карточки курса: завершённый — «Сертификат»; с демо-тестом — «Пройти тест»; иначе кнопки нет. */
export function courseAction(progress: number, hasQuiz: boolean): "cert" | "quiz" | null {
  if (progress >= 1) return "cert";
  return hasQuiz ? "quiz" : null;
}

export interface QuizResult {
  ok: number;
  total: number;
  /** Доля верных ответов 0…1. */
  score: number;
  passed: boolean;
  /** Пропущенные вопросы для разбора ошибок (в прототипе — только у провала). */
  missed: QuizQuestion[];
}

/** Результат теста: ok/total, score, passed (score >= QUIZ_PASS с допуском на округление), список ошибок. */
export function quizScore(questions: readonly QuizQuestion[], picks: readonly number[]): QuizResult {
  const total = questions.length;
  let ok = 0;
  const missed: QuizQuestion[] = [];
  questions.forEach((q, k) => {
    if (picks[k] === q.answer) ok++;
    else missed.push(q);
  });
  const score = total === 0 ? 0 : ok / total;
  return { ok, total, score, passed: score >= QUIZ_PASS - 1e-9, missed };
}

/** «Тест пройден: 4 из 5 (80%)» / «Не хватило баллов: 3 из 5 (60%)» — строки результата прототипа. */
export function quizResultTitle(result: QuizResult): string {
  return (result.passed ? "Тест пройден: " : "Не хватило баллов: ") + result.ok + " из " + result.total + " (" + pctOf(result.score) + "%)";
}
