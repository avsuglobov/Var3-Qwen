/* gen-seed.mjs — генерирует lib/mock-data/seed.ts из демо-данных прототипа (../download/data.js).
   Так фикстуры Next.js-версии совпадают с эталоном, а расхождение ловят тесты (схемы ↔ сид).
   С этапа 3 применяется переименование названий сотрудников «ИИ-» → «AI-» (scripts/ai-naming.mjs, общее с тестом синхронности).
   Запуск: node scripts/gen-seed.mjs */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { applyAINaming } from "./ai-naming.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "..", "download", "data.js"), "utf8");
const win = { AIWS: { config: { APP_NAME: "AI Workspace", APP_TAGLINE: "x", APP_TAGLINE_SHORT: "x" } } };
win.window = win;
vm.runInNewContext(src, win);
const D = win.AIWS.data;

const PERSISTED = ["LEADS", "CONVERSATIONS", "DOCUMENTS", "ONBOARDING", "TASKS", "CALENDAR_EVENTS", "NOTIFICATIONS", "AGENTS", "COURSES", "CERTIFICATES", "COMPANY_PROFILE"];
const REFERENCE = ["CHANNELS", "STAGES", "FUNNELS", "ACTIVITY", "QUIZZES", "KNOWLEDGE_SOURCES", "CHAIN_TEMPLATES", "SUPPLY_REQUESTS", "SUPPLY_OFFERS", "INTEGRATIONS"];
// «Описание компании» в прототипе — статичные поля формы (sections2.js storage()); в приложении редактируется, поэтому вынесено в коллекцию
const COMPANY_PROFILE = { name: "Демо-компания", about: "Демо-описание деятельности для контекста AI-сотрудников.", audience: "Демо: целевая аудитория и ключевые предложения." };
const json = (v) => JSON.stringify(applyAINaming(v), null, 2);
const pick = (keys) => Object.fromEntries(keys.map((k) => [k, D[k]]));
const persisted = Object.assign(pick(PERSISTED), { COMPANY_PROFILE });

fs.writeFileSync(path.join(ROOT, "lib/mock-data/seed.ts"),
`/* Сгенерировано scripts/gen-seed.mjs из ../download/data.js — не править вручную. Все записи помечены в интерфейсе как «Демо».
   Названия сотрудников — с приставкой «AI-» вместо «ИИ-» (правило scripts/ai-naming.mjs, этап 3). */
import type { DbSnapshot } from "@/lib/schemas";

export const SEED_DATA: DbSnapshot = ${json(persisted)};
`);
fs.writeFileSync(path.join(ROOT, "lib/mock-data/reference.ts"),
`/* Сгенерировано scripts/gen-seed.mjs из ../download/data.js — справочники (не меняются пользователем). */
import type { ActivityPoint, ChainTemplate, Channel, Funnel, Integration, KnowledgeSource, Stage, SupplyOffer, SupplyRequest, QuizQuestion } from "@/lib/schemas";

export const CHANNELS: Record<string, Channel> = ${json(D.CHANNELS)};
export const STAGES: Stage[] = ${json(D.STAGES)};
export const FUNNELS: Funnel[] = ${json(D.FUNNELS)};
export const ACTIVITY: ActivityPoint[] = ${json(D.ACTIVITY)};
export const QUIZZES: Record<string, QuizQuestion[]> = ${json(D.QUIZZES)};
export const QUIZ_PASS: number = ${D.QUIZ_PASS};
export const KNOWLEDGE_SOURCES: KnowledgeSource[] = ${json(D.KNOWLEDGE_SOURCES)};
export const CHAIN_TEMPLATES: ChainTemplate[] = ${json(D.CHAIN_TEMPLATES)};
export const SUPPLY_REQUESTS: SupplyRequest[] = ${json(D.SUPPLY_REQUESTS)};
export const SUPPLY_OFFERS: SupplyOffer[] = ${json(D.SUPPLY_OFFERS)};
export const INTEGRATIONS: Integration[] = ${json(D.INTEGRATIONS)};
`);
console.log("collections:", PERSISTED.map((k) => `${k}=${Array.isArray(D[k]) ? D[k].length : 1}`).join(" "), "| reference:", REFERENCE.map((k) => `${k}=${Array.isArray(D[k]) ? D[k].length : Object.keys(D[k]).length}`).join(" "));
console.log("sample CHANNELS:", JSON.stringify(D.CHANNELS).slice(0, 160));
console.log("sample STAGE:", JSON.stringify(D.STAGES[0]), "FUNNEL:", JSON.stringify(D.FUNNELS[0]).slice(0, 140), "ACT:", JSON.stringify(D.ACTIVITY[0]));
console.log("ONBOARDING:", JSON.stringify(D.ONBOARDING[0]), "NOTIF:", JSON.stringify(D.NOTIFICATIONS[0]));
console.log("LEAD keys:", Object.keys(D.LEADS[0]).join(","), "| CONV keys:", Object.keys(D.CONVERSATIONS[0]).join(","));
console.log("TASK keys:", Object.keys(D.TASKS[0]).join(","), "| EVENT keys:", Object.keys(D.CALENDAR_EVENTS[0]).join(","), "| DOC keys:", Object.keys(D.DOCUMENTS[0]).join(","));
