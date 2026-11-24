import { describe, expect, it } from "vitest";
import { QUIZ_PASS, QUIZZES } from "@/lib/mock-data/reference";
import { courseAction, pctOf, quizResultTitle, quizScore } from "@/lib/selectors/training";

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
