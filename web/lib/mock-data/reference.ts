/* Сгенерировано scripts/gen-seed.mjs из ../download/data.js — справочники (не меняются пользователем). */
import type { ActivityPoint, ChainTemplate, Channel, Funnel, KnowledgeSource, Stage, SupplyOffer, SupplyRequest, QuizQuestion } from "@/lib/schemas";

export const CHANNELS: Record<string, Channel> = {
  "telegram": {
    "id": "telegram",
    "name": "Telegram",
    "icon": "send-paper-plane"
  },
  "whatsapp": {
    "id": "whatsapp",
    "name": "WhatsApp",
    "icon": "message-circle"
  },
  "max": {
    "id": "max",
    "name": "MAX",
    "icon": "message-circle"
  },
  "vk": {
    "id": "vk",
    "name": "VK",
    "icon": "message-circle"
  },
  "avito": {
    "id": "avito",
    "name": "Авито",
    "icon": "globe"
  },
  "email": {
    "id": "email",
    "name": "Email",
    "icon": "mail"
  },
  "phone": {
    "id": "phone",
    "name": "Телефония",
    "icon": "phone"
  },
  "site": {
    "id": "site",
    "name": "Сайт",
    "icon": "globe"
  }
};
export const STAGES: Stage[] = [
  {
    "id": "new",
    "name": "Новые",
    "order": 0
  },
  {
    "id": "work",
    "name": "В работе",
    "order": 1
  },
  {
    "id": "qual",
    "name": "Квалификация",
    "order": 2
  },
  {
    "id": "deal",
    "name": "Сделка",
    "order": 3
  }
];
export const FUNNELS: Funnel[] = [
  {
    "id": "fn-sales",
    "name": "Продажи",
    "agentId": "ag-sales",
    "stages": [
      "new",
      "work",
      "qual",
      "deal"
    ]
  },
  {
    "id": "fn-support",
    "name": "Поддержка",
    "agentId": "ag-support",
    "stages": [
      "new",
      "work",
      "qual",
      "deal"
    ]
  },
  {
    "id": "fn-supply",
    "name": "Снабжение",
    "agentId": "ag-supply",
    "stages": [
      "new",
      "work",
      "qual",
      "deal"
    ]
  }
];
export const ACTIVITY: ActivityPoint[] = [
  {
    "day": "Пн",
    "ai": 18,
    "human": 6
  },
  {
    "day": "Вт",
    "ai": 22,
    "human": 8
  },
  {
    "day": "Ср",
    "ai": 15,
    "human": 5
  },
  {
    "day": "Чт",
    "ai": 26,
    "human": 9
  },
  {
    "day": "Пт",
    "ai": 30,
    "human": 11
  },
  {
    "day": "Сб",
    "ai": 9,
    "human": 2
  },
  {
    "day": "Вс",
    "ai": 6,
    "human": 1
  }
];
export const QUIZZES: Record<string, QuizQuestion[]> = {
  "crs-1": [
    {
      "q": "Что определяет, как AI-сотрудник отвечает клиенту?",
      "options": [
        "Цвет интерфейса",
        "Инструкция и база знаний",
        "Размер экрана",
        "Время суток"
      ],
      "answer": 1
    },
    {
      "q": "Какие действия ИИ выполняет только после согласования?",
      "options": [
        "Любые ответы клиенту",
        "Те, что в правилах отмечены «согласует менеджер»",
        "Только приветствия",
        "Никакие"
      ],
      "answer": 1
    },
    {
      "q": "Что делает AI-сотрудник поддержки, если вопроса нет в базе знаний?",
      "options": [
        "Выдумывает ответ",
        "Закрывает диалог",
        "Переводит диалог на человека",
        "Просит подождать неделю"
      ],
      "answer": 2
    },
    {
      "q": "Сколько дней длится пробный период?",
      "options": [
        "7",
        "14",
        "30",
        "90"
      ],
      "answer": 1
    },
    {
      "q": "Где менеджер забирает диалог у ИИ?",
      "options": [
        "В «Диалогах», кнопка «Передать менеджеру»",
        "В «Настройках»",
        "В «Календаре»",
        "В «Интеграциях»"
      ],
      "answer": 0
    }
  ],
  "crs-2": [
    {
      "q": "Какая главная цель первого сообщения клиенту?",
      "options": [
        "Сразу назвать цену",
        "Выяснить потребность",
        "Закрыть сделку",
        "Прислать каталог без вопросов"
      ],
      "answer": 1
    },
    {
      "q": "Можно ли обещать скидку без согласования?",
      "options": [
        "Да, всегда",
        "Только вечером",
        "Нет, скидку согласует менеджер",
        "Только постоянным клиентам"
      ],
      "answer": 2
    },
    {
      "q": "Какие стадии проходит сделка в воронке?",
      "options": [
        "Новые → В работе → Квалификация → Сделка",
        "Сделка → Новые",
        "Квалификация → Новые → Сделка",
        "Только «Новые»"
      ],
      "answer": 0
    },
    {
      "q": "Когда диалог стоит передать менеджеру?",
      "options": [
        "Никогда",
        "Когда клиент готов к сделке или вопрос вне базы знаний",
        "После каждого сообщения",
        "Только ночью"
      ],
      "answer": 1
    }
  ],
  "crs-3": [
    {
      "q": "Клиент говорит «дорого». Что сделать первым?",
      "options": [
        "Сразу предложить скидку",
        "Согласиться и завершить разговор",
        "Уточнить, с чем клиент сравнивает и что для него важно",
        "Проигнорировать"
      ],
      "answer": 2
    },
    {
      "q": "Какой первый шаг при любом возражении?",
      "options": [
        "Перебить клиента",
        "Выслушать и уточнить причину",
        "Сменить тему",
        "Отправить шаблон"
      ],
      "answer": 1
    },
    {
      "q": "Кто согласует скидку выше установленного порога?",
      "options": [
        "ИИ самостоятельно",
        "Клиент",
        "Менеджер",
        "Никто"
      ],
      "answer": 2
    },
    {
      "q": "Клиент недоволен и просит вернуть деньги. Как действовать?",
      "options": [
        "Пообещать возврат от имени ИИ",
        "Эскалировать человеку для согласования",
        "Не отвечать",
        "Закрыть обращение"
      ],
      "answer": 1
    },
    {
      "q": "Зачем нужна работа с возражением?",
      "options": [
        "Чтобы выиграть спор",
        "Чтобы понять причину и вернуть разговор к потребности",
        "Чтобы закончить диалог быстрее",
        "Чтобы снизить цену"
      ],
      "answer": 1
    }
  ]
};
export const QUIZ_PASS: number = 0.7;
export const KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    "id": "ks-1",
    "type": "pdf",
    "name": "Демо-описание продукта.pdf",
    "status": "Индексировано"
  },
  {
    "id": "ks-2",
    "type": "docx",
    "name": "Демо-сценарии продаж.docx",
    "status": "Индексировано"
  },
  {
    "id": "ks-3",
    "type": "xlsx",
    "name": "Демо-реестр поставщиков.xlsx",
    "status": "Индексировано"
  },
  {
    "id": "ks-4",
    "type": "web",
    "name": "Демо-сайт компании",
    "status": "Обновляется"
  },
  {
    "id": "ks-5",
    "type": "api",
    "name": "Демо-каталог через API",
    "status": "Подключён"
  }
];
export const CHAIN_TEMPLATES: ChainTemplate[] = [
  {
    "id": "ch-services",
    "name": "Услуги",
    "nodes": [
      {
        "role": "Поддержка",
        "name": "Приём обращения"
      },
      {
        "role": "Продажи",
        "name": "Квалификация и КП"
      },
      {
        "role": "РОП",
        "name": "Контроль качества"
      }
    ]
  },
  {
    "id": "ch-prod",
    "name": "Производство",
    "nodes": [
      {
        "role": "Продажи",
        "name": "Заказ от клиента"
      },
      {
        "role": "Снабжение",
        "name": "Закупка комплектующих"
      },
      {
        "role": "Поддержка",
        "name": "Сопровождение отгрузки"
      }
    ]
  }
];
export const SUPPLY_REQUESTS: SupplyRequest[] = [
  {
    "id": "SR-55",
    "item": "Демо-заказ: комплектующие",
    "suppliers": 4,
    "replies": 2,
    "status": "В работе"
  },
  {
    "id": "SR-54",
    "item": "Демо-заказ: расходники",
    "suppliers": 3,
    "replies": 3,
    "status": "Сводка готова"
  }
];
export const SUPPLY_OFFERS: SupplyOffer[] = [
  {
    "supplier": "Демо-поставщик 1",
    "price": null,
    "term": "14 дн.",
    "note": "Базовые условия"
  },
  {
    "supplier": "Демо-поставщик 2",
    "price": null,
    "term": "10 дн.",
    "note": "Быстрее срок"
  },
  {
    "supplier": "Демо-поставщик 3",
    "price": null,
    "term": "21 дн.",
    "note": "Дольше, дешевле"
  }
];
