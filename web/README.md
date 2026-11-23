# AI Workspace — Next.js (этапы 1–2: каркас, данные и «Обзор»)

Новое приложение строится рядом со статическим прототипом (`../download`), который служит живой спецификацией (вариант C из `../MIGRATION.md`).
Этап 1 — каркас (темы и токены, шрифты, layout, ⌘K, переключатель темы). Этап 2 — Zod-схемы, слой данных `lib/api`, TanStack Query и раздел «Обзор» (KPI, график, онбординг, журнал смены). Остальные разделы пока заглушки с указанием этапа.

## Запуск

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

## Проверки

| Команда | Что проверяет |
|---|---|
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm test` | Vitest (66 тестов): токены обеих тем по спецификации, контраст токенов AA, навигация, часы UTC, конфиг, шрифты, Zustand-стор; **схемы ↔ демо-данные прототипа, граничные случаи валидации, адаптер данных (повреждённое хранилище, CRUD, экспорт/импорт, сбой), селекторы «Обзора»** |
| `npm run check:colors` | запрет хардкод-цветов (hex, rgb(), палитра Tailwind) вне блоков токенов |
| `npm run e2e:overview` | Playwright, «Обзор»: loading / empty / error / success, KPI 6·4·4·2, график, онбординг (мышь, клавиатура, сохранение), журнал, повреждённое хранилище, «Обновить», overflow 375…1920, контраст, консоль |
| `npm run e2e` (`e2e:shell` + `e2e:overview`) | Playwright на `next start`; каркас: overflow 1280/1440/1920 × 2 темы × 16 разделов, hydration/консоль, мигание темы, токены и радиусы, шрифты с кириллицей, ⌘K, сворачиваемый сайдбар (кука), мобильный drawer, зерно и reduced-motion, фокус-кольцо, контраст WCAG AA |
| `npm run check` | typecheck + lint + test + check:colors |

Для `e2e` нужен Chromium (`npx playwright install chromium`). Переменные: `BASE_URL` (использовать свой сервер), `PORT`, `CHROMIUM_PATH`, `CHROMIUM_ARGS`, `PLAYWRIGHT_MODULE`.

## Структура

```
app/                 маршруты и layouts; (app)/ — группа с каркасом; fonts/ — woff2 (OFL)
components/ui        shadcn-стиль (Radix): button, badge, dialog, sheet, command, dropdown-menu
components/layout    app-shell, sidebar-nav, topbar, command-palette, utc-clock, grain, brand
components/theme     ThemeProvider (next-themes), ThemeToggle
lib/                 config.ts, nav.ts, fonts.ts, i18n/ru.ts, stores/ui-store.tsx, types.ts
lib/schemas          Zod-схемы (источник истины для типов и валидации)
lib/api              интерфейсы Api/Repository, адаптер localStorage, хуки TanStack Query
lib/selectors        чистые функции (KPI, журнал, прогресс онбординга)
lib/mock-data        seed.ts и reference.ts — генерируются из ../download/data.js (npm run gen:seed)
styles/globals.css   токены :root («Тёплая редакция») и .dark («Fincher Monitor»), привязка к Tailwind
e2e/, scripts/, tests/
```

## Решения, которые стоит знать

- **Токены.** Все цвета, шрифты, радиусы, тени и анимации — CSS-переменные в `styles/globals.css`. Дефолтная палитра Tailwind отключена (`--color-*: initial`), поэтому `bg-white` или `text-gray-500` просто не существуют; `check:colors` дополнительно ловит hex и `rgb()`.
- **Шрифты и кириллица.** У Fraunces нет кириллицы, поэтому в светлой теме русские заголовки набираются Source Serif 4, а латиница (название продукта) — Fraunces. Остальные семейства (Geist, Geist Mono, Inter, JetBrains Mono) имеют кириллицу. Файлы лежат в репозитории (`app/fonts`), подключены через `next/font/local` двумя подмножествами на семейство (latin и cyrillic с `unicode-range`): сборка и работа не зависят от сети.
- **Тема без мигания.** `next-themes` (класс `dark`, по умолчанию system) вставляет скрипт в `<head>`; иконка переключателя выбирается CSS-классом, а не состоянием, поэтому нет hydration-расхождений. Часы UTC показывают заглушку до монтирования.
- **Сайдбар.** Состояние свёрнутости хранится в куке `aiws-sidebar` и читается на сервере: разметка сразу правильная, без «прыжка». Zustand-стор создаётся провайдером на каждый запрос.
- **Тёмная тема.** Вторичный текст на приподнятых поверхностях использует токен `--muted-foreground-strong` (5,2:1 вместо 4,25:1); `critical` не применяется как цвет мелкого текста.
- **Данные.** Zod-схемы переносят правила валидаторов прототипа (id `[A-Za-z0-9_-]{1,40}`, допустимые значения, границы); типы выводятся из схем. Формат снимка хранилища и ключ (`aiws-db-v2`, `version: 1`) совпадают с прототипом: экспорт/импорт JSON работает между версиями. Битые записи отбрасываются, непригодная коллекция заменяется демо-данными, недоступный `localStorage` → работа в памяти.
- **Слой API.** Весь код зависит от интерфейса `Api` (`getApi()` в `lib/api/index.ts`); замена на REST/MSW — подмена адаптера. Имитация сети: `NEXT_PUBLIC_MOCK_LATENCY_MS` (по умолчанию 250 мс), для проверок — `localStorage["aiws-mock-latency"]` и `localStorage["aiws-mock-fail"]="1"` (имитация сбоя).
- **Сид из прототипа.** `lib/mock-data/seed.ts` генерируется `npm run gen:seed`; тест `schemas.test.ts` падает, если прототип изменился, а сид нет.
- **График.** Recharts грузится отдельным чанком (`next/dynamic`): первая загрузка «Обзора» 159 КБ вместо 272 КБ. Цвета — токены (`var(--primary)`), для скринридеров рядом лежит таблица-дублёр.

## Требования и известные предупреждения

- **Node.js ≥ 22.12** (поле `engines`; `vitest` 5 и `vite` 8 не работают на более старых).
- **Зависимости:** `npm audit` — 0 уязвимостей (боевые и dev). Боевая находка по вложенному `postcss` закрыта переопределением (`overrides`) на исправленную версию; остальное обновлено `npm audit fix`.
- **ESLint 9.x** помечен npm как «no longer supported»: `eslint-config-next@15` поддерживает только ESLint 9, переход на ESLint 10 возможен вместе с Next 16 (отдельное решение, не в рамках этапа 3).
- **«install-scripts … not yet covered by allowScripts»** (npm ≥ 11): это уведомление о скриптах установки optional-пакетов (`fsevents` для macOS); приложение и проверки работают и без их запуска.
- **macOS и e2e:** `Control+A` в поле ввода на macOS — «в начало строки», поэтому тесты заменяют текст через `fill()`; палитра открывается и по `⌘K`, и по `Ctrl+K` (проверяются оба).
- **Несколько lockfile:** `next.config.ts` задаёт `outputFileTracingRoot`, поэтому лежащий рядом `package-lock.json` прототипа больше не путает Next.
