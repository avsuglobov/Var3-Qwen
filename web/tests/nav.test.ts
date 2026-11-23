import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE, NAV_GROUPS, NAV_ITEMS, findNavItem } from "@/lib/nav";
import { ROOT } from "./helpers";

describe("навигация", () => {
  it("16 разделов с уникальными id и непустыми подписями", () => {
    expect(NAV_ITEMS).toHaveLength(16);
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(16);
    for (const g of NAV_GROUPS) expect(g.label.length).toBeGreaterThan(0);
    for (const i of NAV_ITEMS) {
      expect(i.label.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
      expect(i.stage).toBeGreaterThanOrEqual(2);
      expect(i.stage).toBeLessThanOrEqual(8);
    }
  });
  it("у каждого раздела есть страница app/(app)/<id>/page.tsx", () => {
    for (const i of NAV_ITEMS) expect(fs.existsSync(path.join(ROOT, "app", "(app)", i.id, "page.tsx")), i.id).toBe(true);
  });
  it("маршрут по умолчанию существует; findNavItem", () => {
    expect(findNavItem(DEFAULT_ROUTE)?.label).toBe("Обзор");
    expect(findNavItem("nope")).toBeUndefined();
  });
});
