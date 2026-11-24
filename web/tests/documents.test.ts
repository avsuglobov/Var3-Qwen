import { describe, expect, it } from "vitest";
import { SEED_DATA } from "@/lib/mock-data/seed";
import { buildPrintHtml } from "@/styles/print-form";
import {
  buildDocument,
  docNum,
  filterDocs,
  itemsFor,
  money,
  nextDocId,
  totalOf
} from "@/lib/selectors/documents";

/* Порт scripts/regress_docs.js прототипа (пункты 2–4: формат сумм, отсутствие выдуманных
   цен, номер документа) + поведение очереди согласования (sections2.js docs()). */

describe("селекторы «Документы»: формат сумм (money)", () => {
  it("12000 → «12 000 ₽»", () => {
    expect(money(12000)).toBe("12 000 ₽");
  });
  it("999 / 1000 / 9000 / 1234567 — разряды через пробел", () => {
    expect(money(999)).toBe("999 ₽");
    expect(money(1000)).toBe("1 000 ₽");
    expect(money(9000)).toBe("9 000 ₽");
    expect(money(1234567)).toBe("1 234 567 ₽");
  });
  it("0, дробные округляются, нет суммы → «—»", () => {
    expect(money(0)).toBe("0 ₽");
    expect(money(1499.6)).toBe("1 500 ₽");
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money(NaN)).toBe("—");
    expect(money(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("селекторы «Документы»: цены не выдумываются", () => {
  it("в исходниках нет захардкоженных цен и тарифов", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve("lib/pdf/documents.ts"), "utf8");
    expect(/12000|3000|9000|19000|Старт|Бизнес|Лицензия ИИ/.test(src)).toBe(false);
  });
  it("документы сида без суммы → без цены и итог null", () => {
    for (const doc of SEED_DATA.DOCUMENTS) {
      const items = itemsFor(doc);
      expect(items.every((x) => x.price === null)).toBe(true);
      expect(totalOf(items)).toBeNull();
    }
  });
  it("заданная amount используется как есть", () => {
    const withAmount = SEED_DATA.DOCUMENTS[0].amount === null
      ? { ...SEED_DATA.DOCUMENTS[0], amount: 5000 }
      : SEED_DATA.DOCUMENTS[0];
    expect(totalOf(itemsFor(withAmount))).toBe(5000);
  });
  it("items с ценами суммируются", () => {
    const doc = { ...SEED_DATA.DOCUMENTS[2], items: [
      { name: "a", qty: 2, price: 100 },
      { name: "b", qty: 1, price: 50 }
    ] };
    expect(totalOf(itemsFor(doc))).toBe(250);
  });
  it("items с пропущенной ценой → итог null (не угадываем)", () => {
    const doc = { ...SEED_DATA.DOCUMENTS[2], items: [
      { name: "a", qty: 2, price: 100 },
      { name: "b", qty: 1, price: null }
    ] };
    expect(totalOf(itemsFor(doc))).toBeNull();
  });
});

describe("селекторы «Документы»: номер документа", () => {
  it("«Демо-счёт №204» → «204»", () => {
    expect(docNum({ number: "Демо-счёт №204", id: "DOC-204" })).toBe("204");
  });
  it("«Счёт №205» → «205»; без № → id", () => {
    expect(docNum({ number: "Счёт №205", id: "DOC-1" })).toBe("205");
    expect(docNum({ number: "x", id: "DOC-7" })).toBe("DOC-7");
  });
  it("nextDocId: max числовой части + 1 (сид до DOC-204 → DOC-205)", () => {
    expect(nextDocId(SEED_DATA.DOCUMENTS)).toBe("DOC-205");
    expect(nextDocId([])).toBe("DOC-1");
  });
});

describe("селекторы «Документы»: создание и фильтр очереди", () => {
  it("buildDocument: DOC-205, «Счёт №205», pending, время по умолчанию", () => {
    const doc = buildDocument({ type: "invoice", client: "ООО Ромашка", approver: "Бухгалтерия" }, SEED_DATA.DOCUMENTS, "12:34");
    expect(doc.id).toBe("DOC-205");
    expect(doc.number).toBe("Счёт №205");
    expect(doc.status).toBe("pending");
    expect(doc.amount).toBeNull();
    expect(doc.created).toBe("12:34");
    expect(doc.client).toBe("ООО Ромашка");
    expect(doc.approver).toBe("Бухгалтерия");
  });
  it("buildDocument: типы дают подписи «Счёт/КП/Акт», пустой клиент → «—»", () => {
    expect(buildDocument({ type: "offer", client: "", approver: "Менеджер продаж" }, SEED_DATA.DOCUMENTS, "09:00").number).toBe("КП №205");
    expect(buildDocument({ type: "act", client: "", approver: "Менеджер продаж" }, SEED_DATA.DOCUMENTS, "09:00").client).toBe("—");
  });
  it("filterDocs: all / pending / approved / rejected", () => {
    const docs = SEED_DATA.DOCUMENTS;
    expect(filterDocs(docs, "all").length).toBe(docs.length);
    expect(filterDocs(docs, "pending").every((d) => d.status === "pending")).toBe(true);
    expect(filterDocs(docs, "approved").map((d) => d.id)).toEqual(["DOC-203"]);
    expect(filterDocs(docs, "rejected").map((d) => d.id)).toEqual(["DOC-201"]);
  });
  it("itemsFor без items: одна строка «состав не задан, демо»", () => {
    const items = itemsFor(SEED_DATA.DOCUMENTS[0]);
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("Услуги по счёту (состав не задан, демо)");
    expect(items[0].qty).toBe(1);
    expect(items[0].price).toBeNull();
  });
});

describe("печатная форма (порт регресса печати)", () => {
  const doc204 = SEED_DATA.DOCUMENTS.find((d) => d.id === "DOC-204")!;
  const html = buildPrintHtml(doc204, new Date(2026, 10, 24, 12, 0));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("заголовок «СЧЁТ № 204 (демо)» без дубля №", () => {
    expect(/СЧЁТ № 204 \(демо\)/.test(html)).toBe(true);
    expect(/№ счёт/i.test(html)).toBe(false);
  });
  it("без ₽-сумм у документов без цены, есть пометка «суммы не заданы»", () => {
    expect(/\d ?₽/.test(text)).toBe(false);
    expect(/суммы не заданы/.test(text)).toBe(true);
    expect(text).toContain("Итого: —");
  });
  it("реквизиты, дата печати ДД.ММ.ГГГГ и подписи", () => {
    expect(text).toContain("Клиент: Демо-клиент В");
    expect(text).toContain("Статус: На согласовании");
    expect(/Дата: \d\d\.\d\d\.\d{4}/.test(text)).toBe(true);
    expect(text).toContain("Исполнитель");
    expect(text).toContain("Заказчик");
    expect(text).toContain("не является юридически значимым");
  });
  it("с заданной суммой печатается формат «12 000 ₽», пометка исчезает", () => {
    const withAmount = buildPrintHtml({ ...doc204, amount: 12000 }, new Date(2026, 10, 24, 12, 0));
    const t = withAmount.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(t).toContain("12 000 ₽");
    expect(/суммы не заданы/.test(t)).toBe(false);
  });
  it("ячейки с HTML экранируются", () => {
    const xss = buildPrintHtml({ ...doc204, client: "<img src=x onerror=1>" }, new Date());
    expect(xss).not.toContain("<img src=x");
    expect(xss).toContain("&lt;img");
  });
});
