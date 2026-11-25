import { describe, expect, it } from "vitest";
import { QUIZ_PASS, QUIZZES } from "@/lib/mock-data/reference";
import { buildCourse, buildTestCourse, courseAction, materialQuiz, nextCourseId, pctOf, quizResultTitle, quizScore } from "@/lib/selectors/training";
import type { Course } from "@/lib/schemas";

/* Селекторы «Обучения» — инварианты теста прототипа (scripts/regress_learn.js):
   у каждого курса есть вопросы (4 варианта, верный в диапазоне), порог 70%,
   границы 60% / 75% / 80%, результат и разбор ошибок. */

describe("обучение: сиды тестов (regress_learn)", () => {
  it("проходной балл 0.7; у каждого курса с квизом вопросы ≥4, 4 варианта, верный ответ в диапазоне", () => {
    expect(QUIZ_PASS).toBe(0.7);
    for (const id of ["crs-1", "crs-2"]) {
      const qs = QUIZZES[id];
      expect(qs.length).toBeGreaterThanOrEqual(4);
      expect(qs.every((q) => q.options.length === 4 && q.answer >= 0 && q.answer < 4)).toBe(true);
    }
    expect(QUIZZES["crs-3"].length).toBeGreaterThanOrEqual(4);
  });
});

describe("обучение: карточки курсов", () => {
  it("pctOf: 0.5 → 50, 0 → 0, 1 → 100", () => {
    expect(pctOf(0.5)).toBe(50);
    expect(pctOf(0)).toBe(0);
    expect(pctOf(1)).toBe(100);
  });
  it("courseAction: завершённый → «Сертификат», с квизом → «Пройти тест», без квиза → нет кнопки", () => {
    expect(courseAction(1, true)).toBe("cert");
    expect(courseAction(0.5, true)).toBe("quiz");
    expect(courseAction(0, false)).toBeNull();
  });
});

