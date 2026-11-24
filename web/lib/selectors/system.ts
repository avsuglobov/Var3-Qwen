/**
 * Чистые функции и константы финальной группы этапа 3 — «Интеграции, Настройки, Помощь»:
 * данные захардкожены в разделах прототипа (sections2.js integrations()/settings()/help()),
 * поэтому портируются как есть, а не через сид data.js.
 */

/* ----------------------------------------------------------- Интеграции */

/** Текст статус-бейджа карточки (status-badge on/off прототипа). */
export function integrationStatusText(connected: boolean): string {
  return connected ? "Подключено" : "Не подключено";
}

/* ----------------------------------------------------------- Настройки */

export interface SettingsTab {
  id: string;
  label: string;
}

/** Вкладки «Настроек» — порядок и подписи tabs[] прототипа (settingsTab по умолчанию «profile»). */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: "profile", label: "Профиль" },
  { id: "company", label: "Компания" },
  { id: "roles", label: "Роли" },
  { id: "channels", label: "Каналы" },
  { id: "notifications", label: "Уведомления" },
  { id: "tariff", label: "Тариф" },
  { id: "data", label: "Данные" }
];

export const DEFAULT_SETTINGS_TAB = "profile";

export interface RoleAccessRow {
  role: string;
  access: string;
}

/** Таблица «Роли и доступ» — фикстура settingsTab("roles") прототипа. */
export const ROLE_ACCESS: readonly RoleAccessRow[] = [
  { role: "Владелец", access: "Полный" },
  { role: "Менеджер", access: "Диалоги, CRM" },
  { role: "Бухгалтерия", access: "Документы" }
];

export interface NotificationToggle {
  key: string;
  def: boolean;
}

/** Переключатели «Уведомлений» — toggleRow() прототипа (состояние в сессии, как AIWS.store.switches). */
export const NOTIFICATION_TOGGLES: readonly NotificationToggle[] = [
  { key: "Новый лид", def: true },
  { key: "Передача менеджеру", def: true },
  { key: "Согласование документа", def: true },
  { key: "Ошибка агента (КРИТИЧНО)", def: false }
];

/** Значения полей «Профиля» и «Компании» — fieldRow() прототипа (статичные демо-значения). */
export const SETTINGS_DEFAULTS = {
  profileName: "ВВ",
  profileEmail: "demo@ai-workspace",
  profileTz: "UTC+3 Москва",
  companyName: "Демо-компания",
  companySite: "demo.site",
  companyAbout: "Демо-описание."
} as const;

/** Сообщение после импорта файла данных — текст тоста importJSON прототипа (db.js). */
export function importFeedback(dropped: number): string {
  return dropped > 0
    ? `Данные импортированы, пропущено некорректных записей: ${dropped}`
    : "Данные импортированы";
}

/* ----------------------------------------------------------- Помощь */

/** Каждая строка переименована по правилу «AI-» вместо «ИИ-» (scripts/ai-naming.mjs, этап 3). */
export const HELP_INITIAL = "Спросите, как настроить AI-сотрудника или подключить канал (демо).";

/** Автор ответов чата обучения (bindChat("helpInput", …, "Помощь", …) прототипа). */
export const HELP_WHO = "Помощь";

/** Ответ поддержки без сценария — fallback bindChat прототипа (scriptedReply отвечает по ключевым словам). */
export const HELP_FALLBACK_REPLY = "Вот краткое руководство по этому вопросу (демо).";
