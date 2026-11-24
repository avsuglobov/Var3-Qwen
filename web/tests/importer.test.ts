import { describe, expect, it } from "vitest";
import { decodeText, guessMapping, parseCsv, parseFile, excelSerialToIso, MAX_ROWS } from "@/lib/importer";
import { buildXlsx } from "./lib/xlsx-build.mjs";

/**
 * Поведение разбора файлов — из scripts/regress_import.js прототипа: .xlsx (shared strings,
 * rich text с фонетикой, inlineStr, серийные даты), .csv (разделители, cp1251, кавычки),
 * лимиты и защита от zip-бомб, автоподбор колонок.
 */

const HEAD = ["Имя клиента", "Телефон", "E-mail", "Дата последнего контакта", "Комментарий"];
const DATA: (string | number | { rich: string[] } | { inline: string })[][] = [
  ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", 45901, "Хочет демо"],
  [{ rich: ["Анна ", "Смирнова"] }, "", "anna@demo.test", 45920, ""],
  ["", "+7 900 000-00-03", "", "", "без имени"],
  ["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "", ""],
  ['<b id="pwn">XSS</b>', "", "", "", "x<script>1</script>"],
  [{ inline: "Пётр Инлайн" }, "+7 900 000-00-06", "", "", ""]
];

const file = (data: unknown, name: string): File => new File([data as BlobPart], name, { type: "application/octet-stream" });
const parse = (data: unknown, name: string): Promise<{ ok?: unknown; err?: string }> =>
  parseFile(file(data, name)).then(
    (r) => ({ ok: r }),
    (e: unknown) => ({ err: e instanceof Error ? e.message : String(e) })
  );

describe("разбор .xlsx", () => {
  it("deflate: заголовки, shared strings, серийная дата → ISO, rich text склеен, фонетика отброшена", async () => {
    const r = (await parse(buildXlsx([HEAD, ...DATA]), "база.xlsx")).ok as { headers: string[]; rows: string[][]; total: number; truncated: boolean };
    expect(r.headers).toEqual(HEAD);
    expect(r.rows[0]).toEqual(["Иван Петров", "+7 900 000-00-01", "ivan@demo.test", "2025-09-01", "Хочет демо"]);
    expect(r.rows[1]).toEqual(["Анна Смирнова", "", "anna@demo.test", "2025-09-20", ""]);
    expect(r.rows[5]?.[0]).toBe("Пётр Инлайн");
    expect(r.total).toBe(6);
    expect(r.truncated).toBe(false);
  });
  it("без сжатия (method 0) даёт тот же результат", async () => {
    const a = (await parse(buildXlsx([HEAD, ...DATA]), "a.xlsx")).ok as { rows: string[][] };
    const b = (await parse(buildXlsx([HEAD, ...DATA], { store: true }), "b.xlsx")).ok as { rows: string[][] };
    expect(b.rows).toEqual(a.rows);
  });
  it("первый лист ищется по связи workbook→rels (r:id), а не по имени", async () => {
    const r = (await parse(buildXlsx([["Имя"], ["Пётр"]]), "wb.xlsx")).ok as { rows: string[][] };
    expect(r.rows[0]?.[0]).toBe("Пётр");
  });
});

describe("разбор .csv", () => {
  it("UTF-8 с BOM, разделитель «;»", async () => {
    const csv = "\uFEFFИмя;Телефон;Email\r\nИван;+7 1;i@demo.test\r\nАнна;;a@demo.test\r\n";
    const r = (await parse(Buffer.from(csv, "utf8"), "a.csv")).ok as { headers: string[]; rows: string[][] };
    expect(r.headers).toEqual(["Имя", "Телефон", "Email"]);
    expect(r.rows[1]).toEqual(["Анна", "", "a@demo.test"]);
  });
  it("кодировка windows-1251 (Excel RU)", async () => {
    const cp1251 = (s: string): Buffer =>
      Buffer.from([...s].map((ch) => {
        const c = ch.charCodeAt(0);
        return c < 128 ? c : c === 0x401 ? 0xa8 : c === 0x451 ? 0xb8 : c >= 0x410 && c <= 0x44f ? c - 0x410 + 0xc0 : 63;
      }));
    const r = (await parse(cp1251("Имя;Телефон\r\nЁлка Ёжикова;+7 2\r\n"), "ru.csv")).ok as { headers: string[]; rows: string[][] };
    expect(r.headers).toEqual(["Имя", "Телефон"]);
    expect(r.rows[0]?.[0]).toBe("Ёлка Ёжикова");
  });
  it("запятая, кавычки с удвоением и перенос строки внутри ячейки", async () => {
    const r = (await parse(Buffer.from('name,note\n"Иванов, Иван","Сказал ""позвоните""\nзавтра"\nПётр,ok\n'), "q.csv")).ok as { rows: string[][] };
    expect(r.rows[0]).toEqual(["Иванов, Иван", 'Сказал "позвоните"\nзавтра']);
    expect(r.rows[1]?.[0]).toBe("Пётр");
  });
  it("лимит строк: 2500 → 2000, total=2500, truncated", async () => {
    const big = "Имя\n" + Array.from({ length: 2500 }, (_, i) => `Клиент ${i}`).join("\n");
    const r = (await parse(Buffer.from(big), "big.csv")).ok as { rows: string[][]; total: number; truncated: boolean };
    expect(r.rows.length).toBe(MAX_ROWS);
    expect(r.total).toBe(2500);
    expect(r.truncated).toBe(true);
  });
  it("разделитель «;» и таб определяются по первой строке (равные счётчики — первый в списке)", () => {
    expect(parseCsv("a,b;c\n1,2;3")).toEqual([["a,b", "c"], ["1,2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("decodeText: чистый utf-8 без BOM проходит как есть", () => {
    expect(decodeText(Buffer.from("Имя;Телефон", "utf8"))).toBe("Имя;Телефон");
  });
});

describe("ошибки и защита", () => {
  it("неподдерживаемое расширение, размер, пустой файл", async () => {
    expect(/xlsx и .csv/.test((await parse(Buffer.from("x"), "doc.pdf")).err ?? "")).toBe(true);
    expect(/больше 5 МБ/.test((await parse(Buffer.alloc(5 * 1024 * 1024 + 1), "big.xlsx")).err ?? "")).toBe(true);
    expect(/пустой/.test((await parse(Buffer.alloc(0), "e.csv")).err ?? "")).toBe(true);
  });
  it("не ZIP под видом .xlsx", async () => {
    const r = await parse(Buffer.from("это точно не zip-архив ".repeat(10)), "fake.xlsx");
    expect(/не похож на Excel/.test(r.err ?? "")).toBe(true);
  });
  it("zip-бомба: заявленный размер распаковки 50 МБ отклонён", async () => {
    const r = await parse(buildXlsx([HEAD, ...DATA], { entryOpts: { "xl/worksheets/sheet1.xml": { claimUsize: 50 * 1024 * 1024 } } }), "bomb.xlsx");
    expect(/слишком большой/.test(r.err ?? "")).toBe(true);
  });
  it("повреждённый deflate-поток", async () => {
    const r = await parse(buildXlsx([HEAD, ...DATA], { entryOpts: { "xl/worksheets/sheet1.xml": { garbage: true } } }), "broken.xlsx");
    expect(/повреждён/.test(r.err ?? "")).toBe(true);
  });
  it("только заголовки / нет данных", async () => {
    expect(/только заголовки/.test((await parse(buildXlsx([HEAD]), "head.xlsx")).err ?? "")).toBe(true);
    expect(/нет данных/.test((await parse(Buffer.from("\n\n;;\n"), "none.csv")).err ?? "")).toBe(true);
  });
});

describe("автоподбор колонок", () => {
  it("типичные русские заголовки", () => {
    expect(guessMapping(HEAD)).toEqual(["name", "phone", "email", "lastContact", "note"]);
  });
  it("английские заголовки и порядок колонок", () => {
    expect(guessMapping(["Phone", "Email", "Full name"])).toEqual(["phone", "email", "name"]);
  });
  it("без «имени» первая свободная колонка становится именем", () => {
    expect(guessMapping(["Колонка A", "Телефон"])).toEqual(["name", "phone"]);
  });
  it("серийные даты Excel → ГГГГ-ММ-ДД", () => {
    expect(excelSerialToIso(45901)).toBe("2025-09-01");
    expect(excelSerialToIso(45920)).toBe("2025-09-20");
  });
});
