/* Сгенерировано scripts/gen-seed.mjs из ../download/data.js — не править вручную. Все записи помечены в интерфейсе как «Демо».
   Названия сотрудников — с приставкой «AI-» вместо «ИИ-» (правило scripts/ai-naming.mjs, этап 3). */
import type { DbSnapshot } from "@/lib/schemas";

export const SEED_DATA: DbSnapshot = {
  "LEADS": [
    {
      "id": "LD-1042",
      "name": "Демо-клиент А",
      "channel": "telegram",
      "stageId": "new",
      "funnelId": "fn-sales",
      "agentId": "ag-sales",
      "value": null,
      "lastActivity": "13:02",
      "note": "Запрос тарифов",
      "events": [
        {
          "t": "12:58",
          "actor": "ai",
          "text": "Принято обращение, квалифицирован как новый лид"
        },
        {
          "t": "13:02",
          "actor": "ai",
          "text": "Отправлен приветственный ответ и каталог"
        }
      ]
    },
    {
      "id": "LD-1041",
      "name": "Демо-клиент Б",
      "channel": "site",
      "stageId": "work",
      "funnelId": "fn-sales",
      "agentId": "ag-sales",
      "value": null,
      "lastActivity": "12:40",
      "note": "Уточнение условий",
      "events": [
        {
          "t": "11:30",
          "actor": "ai",
          "text": "Уточнена потребность, предложен тариф"
        },
        {
          "t": "12:40",
          "actor": "human",
          "text": "Скорректировал условия"
        }
      ]
    },
    {
      "id": "LD-1039",
      "name": "Демо-клиент В",
      "channel": "whatsapp",
      "stageId": "qual",
      "funnelId": "fn-sales",
      "agentId": "ag-sales",
      "value": null,
      "lastActivity": "11:15",
      "note": "Согласование КП",
      "events": [
        {
          "t": "10:50",
          "actor": "ai",
          "text": "Подготовлено и отправлено КП"
        },
        {
          "t": "11:15",
          "actor": "human",
          "text": "Передано менеджеру на закрытие"
        }
      ]
    },
    {
      "id": "LD-1037",
      "name": "Демо-клиент Г",
      "channel": "phone",
      "stageId": "deal",
      "funnelId": "fn-sales",
      "agentId": "ag-sales",
      "value": null,
      "lastActivity": "10:30",
      "note": "Закрытие сделки",
      "events": [
        {
          "t": "10:20",
          "actor": "human",
          "text": "Согласована сделка"
        },
        {
          "t": "10:30",
          "actor": "ai",
          "text": "Сформирован счёт"
        }
      ]
    },
    {
      "id": "LD-1036",
      "name": "Демо-клиент Д",
      "channel": "email",
      "stageId": "new",
      "funnelId": "fn-support",
      "agentId": "ag-support",
      "value": null,
      "lastActivity": "09:55",
      "note": "Вопрос по возврату",
      "events": [
        {
          "t": "09:50",
          "actor": "ai",
          "text": "Принято обращение в поддержку"
        }
      ]
    },
    {
      "id": "LD-1035",
      "name": "Демо-клиент Е",
      "channel": "site",
      "stageId": "work",
      "funnelId": "fn-support",
      "agentId": "ag-support",
      "value": null,
      "lastActivity": "09:30",
      "note": "Эскалация",
      "events": [
        {
          "t": "09:10",
          "actor": "ai",
          "text": "Вопрос вне базы — предложена эскалация"
        },
        {
          "t": "09:30",
          "actor": "human",
          "text": "Передано менеджеру (КРИТИЧНО)"
        }
      ]
    }
  ],
  "CONVERSATIONS": [
    {
      "id": "cv-1",
      "contactName": "Демо-клиент А",
      "channel": "telegram",
      "agentId": "ag-sales",
      "mode": "ai",
      "unread": 2,
      "lastTime": "13:02",
      "lastPreview": "Спасибо, посмотрю тарифы",
      "messages": [
        {
          "from": "client",
          "text": "Здравствуйте, есть тарифы для команды из 8 человек?",
          "time": "12:58"
        },
        {
          "from": "ai",
          "text": "Здравствуйте! Да, подготовлю варианты под команду из 8 человек. Уточните, пожалуйста, приоритет: цена или функциональность?",
          "time": "12:59"
        },
        {
          "from": "client",
          "text": "Скорее функциональность.",
          "time": "13:01"
        },
        {
          "from": "ai",
          "text": "Понял. Отправлю каталог с подходящими тарифами.",
          "time": "13:02"
        }
      ],
      "context": {
        "who": "Демо-клиент А",
        "channel": "Telegram",
        "history": "Первое обращение",
        "files": 0,
        "nextStep": "Отправить каталог тарифов"
      }
    },
    {
      "id": "cv-2",
      "contactName": "Демо-клиент Е",
      "channel": "site",
      "agentId": "ag-support",
      "mode": "human",
      "unread": 0,
      "lastTime": "09:30",
      "lastPreview": "Передано менеджеру",
      "messages": [
        {
          "from": "client",
          "text": "Не могу оформить возврат, кнопка неактивна.",
          "time": "09:10"
        },
        {
          "from": "ai",
          "text": "Опишите, пожалуйста, шаг — посмотрю в инструкциях. Если не найду — подключу менеджера.",
          "time": "09:11"
        },
        {
          "from": "human",
          "text": "Добрый день, передаю обращение на оформление возврата.",
          "time": "09:30"
        }
      ],
      "context": {
        "who": "Демо-клиент Е",
        "channel": "Сайт",
        "history": "3 обращения за месяц",
        "files": 1,
        "nextStep": "Оформить возврат менеджером"
      }
    },
    {
      "id": "cv-3",
      "contactName": "Демо-клиент В",
      "channel": "whatsapp",
      "agentId": "ag-sales",
      "mode": "reading",
      "unread": 0,
      "lastTime": "11:15",
      "lastPreview": "Менеджер ведёт диалог",
      "messages": [
        {
          "from": "ai",
          "text": "Готовлю КП по согласованным условиям.",
          "time": "10:50"
        },
        {
          "from": "human",
          "text": "Добрый день! Высылаю финальное КП, обсудим детали.",
          "time": "11:15"
        }
      ],
      "context": {
        "who": "Демо-клиент В",
        "channel": "WhatsApp",
        "history": "Квалифицирован",
        "files": 1,
        "nextStep": "Закрытие сделки"
      }
    }
  ],
  "DOCUMENTS": [
    {
      "id": "DOC-204",
      "type": "invoice",
      "number": "Демо-счёт №204",
      "client": "Демо-клиент В",
      "amount": null,
      "status": "pending",
      "approver": "Менеджер продаж",
      "created": "10:50"
    },
    {
      "id": "DOC-203",
      "type": "offer",
      "number": "Демо-КП №203",
      "client": "Демо-клиент А",
      "amount": null,
      "status": "approved",
      "approver": "Менеджер продаж",
      "created": "09:20"
    },
    {
      "id": "DOC-202",
      "type": "act",
      "number": "Демо-акт №202",
      "client": "Демо-клиент Г",
      "amount": null,
      "status": "pending",
      "approver": "Бухгалтерия",
      "created": "08:11"
    },
    {
      "id": "DOC-201",
      "type": "invoice",
      "number": "Демо-счёт №201",
      "client": "Демо-клиент Б",
      "amount": null,
      "status": "rejected",
      "approver": "Менеджер продаж",
      "created": "вчера"
    }
  ],
  "ONBOARDING": [
    {
      "id": "reg",
      "name": "Регистрация",
      "done": true
    },
    {
      "id": "company",
      "name": "Компания",
      "done": true
    },
    {
      "id": "agent",
      "name": "AI-сотрудник",
      "done": true
    },
    {
      "id": "instruct",
      "name": "Инструкция",
      "done": true
    },
    {
      "id": "kb-test",
      "name": "База знаний / Тест",
      "done": false
    },
    {
      "id": "channels",
      "name": "Каналы",
      "done": false
    },
    {
      "id": "crm",
      "name": "CRM",
      "done": false
    }
  ],
  "TASKS": [
    {
      "id": "TK-1",
      "title": "Подготовить КП для Демо-клиента А",
      "done": false,
      "priority": "high",
      "due": "2026-11-16",
      "assignee": "AI-Продажи",
      "tag": "Документы"
    },
    {
      "id": "TK-2",
      "title": "Перезвонить Демо-клиенту В после срыва",
      "done": false,
      "priority": "high",
      "due": "2026-11-15",
      "assignee": "Менеджер",
      "tag": "CRM"
    },
    {
      "id": "TK-3",
      "title": "Согласовать счёт №204 с бухгалтерией",
      "done": false,
      "priority": "med",
      "due": "2026-11-17",
      "assignee": "Менеджер",
      "tag": "Документы"
    },
    {
      "id": "TK-4",
      "title": "Запросить КП у поставщика «Демо-логистика»",
      "done": false,
      "priority": "med",
      "due": "2026-11-18",
      "assignee": "AI-Снабжение",
      "tag": "Снабжение"
    },
    {
      "id": "TK-5",
      "title": "Разобрать эскалацию в диалоге cv-3",
      "done": true,
      "priority": "low",
      "due": "2026-11-13",
      "assignee": "AI-РОП",
      "tag": "Диалоги"
    },
    {
      "id": "TK-6",
      "title": "Обновить инструкцию агента «AI-Продажи»",
      "done": false,
      "priority": "low",
      "due": "2026-11-20",
      "assignee": "Менеджер",
      "tag": "Команда"
    }
  ],
  "CALENDAR_EVENTS": [
    {
      "id": "EV-1",
      "title": "Демо-звонок Демо-клиенту А",
      "date": "2026-11-16",
      "time": "10:00",
      "duration": "45 мин",
      "type": "call",
      "assignee": "AI-Продажи"
    },
    {
      "id": "EV-2",
      "title": "Срок: КП для Демо-клиента А",
      "date": "2026-11-16",
      "time": "18:00",
      "duration": "",
      "type": "deadline",
      "assignee": "Менеджер"
    },
    {
      "id": "EV-3",
      "title": "Встреча: согласование счёта №204",
      "date": "2026-11-17",
      "time": "11:30",
      "duration": "30 мин",
      "type": "meeting",
      "assignee": "Бухгалтерия"
    },
    {
      "id": "EV-4",
      "title": "Обучение: скрипт продаж",
      "date": "2026-11-18",
      "time": "09:00",
      "duration": "60 мин",
      "type": "training",
      "assignee": "Команда"
    },
    {
      "id": "EV-5",
      "title": "Демо-звонок Демо-клиенту Б",
      "date": "2026-11-19",
      "time": "15:00",
      "duration": "45 мин",
      "type": "call",
      "assignee": "AI-Продажи"
    }
  ],
  "NOTIFICATIONS": [
    {
      "id": "NT-1",
      "type": "lead",
      "text": "Новый лид «Демо-клиент Д» из канала Telegram",
      "time": "5 мин назад",
      "read": false
    },
    {
      "id": "NT-2",
      "type": "doc",
      "text": "Счёт №204 ожидает согласования",
      "time": "12 мин назад",
      "read": false
    },
    {
      "id": "NT-3",
      "type": "alert",
      "text": "Эскалация в диалоге cv-3 — требуется менеджер",
      "time": "30 мин назад",
      "read": false
    },
    {
      "id": "NT-4",
      "type": "system",
      "text": "AI-Снабжение собрал 3 предложения от поставщиков",
      "time": "1 ч назад",
      "read": true
    },
    {
      "id": "NT-5",
      "type": "lead",
      "text": "Демо-клиент А перешёл на стадию «Квалификация»",
      "time": "2 ч назад",
      "read": true
    }
  ],
  "AGENTS": [
    {
      "id": "ag-sales",
      "name": "Продажи",
      "role": "sales",
      "status": "online",
      "channels": [
        "telegram",
        "whatsapp",
        "site",
        "phone"
      ],
      "funnelId": "fn-sales",
      "monogram": "ПР",
      "summary": "Квалифицирует обращения, ведёт по воронке, готовит КП.",
      "instruction": "Приветствовать клиента, уточнить потребность, предложить релевантный тариф. Не обещать скидку без согласования.",
      "knowledge": [
        "Тарифы",
        "Сценарии возражений",
        "Каталог"
      ],
      "funnel": [
        "Новые → В работе → Квалификация → Сделка"
      ],
      "approvals": [
        {
          "action": "Отправить КП",
          "mode": "auto",
          "note": "ИИ формирует и отправляет сам"
        },
        {
          "action": "Скидка более 10%",
          "mode": "approve",
          "note": "Согласует менеджер"
        },
        {
          "action": "Закрытие сделки",
          "mode": "approve",
          "note": "Согласует менеджер"
        }
      ]
    },
    {
      "id": "ag-support",
      "name": "Поддержка",
      "role": "support",
      "status": "online",
      "channels": [
        "telegram",
        "email",
        "site"
      ],
      "funnelId": "fn-support",
      "monogram": "ПП",
      "summary": "Отвечает на частые вопросы, оформляет обращения, эскалирует сложные.",
      "instruction": "Отвечать по базе знаний. Если вопрос вне базы — перевести на человека.",
      "knowledge": [
        "База FAQ",
        "Инструкции продуктов",
        "SLA"
      ],
      "funnel": [
        "Новые → В работе → Квалификация → Сделка"
      ],
      "approvals": [
        {
          "action": "Ответ из FAQ",
          "mode": "auto",
          "note": "ИИ отвечает сам"
        },
        {
          "action": "Возврат средств",
          "mode": "approve",
          "note": "Согласует менеджер"
        }
      ]
    },
    {
      "id": "ag-supply",
      "name": "Снабжение",
      "role": "supply",
      "status": "idle",
      "channels": [
        "email"
      ],
      "funnelId": "fn-supply",
      "monogram": "СН",
      "summary": "Запрашивает условия у поставщиков, сводит таблицу, передаёт результат.",
      "instruction": "Собирать коммерческие предложения, сравнивать по сроку и цене, готовить сводку.",
      "knowledge": [
        "Реестр поставщиков",
        "Шаблон запроса",
        "Критерии выбора"
      ],
      "funnel": [
        "Новые → В работе → Квалификация → Сделка"
      ],
      "approvals": [
        {
          "action": "Запрос КП поставщикам",
          "mode": "auto",
          "note": "ИИ рассылает сам"
        },
        {
          "action": "Выбор поставщика",
          "mode": "approve",
          "note": "Согласует закупщик"
        }
      ]
    },
    {
      "id": "ag-hr",
      "name": "HR",
      "role": "hr",
      "status": "offline",
      "channels": [
        "email",
        "site"
      ],
      "funnelId": null,
      "monogram": "HR",
      "summary": "Обучает сотрудников по материалам хранилища, проводит тест, выдаёт сертификат.",
      "instruction": "Собирать программу из материалов, проверять знания тестом.",
      "knowledge": [
        "Программы обучения",
        "Тесты"
      ],
      "funnel": [],
      "approvals": [
        {
          "action": "Выдача сертификата",
          "mode": "auto",
          "note": "ИИ формирует PDF сам"
        }
      ]
    },
    {
      "id": "ag-rop",
      "name": "РОП",
      "role": "rop",
      "status": "online",
      "channels": [
        "email"
      ],
      "funnelId": null,
      "monogram": "РО",
      "summary": "Разбирает диалоги менеджеров, находит нарушения скрипта, отвечает руководителю.",
      "instruction": "Анализировать выборку диалогов, оценивать качество, давать рекомендации.",
      "knowledge": [
        "Скрипты продаж",
        "Чек-лист качества"
      ],
      "funnel": [],
      "approvals": [
        {
          "action": "Оценка качества",
          "mode": "auto",
          "note": "ИИ считает сам"
        }
      ]
    }
  ],
  "COURSES": [
    {
      "id": "crs-1",
      "title": "Демо-курс «Продукт и тарифы»",
      "lessons": 6,
      "progress": 0.5,
      "status": "В работе"
    },
    {
      "id": "crs-2",
      "title": "Демо-курс «Скрипты продаж»",
      "lessons": 4,
      "progress": 0,
      "status": "Не начат"
    },
    {
      "id": "crs-3",
      "title": "Демо-курс «Работа с возражениями»",
      "lessons": 5,
      "progress": 1,
      "status": "Завершён"
    }
  ],
  "CERTIFICATES": [
    {
      "id": "cert-1",
      "name": "А. Иванов",
      "course": "Демо-курс «Работа с возражениями»",
      "date": "Демо · 2026-11-01"
    }
  ],
  "COMPANY_PROFILE": {
    "name": "Демо-компания",
    "about": "Демо-описание деятельности для контекста AI-сотрудников.",
    "audience": "Демо: целевая аудитория и ключевые предложения."
  }
};
