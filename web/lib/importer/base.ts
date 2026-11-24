/**
 * Общие константы и ошибка импорта (поведение `../download/importer.js`).
 * Лимиты защищают от огромных файлов и «zip-бомб»; сообщения — понятный русский текст,
 * который показывается пользователю в состоянии «ошибка».
 */

/** Размер файла. */
export const MAX_BYTES = 5 * 1024 * 1024;
/** Размер распакованной части (защита от zip-бомб). */
export const MAX_UNZIP = 20 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const MAX_COLS = 30;

/** Ошибка импорта с понятным русским сообщением (как error.userMessage прототипа). */
export class ImportFailure extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ImportFailure";
    this.cause = cause;
  }
}

export function fail(message: string, cause?: unknown): ImportFailure {
  return new ImportFailure(message, cause);
}

/** Ошибка — сбой импорта (в состояние «ошибка» выводится message), или нет. */
export function isImportFailure(e: unknown): e is ImportFailure {
  return e instanceof ImportFailure;
}
