import { QUIZ_PASS } from "@/lib/mock-data/reference";
import { quizQuestionSchema, type Course, type QuizQuestion } from "@/lib/schemas";

/**
 * Чистые функции раздела «Обучение» (этап 3, группа 7) — поведение training()/openQuiz()
 * прототипа: процент прогресса, выбор действия карточки курса, подсчёт результата теста
 * с проходным баллом QUIZ_PASS (0.7) и разбором ошибок. Этап 6 добавил создание курсов.
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

/* ---------------------------------------------------------------- создание курсов (этап 6) */

export interface NewCourseInput {
  title: string;
  /** Названия уроков; пустые строки отбрасываются. */
  lessonTitles: string[];
  /** Вопросы теста (могут отсутствовать); каждый проверяется quizQuestionSchema. */
  questions: QuizQuestion[];
}

/** Следующий id созданного курса: max «cr-N» + 1 (демо-сид использует «crs-N», конфликтов нет). */
export function nextCourseId(courses: readonly Course[]): string {
  let max = 0;
  for (const c of courses) {
    const m = /^cr-(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `cr-${max + 1}`;
}

/**
 * Новый курс пользователя: прогресс 0, «Не начат», demo:false; пустое название и уроки без названий
 * отклоняются, вопрос теста проверяется схемой (строка ошибки возвращается вместо курса).
 * Вход не мутируется.
 */
export function buildCourse(input: NewCourseInput, courses: readonly Course[]): Course | { error: string } {
  const title = input.title.trim();
  if (!title) return { error: "Введите название курса" };
  const lessonTitles = input.lessonTitles.map((l) => l.trim()).filter(Boolean);
  if (lessonTitles.length === 0) return { error: "Добавьте хотя бы один урок" };
  for (const q of input.questions) {
    if (!quizQuestionSchema.safeParse(q).success) return { error: "В вопросе теста: заполните текст, минимум два варианта и верный ответ" };
  }
  return {
    id: nextCourseId(courses),
    title,
    lessons: lessonTitles.length,
    progress: 0,
    status: "Не начат",
    lessonTitles,
    ...(input.questions.length ? { questions: input.questions } : {}),
    demo: false
  };
}

/* ------------------------------------------------------- тест из материала хранилища (этап 7) */

/**
 * Вопросы теста, собранные из тезисов материала механически, без выдуманного содержания:
 * в каждом вопросе 4 утверждения из материала, верное — своё; порядок вариантов
 * детерминированно сдвигается от вопроса к вопросу (ответ не всегда на одном месте).
 */
export function materialQuiz(sourceName: string, statements: readonly string[]): QuizQuestion[] {
  const q = `Какое утверждение соответствует материалу «${sourceName}»?`;
  const n = statements.length;
  return statements.map((_, i) => {
    const offset = i % 4;
    const options = Array.from({ length: 4 }, (_, k) => statements[(i + ((k + offset) % 4)) % n]);
    return { q, options, answer: (4 - offset) % 4 };
  });
}

export interface MaterialTestInput {
  /** Источник знаний из «Хранилища» (ks-N). */
  sourceId: string;
  /** Название источника — до 240 знаков, чтобы уместиться в название курса. */
  sourceName: string;
  /** Тезисы материала: по одному на строку. */
  statements: string[];
}

/** Курс с тестом, собранным из тезисов материала хранилища; ошибка — строка с причиной. */
export function buildTestCourse(input: MaterialTestInput, courses: readonly Course[]): Course | { error: string } {
  const name = input.sourceName.trim();
  if (!name) return { error: "Укажите название источника" };
  if (name.length > 240) return { error: "Название источника длиннее 240 знаков — не поместится в название курса" };
  const seen = new Set<string>();
  const statements: string[] = [];
  for (const raw of input.statements) {
    const s = raw.trim();
    if (!s || seen.has(s)) continue;
    if (s.length > 300) return { error: "Один из тезисов длиннее 300 символов — сократите его" };
    seen.add(s);
    statements.push(s);
  }
  if (statements.length < 4) return { error: "Нужно минимум 4 уникальных тезиса — по одному на строку" };
  const questions = materialQuiz(name, statements);
  for (const qq of questions) {
    if (!quizQuestionSchema.safeParse(qq).success) return { error: "Тезисы не помещаются в вопрос теста — сократите их" };
  }
  return {
    id: nextCourseId(courses),
    title: `Тест по материалу: ${name}`,
    lessons: 1,
    progress: 0,
    status: "Не начат",
    lessonTitles: [`Материал: ${name}`],
    questions,
    demo: false,
    sourceId: input.sourceId
  };
}
