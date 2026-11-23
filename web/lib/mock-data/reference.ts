/* Сгенерировано scripts/gen-seed.mjs из ../download/data.js — справочники (не меняются пользователем). */
import type { ActivityPoint, Channel, Funnel, Stage } from "@/lib/schemas";

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
