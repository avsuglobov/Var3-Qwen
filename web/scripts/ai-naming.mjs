/* ai-naming.mjs — единое правило переименования, введённое на этапе 3: названия сотрудников
   с приставкой «ИИ-» пишутся «AI-» (ИИ-РОП → AI-РОП, ИИ-сотрудник → AI-сотрудник).
   Модуль общий для генератора сида (gen-seed.mjs) и теста синхронности (tests/schemas.test.ts),
   поэтому подстановка везде одна и не расходится. */

export const AI_NAMING_FROM = "ИИ-";
export const AI_NAMING_TO = "AI-";

/** Глубокая замена «ИИ-» → «AI-» во всех строках значения произвольной формы. Вход не мутирует. */
export function applyAINaming(value) {
  if (typeof value === "string") return value.includes(AI_NAMING_FROM) ? value.replaceAll(AI_NAMING_FROM, AI_NAMING_TO) : value;
  if (Array.isArray(value)) return value.map(applyAINaming);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyAINaming(v)]));
  }
  return value;
}