describe("обучение: подсчёт результата теста", () => {
  const qs = QUIZZES["crs-1"]; // 5 вопросов
  const correct = qs.map((q) => q.answer);
  const three = [correct[0], correct[1], correct[2], (correct[3] + 1) % 4, (correct[4] + 1) % 4];   // 60%
  const four = [correct[0], correct[1], correct[2], correct[3], (correct[4] + 1) % 4];              // 80%

  it("все верные → пройдено, без ошибок", () => {
    const r = quizScore(qs, correct);
    expect(r).toMatchObject({ ok: 5, total: 5, score: 1, passed: true });
    expect(r.missed).toEqual([]);
  });
  it("граница 60% (3 из 5) — не пройдено, разбор содержит верные ответы", () => {
    const r = quizScore(qs, three);
    expect(r.passed).toBe(false);
    expect(quizResultTitle(r)).toBe("Не хватило баллов: 3 из 5 (60%)");
    expect(r.missed.length).toBe(2);
    expect(r.missed[0].options[r.missed[0].answer]).toBeTruthy();
  });
  it("граница 80% (4 из 5) — пройдено", () => {
    const r = quizScore(qs, four);
    expect(r.passed).toBe(true);
    expect(quizResultTitle(r)).toBe("Тест пройден: 4 из 5 (80%)");
    expect(r.missed.length).toBe(1);
  });
  it("порог ровно 70% (7 из 10) — пройдено (допуск на округление, как в прототипе)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => (i < 7 ? 0 : 1));
    const questions = Array.from({ length: 10 }, (_, i) => ({ q: "в" + i, options: ["верно", "неверно"], answer: 0 }));
    expect(quizScore(questions, ten).passed).toBe(true);
    expect(quizScore(questions, ten.slice(0, 7).concat([1, 1, 1])).passed).toBe(true);
    expect(quizScore(questions, [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]).passed).toBe(false);
  });
  it("свой ответ вне диапазона считается ошибкой", () => {
    const r = quizScore(qs, [-1, -1, -1, -1, -1]);
    expect(r.ok).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe("создание курсов (этап 6)", () => {
  const courses: Course[] = [
    { id: "crs-1", title: "Демо", lessons: 3, progress: 0, status: "Не начат" },
    { id: "cr-1", title: "Мой курс", lessons: 2, progress: 0, status: "Не начат" },
    { id: "cr-7", title: "Ещё курс", lessons: 1, progress: 0, status: "Не начат" }
  ];
  it("nextCourseId: считает только созданные cr-N; сид crs-N не мешает", () => {
    expect(nextCourseId(courses)).toBe("cr-8");
    expect(nextCourseId([])).toBe("cr-1");
  });
  it("buildCourse: пустое название и уроки без названий отклоняются", () => {
    expect(buildCourse({ title: "  ", lessonTitles: ["Урок"], questions: [] }, courses)).toEqual({ error: "Введите название курса" });
    expect(buildCourse({ title: "Курс", lessonTitles: ["  ", ""], questions: [] }, courses)).toEqual({ error: "Добавьте хотя бы один урок" });
  });
  it("buildCourse: битый вопрос теста отклоняется (схема quizQuestionSchema)", () => {
    const bad = [{ q: "Вопрос?", options: ["Только один вариант"], answer: 0 }];
    expect(buildCourse({ title: "Курс", lessonTitles: ["Урок 1"], questions: bad }, courses)).toEqual({ error: expect.stringContaining("вопросе теста") });
  });
  it("buildCourse: cr-8, прогресс 0, «Не начат», demo:false, названия уроков и тест сохраняются", () => {
    const q = { q: "Где посмотреть инструкцию?", options: ["В карточке сотрудника", "В чате", "Нигде", "В календаре"], answer: 0 };
    const c = buildCourse({ title: " Мой курс ", lessonTitles: ["Урок 1", " Урок 2 ", ""], questions: [q] }, courses);
    expect("error" in c).toBe(false);
    if ("error" in c) return;
    expect(c.id).toBe("cr-8");
    expect(c.title).toBe("Мой курс");
    expect(c.lessons).toBe(2);
    expect(c.progress).toBe(0);
    expect(c.status).toBe("Не начат");
    expect(c.lessonTitles).toEqual(["Урок 1", "Урок 2"]);
    expect(c.questions).toEqual([q]);
    expect(c.demo).toBe(false);
  });
  it("buildCourse: курс без теста не содержит поле questions", () => {
    const c = buildCourse({ title: "Курс", lessonTitles: ["Урок"], questions: [] }, courses);
    expect("error" in c).toBe(false);
    if ("error" in c) return;
    expect(c.questions).toBeUndefined();
    expect(c.demo).toBe(false);
  });
  it("курс пользователя с тестом доступен для «Пройти тест» (courseAction)", () => {
    expect(courseAction(0, true)).toBe("quiz");
  });
});

describe("тест из материала хранилища (этап 7)", () => {
  const st = [
    "Продукт поставляется в трёх комплектациях",
    "Возврат оформляется в течение 14 дней",
    "Скидка предоставляется от объёма свыше 100 шт.",
    "Гарантия на комплектующие — 24 месяца"
  ];
  const courses: Course[] = [{ id: "crs-1", title: "Демо", lessons: 3, progress: 0, status: "Не начат" }];
  it("materialQuiz: 4 вопроса, в каждом все тезисы вариантами, верные ответы смещаются 0,3,2,1", () => {
    const qs = materialQuiz("Материал.pdf", st);
    expect(qs.length).toBe(4);
    expect(qs.map((q) => q.answer).join(",")).toBe("0,3,2,1");
    expect(qs.every((q) => q.q === "Какое утверждение соответствует материалу «Материал.pdf»?")).toBe(true);
    for (let i = 0; i < 4; i++) {
      expect(qs[i].options).toHaveLength(4);
      expect(qs[i].options[qs[i].answer]).toBe(st[i]);
      expect(new Set(qs[i].options).size).toBe(4);
    }
  });
  it("materialQuiz: детерминирован и работает при n > 4 (каждый вопрос — окно из 4 тезисов)", () => {
    const five = [...st, "Доставка по России — от 2 дней"];
    const qs = materialQuiz("М", five);
    expect(qs.length).toBe(5);
    qs.forEach((q, i) => expect(q.options[q.answer]).toBe(five[i]));
    expect(JSON.stringify(materialQuiz("М", five))).toBe(JSON.stringify(qs));
  });
  it("buildTestCourse: ошибки — нет названия, длинное название, мало тезисов, длинный тезис", () => {
    expect(buildTestCourse({ sourceId: "ks-1", sourceName: "  ", statements: st }, courses)).toEqual({ error: "Укажите название источника" });
    expect(buildTestCourse({ sourceId: "ks-1", sourceName: "x".repeat(241), statements: st }, courses)).toEqual({ error: expect.stringContaining("240 знаков") });
    expect(buildTestCourse({ sourceId: "ks-1", sourceName: "Источник", statements: st.slice(0, 3) }, courses)).toEqual({ error: expect.stringContaining("минимум 4") });
    expect(buildTestCourse({ sourceId: "ks-1", sourceName: "Источник", statements: [...st, "y".repeat(301)] }, courses)).toEqual({ error: expect.stringContaining("300 символов") });
  });
  it("buildTestCourse: курс cr-2 с вопросами из тезисов, demo:false, sourceId; дубликаты тезисов убираются", () => {
    const c = buildTestCourse({ sourceId: "ks-1", sourceName: " Демо-описание продукта.pdf ", statements: [...st, st[0], " "] }, courses);
    expect("error" in c).toBe(false);
    if ("error" in c) return;
    expect(c.id).toBe("cr-1");
    expect(c.title).toBe("Тест по материалу: Демо-описание продукта.pdf");
    expect(c.lessons).toBe(1);
    expect(c.lessonTitles).toEqual(["Материал: Демо-описание продукта.pdf"]);
    expect(c.questions?.length).toBe(4);
    expect(c.questions?.map((q) => q.answer).join(",")).toBe("0,3,2,1");
    expect(c.demo).toBe(false);
    expect(c.sourceId).toBe("ks-1");
    expect(c.status).toBe("Не начат");
  });
});
