import localFont from "next/font/local";

/**
 * Шрифты через next/font с кириллицей. Файлы лежат в репозитории (лицензия OFL, пакеты @fontsource-variable),
 * поэтому сборка и работа не зависят от сети. Кириллица и латиница — отдельные подмножества с unicode-range:
 * браузер берёт глиф из нужного файла по символу.
 *
 * Важно: у Fraunces нет кириллицы, поэтому в светлой теме для русских заголовков используется Source Serif 4
 * (тёплая «редакционная» антиква с кириллицей); латиница заголовков (название продукта) — Fraunces.
 * next/font требует явных литералов в аргументах, поэтому вызовы выписаны без констант и обёрток.
 */
export const fraunces = localFont({
  src: "../app/fonts/fraunces-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-fraunces",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }]
});
export const sourceSerifCyr = localFont({
  src: "../app/fonts/source-serif-4-cyrillic.woff2",
  weight: "200 900",
  display: "swap",
  variable: "--font-serif-cyr",
  declarations: [{ prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" }]
});
export const geistLatin = localFont({
  src: "../app/fonts/geist-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }]
});
export const geistCyr = localFont({
  src: "../app/fonts/geist-cyrillic.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-cyr",
  declarations: [{ prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" }]
});
export const geistMonoLatin = localFont({
  src: "../app/fonts/geist-mono-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-mono-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }]
});
export const geistMonoCyr = localFont({
  src: "../app/fonts/geist-mono-cyrillic.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-mono-cyr",
  declarations: [{ prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" }]
});
export const interLatin = localFont({
  src: "../app/fonts/inter-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }]
});
export const interCyr = localFont({
  src: "../app/fonts/inter-cyrillic.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter-cyr",
  declarations: [{ prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" }]
});
export const jetbrainsLatin = localFont({
  src: "../app/fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-jetbrains-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }]
});
export const jetbrainsCyr = localFont({
  src: "../app/fonts/jetbrains-mono-cyrillic.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-jetbrains-cyr",
  declarations: [{ prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" }]
});

/** Классы с CSS-переменными всех шрифтов — вешаются на <html>. */
export const fontVariables: string = [
  fraunces, sourceSerifCyr, geistLatin, geistCyr, geistMonoLatin, geistMonoCyr, interLatin, interCyr, jetbrainsLatin, jetbrainsCyr
]
  .map((f) => f.variable)
  .join(" ");
