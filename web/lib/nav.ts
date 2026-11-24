import {
  BarChart3,
  Bot,
  Calendar,
  CheckSquare,
  Columns3,
  Database,
  FileText,
  GitBranch,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  MessagesSquare,
  Plug,
  Settings,
  Truck,
  Users,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  /** Сегмент маршрута: /<id>. */
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Этап плана (MIGRATION.md), на котором раздел получит полную реализацию. */
  stage: number;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Основное",
    items: [
      { id: "overview", label: "Обзор", description: "Сводка по работе AI-сотрудников и текущая активность", icon: LayoutDashboard, stage: 2 },
      { id: "agents", label: "AI-сотрудники", description: "Команда AI-сотрудников, мастер создания и тест-чат", icon: Bot, stage: 3 },
      { id: "dialogs", label: "Диалоги", description: "Единый inbox: переписка, режим «Человек + ИИ», контекст клиента", icon: MessagesSquare, stage: 3 },
      { id: "crm", label: "CRM", description: "Воронки сделок и работа с лидами: журнал, канбан, таблица", icon: Columns3, stage: 3 }
    ]
  },
  {
    label: "Клиенты",
    items: [
      { id: "leads", label: "Лиды и автокасания", description: "Импорт базы и сценарий реактивации", icon: Users, stage: 6 },
      { id: "docs", label: "Документы и согласование", description: "Счета, КП и акты: шаблоны, очередь согласования, PDF", icon: FileText, stage: 6 }
    ]
  },
  {
    label: "Работа",
    items: [
      { id: "calendar", label: "Календарь", description: "События и экспорт в iCalendar", icon: Calendar, stage: 7 },
      { id: "tasks", label: "Задачи", description: "Список и доска задач", icon: CheckSquare, stage: 7 }
    ]
  },
  {
    label: "Знания и автоматизация",
    items: [
      { id: "storage", label: "Хранилище и база знаний", description: "Описание компании и источники знаний", icon: Database, stage: 6 },
      { id: "team", label: "Команда", description: "Цепочки AI-сотрудников", icon: GitBranch, stage: 7 },
      { id: "supply", label: "Снабжение", description: "Запросы поставщикам и сводная таблица условий", icon: Truck, stage: 7 },
      { id: "training", label: "Обучение", description: "Программы, тесты и сертификаты", icon: GraduationCap, stage: 7 },
      { id: "analytics", label: "Аналитика", description: "Разбор диалогов менеджеров и качество цепочки", icon: BarChart3, stage: 7 }
    ]
  },
  {
    label: "Система",
    items: [
      { id: "integrations", label: "Интеграции", description: "Подключение внешних сервисов и каналов", icon: Plug, stage: 8 },
      { id: "settings", label: "Настройки", description: "Профиль, компания, роли, каналы, уведомления, тариф", icon: Settings, stage: 8 },
      { id: "help", label: "Помощь", description: "Поддержка и чат обучения", icon: HelpCircle, stage: 8 }
    ]
  }
] as const;

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function findNavItem(id: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.id === id);
}

export const DEFAULT_ROUTE = "overview";
