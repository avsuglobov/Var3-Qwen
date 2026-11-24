/** Словарь интерфейса (русский). Все строки — здесь, чтобы позже добавить другие локали. */
export const ru = {
  skipToContent: "Перейти к содержимому",
  search: { placeholder: "Поиск по разделам, сотрудникам, лидам…", dialogTitle: "Командная палитра", empty: "Ничего не найдено", groupSections: "Разделы", groupActions: "Действия" },
  topbar: {
    openMenu: "Открыть меню",
    collapse: "Свернуть меню",
    expand: "Развернуть меню",
    agents: "агентов",
    agentsOnline: "в сети",
    trial: "Пробный период",
    trialDays: "дн.",
    notifications: "Уведомления",
    demoUser: "Демо-пользователь",
    demoMonogram: "ДМ",
    loading: "—"
  },
  theme: { label: "Тема оформления", light: "Светлая", dark: "Тёмная", system: "Системная", toggle: "Переключить тему" },
  nav: { label: "Основная навигация", drawerTitle: "Меню" },
  placeholder: { soon: "Раздел появится на этапе", reference: "Эталон поведения: демо-прототип, раздел", demo: "Демо" }
} as const;

export type Dictionary = typeof ru;
