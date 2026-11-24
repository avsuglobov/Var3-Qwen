import type { Document } from "@/lib/schemas";

/**
 * Чистые функции раздела «Документы и согласование» (этап 3, группа 5). Поведение перенесено
 * из прототипа (`../download/sections2.js` docs()/openDocModal(), `db.js` DOCUMENTS,
 * `pdf.js` — money/docNum/itemsFor/totalOf): очередь согласования, форматы сумм и позиций
 * печатных форм, правила создания документа. Цены и тарифы НЕ выдумываются: без суммы — «—».
 */

/** Типы документов и подписи (как DOC_TYPE_LABEL db.js: таблица — «КП», модалка — развёрнуто). */
export type DocType = Document["type"];
export const TYPE_META: Record<DocType, { label: string; option: string }> = {
  invoice: { label: "Счёт", option: "Счёт" },
  offer: { label: "КП", option: "Коммерческое предложение" },
  act: { label: "Акт", option: "Акт" }
};

/** Подписи статуса в очереди (sections2.js: бейджи таблицы) и в печатной форме/PDF (pdf.js STATUS). */
export type DocStatus = Document["status"];
export const STATUS_META: Record<DocStatus, { label: string; tone: "accent" | "status" | "critical" }> = {
  pending: { label: "На согласовании", tone: "accent" },
  approved: { label: "Одобрено", tone: "status" },
  rejected: { label: "Отклонено", tone: "critical" }
};
export const STATUS_PRINT: Record<DocStatus, string> = {
  pending: "На согласовании",
  approved: "Одобрен",
  rejected: "Отклонён"
};

/** Фильтр очереди согласования (segmented в прототипе: Все / На согласов. / Одобрено / Отклонено). */
export type DocFilter = "all" | DocStatus;
export const DOC_FILTERS: readonly { id: DocFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "pending", label: "На согласов." },
  { id: "approved", label: "Одобрено" },
  { id: "rejected", label: "Отклонено" }
];

/** Варианты «Согласующий» в модалке создания (approverOpts прототипа). */
export const APPROVERS: readonly string[] = ["Менеджер продаж", "Бухгалтерия", "Руководитель"];

/** Шаблоны документов (как TEMPLATES data.js прототипа — чипы над очередью). */
export const DOC_TEMPLATES: readonly { id: string; type: DocType; name: string }[] = [
  { id: "tpl-inv", type: "invoice", name: "Счёт" },
  { id: "tpl-off", type: "offer", name: "Коммерческое предложение" },
  { id: "tpl-act", type: "act", name: "Акт" }
];

export function filterDocs(docs: readonly Document[], filter: DocFilter): Document[] {
  return docs.filter((d) => filter === "all" || d.status === filter);
}

/** Формат сумм pdf.js: 12000 → «12 000 ₽»; не число (в т.ч. null/undefined/NaN) → «—». */
export function money(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
}

/** Номер без типа и «Демо-» (pdf.js): «Демо-счёт №204» → «204»; без № — id. */
export function docNum(doc: Pick<Document, "number" | "id">): string {
  const m = /№\s*(\S+)/.exec(String(doc.number || ""));
  return m ? m[1] : String(doc.id || "");
}

/** Дата печатной формы pdf.js todayDMY: ДД.ММ.ГГГГ по локальному времени браузера. */
export function todayDMY(date: Date = new Date()): string {
  const p = (n: number): string => (n < 10 ? "0" + n : String(n));
  return p(date.getDate()) + "." + p(date.getMonth() + 1) + "." + date.getFullYear();
}

/** Наименование позиции по умолчанию, когда состав не задан (ITEM_NAME pdf.js). */
const ITEM_NAME: Record<DocType, string> = {
  invoice: "Услуги по счёту",
  offer: "Предложение по услугам",
  act: "Оказанные услуги"
};

export interface DocItem {
  name: string;
  qty: number;
  /** null — цена не задана (не выдумываем; реальные позиции придут с бэкенда). */
  price: number | null;
}

/** Позиции документа (pdf.js itemsFor): doc.items, иначе одна строка «состав не задан». */
export function itemsFor(doc: Document): DocItem[] {
  if (Array.isArray(doc.items) && doc.items.length) {
    return doc.items.map((it) => ({
      name: String(it.name || "Позиция"),
      qty: Number(it.qty) || 1,
      price: typeof it.price === "number" ? it.price : null
    }));
  }
  return [
    {
      name: (ITEM_NAME[doc.type] || "Позиция") + " (состав не задан, демо)",
      qty: 1,
      price: typeof doc.amount === "number" ? doc.amount : null
    }
  ];
}

/** Итог (pdf.js totalOf): null, если хотя бы у одной позиции нет цены — сумму не угадываем. */
export function totalOf(items: readonly DocItem[]): number | null {
  let t = 0;
  for (const it of items) {
    if (it.price == null) return null;
    t += it.qty * it.price;
  }
  return t;
}

/** Время создания — UTC ЧЧ:ММ (как db.nowHM прототипа). */
export function nowHM(): string {
  const d = new Date();
  const pad = (x: number): string => String(x).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Следующий номер документа: max числовой части «DOC-NNN» + 1, без ведущих нулей
 * (как nextNum("DOC-") db.js; у сида максимум DOC-204 → новый DOC-205).
 */
export function nextDocId(docs: readonly Document[]): string {
  let max = 0;
  for (const doc of docs) {
    const m = /^DOC-(\d+)$/.exec(doc.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DOC-${max + 1}`;
}

export interface NewDocInput {
  type: DocType;
  client: string;
  approver: string;
}

/** Создание документа (db.createDocument): статус pending, номер «Счёт №205», сумма не запрашивается. */
export function buildDocument(input: NewDocInput, docs: readonly Document[], time: string = nowHM()): Document {
  const n = nextDocId(docs).slice(4);
  return {
    id: `DOC-${n}`,
    type: input.type,
    number: `${TYPE_META[input.type].label} №${n}`,
    client: input.client || "—",
    amount: null,
    status: "pending",
    approver: input.approver,
    created: time
  };
}
