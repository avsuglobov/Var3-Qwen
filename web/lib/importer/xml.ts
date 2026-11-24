import { fail } from "@/lib/importer/base";

/**
 * Минимальный XML-парсер для SpreadsheetML (.xlsx): XML машинно-сгенерённый и регулярный,
 * внешние библиотеки не нужны (как в прототипе). Работает и в Node (vitest), и в браузере —
 * DOMParser в Node нет. Поддерживает: вложенность, атрибуты в одинарных/двойных кавычках,
 * самозакрывающиеся теги, XML-сущности; <?…?>, <!--…--> и <!…> пропускает.
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  /** Прямые дочерние элементы. */
  children: XmlElement[];
  /** Конкатенация текстовых узлов элемента (без текста детей). */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g: string) => {
    if (g[0] === "#") {
      const code = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[g] ?? m;
  });
}

const NAME_RE = /[^\s/>=]/;

/** Разбор XML-документа; возвращает корневой элемент. what — имя части файла для сообщения об ошибке. */
export function parseXml(source: string, what: string): XmlElement {
  const root: XmlElement = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlElement[] = [root];
  const top = (): XmlElement => stack[stack.length - 1] ?? root;
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) top().text += decodeEntities(source.slice(i, lt));
    // служебные конструкции: <?…?>, <!--…-->, <!…>
    if (source[lt + 1] === "?" || source[lt + 1] === "!") {
      if (source.startsWith("<!--", lt)) {
        const end = source.indexOf("-->", lt);
        if (end < 0) throw fail(`Повреждён XML внутри .xlsx (${what})`);
        i = end + 3;
      } else {
        const end = source.indexOf(">", lt);
        if (end < 0) throw fail(`Повреждён XML внутри .xlsx (${what})`);
        i = end + 1;
      }
      continue;
    }
    const closing = source[lt + 1] === "/";
    let j = lt + (closing ? 2 : 1);
    let name = "";
    while (j < source.length && NAME_RE.test(source[j] ?? "")) {
      name += source[j];
      j++;
    }
    if (!name) throw fail(`Повреждён XML внутри .xlsx (${what})`);
    if (closing) {
      const el = stack.pop();
      if (!el || el.name !== name || stack.length === 0) throw fail(`Повреждён XML внутри .xlsx (${what})`);
      top().children.push(el);
      i = source.indexOf(">", j);
      if (i < 0) throw fail(`Повреждён XML внутри .xlsx (${what})`);
      i++;
      continue;
    }
    const attrs: Record<string, string> = {};
    let selfClosed = false;
    let end = -1;
    // до конца тега: атрибуты name="…" | name='…'
    while (j < source.length) {
      while (j < source.length && /\s/.test(source[j] ?? "")) j++;
      if (source[j] === "/" && source[j + 1] === ">") {
        selfClosed = true;
        end = j + 2;
        break;
      }
      if (source[j] === ">") {
        end = j + 1;
        break;
      }
      let k = j;
      while (k < source.length && NAME_RE.test(source[k] ?? "")) k++;
      const attrName = source.slice(j, k);
      if (!attrName) throw fail(`Повреждён XML внутри .xlsx (${what})`);
      if (source[k] !== "=") throw fail(`Повреждён XML внутри .xlsx (${what})`);
      k++;
      const q = source[k];
      if (q !== '"' && q !== "'") throw fail(`Повреждён XML внутри .xlsx (${what})`);
      const valEnd = source.indexOf(q, k + 1);
      if (valEnd < 0) throw fail(`Повреждён XML внутри .xlsx (${what})`);
      attrs[attrName] = decodeEntities(source.slice(k + 1, valEnd));
      j = valEnd + 1;
    }
    if (end < 0) throw fail(`Повреждён XML внутри .xlsx (${what})`);
    const el: XmlElement = { name, attrs, children: [], text: "" };
    if (selfClosed) top().children.push(el);
    else stack.push(el);
    i = end;
  }
  if (stack.length !== 1 || root.children.length !== 1) throw fail(`Повреждён XML внутри .xlsx (${what})`);
  const doc = root.children[0];
  if (!doc) throw fail(`Повреждён XML внутри .xlsx (${what})`);
  return doc;
}

/** Все потомки (на любую глубину) с заданным именем — как getElementsByTagName. */
export function findAll(el: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (child.name === name) out.push(child);
      walk(child);
    }
  };
  walk(el);
  return out;
}

/** Первый прямой/вложенный дочерний элемент с именем name (или undefined). */
export function findFirst(el: XmlElement, name: string): XmlElement | undefined {
  return findAll(el, name)[0];
}

/** Весь текст элемента: конкатенация <t> потомков (для sharedStrings/inlineStr), минус <rPh> фонетика. */
export function textOfT(el: XmlElement): string {
  let out = "";
  const walk = (node: XmlElement): void => {
    if (node.name === "rPh") return;
    if (node.name === "t") out += node.text;
    for (const child of node.children) walk(child);
  };
  for (const child of el.children) walk(child);
  return out;
}
