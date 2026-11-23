import { describe, expect, it } from "vitest";
import { contrast, cssBlock, read, tokens } from "./helpers";

const css = read("styles/globals.css");
const light = tokens(cssBlock(css, ":root"));
const dark = tokens(cssBlock(css, ".dark"));

const REQUIRED = [
  "background", "card", "popover", "foreground", "muted", "muted-foreground", "border", "input", "ring", "primary", "primary-foreground", "destructive",
  "elevated", "status", "critical", "font-heading", "font-ui", "font-data", "radius-sm", "radius-md", "shadow-pop"
];

describe("токены тем (спецификация из промта)", () => {
  it("обе темы определяют одинаковый набор токенов", () => {
    const keys = (t: Record<string, string>) => Object.keys(t).filter((k) => !["sidebar-w", "sidebar-w-collapsed", "topbar-h", "content-max", "radius-card"].includes(k));
    const onlyLight = Object.keys(light).filter((k) => !(k in dark) && !["sidebar-w", "sidebar-w-collapsed", "topbar-h", "content-max"].includes(k));
    const onlyDark = Object.keys(dark).filter((k) => !(k in light));
    expect(onlyLight).toEqual([]);
    expect(onlyDark).toEqual([]);
    expect(keys(light).length).toBeGreaterThan(20);
  });

  it("есть все обязательные токены shadcn и собственные", () => {
    for (const k of REQUIRED) {
      expect(light[k], `light: ${k}`).toBeTruthy();
      expect(dark[k], `dark: ${k}`).toBeTruthy();
    }
  });

  it("светлая «Тёплая редакция»: цвета ровно по спецификации", () => {
    expect(light).toMatchObject({
      background: "#FAF7F2", card: "#FFFFFF", muted: "#F3EEE5", elevated: "#F3EEE5", border: "#E7E1D6", foreground: "#1A1A17",
      "muted-foreground": "#6B675F", primary: "#B8431A", "primary-foreground": "#FFFFFF", critical: "#B3261E", status: "#1F5C4A"
    });
    expect(light["radius-card"]).toBe("12px");
    expect(light["radius-sm"]).toBe("8px");
    expect(light["shadow-pop"]).toBe("0 8px 24px rgba(26, 26, 23, 0.12)");
  });

  it("тёмная «Fincher Monitor»: цвета ровно по спецификации", () => {
    expect(dark).toMatchObject({
      background: "#0B0D0E", card: "#14171A", muted: "#1E2226", elevated: "#1E2226", border: "#262B30", foreground: "#D8DEE4",
      "muted-foreground": "#7A858E", primary: "#C88A36", "primary-foreground": "#0B0D0E", critical: "#B8332A", status: "#3A6B5C"
    });
  });

  it("тёмная: радиусы только 2px и 4px, одна тень, анимация 150 мс без bounce", () => {
    expect([dark["radius-sm"], dark["radius-md"], dark["radius-chip"]]).toEqual(["2px", "2px", "2px"]);
    expect(dark["radius-card"]).toBe("4px");
    expect(dark["shadow-pop"]).toBe("0 4px 12px rgba(0, 0, 0, 0.7)");
    expect(dark["motion-fast"]).toBe("150ms");
    expect(dark["ease"]).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });

  it("шрифты: светлая — Fraunces/Geist/Geist Mono, тёмная — Inter/JetBrains Mono; кириллица в каждом стеке", () => {
    expect(light["font-heading"]).toMatch(/fraunces.*serif-cyr/);
    expect(light["font-ui"]).toMatch(/geist-latin.*geist-cyr/);
    expect(light["font-data"]).toMatch(/geist-mono-latin.*geist-mono-cyr/);
    expect(dark["font-heading"]).toMatch(/inter-latin.*inter-cyr/);
    expect(dark["font-ui"]).toMatch(/inter-latin.*inter-cyr/);
    expect(dark["font-data"]).toMatch(/jetbrains-latin.*jetbrains-cyr/);
  });

  it("тёмная: метки секций моно UPPERCASE 10–11px, tracking .08em; зерно и лампа только в тёмной", () => {
    expect(css).toMatch(/\.dark \.section-label\s*\{[^}]*letter-spacing:\s*0\.08em[^}]*uppercase/);
    expect(css).toMatch(/\.dark \.section-label\s*\{[^}]*font-size:\s*10\.5px/);
    expect(dark["font-label"]).toContain("--font-data");
    expect(css).toMatch(/\.grain\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.dark \.grain\s*\{[^}]*opacity:\s*0\.025/);
    expect(css).toMatch(/radial-gradient\(ellipse 70% 40% at 50% 0%, var\(--lamp\)/);
    expect(dark["lamp"]).toBe("rgba(216, 222, 228, 0.03)");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.grain[^}]*display:\s*none/);
  });

  it("цвета только в блоках токенов: вне :root/.dark нет hex-литералов", () => {
    let rest = css;
    for (const sel of [":root", ".dark"]) {
      const b = cssBlock(rest, sel);
      rest = rest.replace(b, "");
    }
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe("контраст токенов (WCAG AA)", () => {
  const themes = { light, dark } as const;
  for (const [name, t] of Object.entries(themes)) {
    it(`${name}: текст на основных поверхностях ≥ 4.5:1`, () => {
      expect(contrast(t["foreground"] as string, t["background"] as string)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["foreground"] as string, t["card"] as string)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["muted-foreground"] as string, t["background"] as string)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["muted-foreground"] as string, t["card"] as string)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["primary-foreground"] as string, t["primary"] as string)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}: вторичный текст на приподнятых поверхностях (muted-foreground-strong) ≥ 4.5:1`, () => {
      expect(contrast(t["muted-foreground-strong"] as string, t["muted"] as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("тёмная: исходный text-secondary на elevated < 4.5 — поэтому нужен токен strong", () => {
    expect(contrast(dark["muted-foreground"] as string, dark["muted"] as string)).toBeLessThan(4.5);
  });
  it("тёмная: critical не годится для мелкого текста (< 4.5), только заливка/граница/точка", () => {
    expect(contrast(dark["critical"] as string, dark["card"] as string)).toBeLessThan(4.5);
    expect(contrast(dark["on-critical"] as string, dark["destructive"] as string)).toBeGreaterThanOrEqual(4.5);
  });
});
