import { describe, expect, it } from "vitest";
import { formatUtc } from "@/lib/clock";
import { APP_NAME, APP_TAGLINE, APP_TAGLINE_SHORT, SIDEBAR_COOKIE } from "@/lib/config";
import { createUiStore } from "@/lib/stores/ui-store";
import { listFiles, read } from "./helpers";

describe("часы UTC", () => {
  it("формат ЧЧ:ММ:СС в UTC независимо от часового пояса", () => {
    expect(formatUtc(new Date(Date.UTC(2026, 10, 16, 3, 4, 5)))).toBe("03:04:05");
    expect(formatUtc(new Date(Date.UTC(2026, 0, 1, 23, 59, 59)))).toBe("23:59:59");
    expect(formatUtc(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe("00:00:00");
  });
});

describe("конфиг названия", () => {
  it("значения заданы; короткий слоган короче полного", () => {
    expect(APP_NAME).toBeTruthy();
    expect(APP_TAGLINE_SHORT.length).toBeLessThan(APP_TAGLINE.length);
    expect(SIDEBAR_COOKIE).toBe("aiws-sidebar");
  });
  it("название продукта не хардкодится вне lib/config.ts", () => {
    const offenders = listFiles(".", [".ts", ".tsx"])
      .filter((f) => !/node_modules|\.next|tests|e2e|scripts|lib[\\/]config\.ts/.test(f))
      .filter((f) => read(f).includes(APP_NAME));
    expect(offenders).toEqual([]);
  });
});

describe("шрифты", () => {
  const fonts = read("lib/fonts.ts");
  it("каждое семейство имеет подмножество с кириллицей (unicode-range U+0400-045F)", () => {
    const cyr = (fonts.match(/U\+0301,U\+0400-045F/g) ?? []).length;
    const latin = (fonts.match(/U\+0000-00FF/g) ?? []).length;
    expect(cyr).toBe(5);
    expect(latin).toBe(5);
  });
});

describe("состояние интерфейса (Zustand)", () => {
  it("начальное значение сайдбара берётся из куки и переключается", () => {
    const s = createUiStore(true);
    expect(s.getState().sidebarCollapsed).toBe(true);
    s.getState().toggleSidebar();
    expect(s.getState().sidebarCollapsed).toBe(false);
    s.getState().setPalette(true);
    s.getState().setMobileNav(true);
    expect(s.getState().paletteOpen && s.getState().mobileNavOpen).toBe(true);
  });
  it("сторы независимы (по одному на запрос)", () => {
    expect(createUiStore(false)).not.toBe(createUiStore(false));
  });
});
