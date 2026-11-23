const pad = (n: number): string => String(n).padStart(2, "0");

/** Время в UTC в формате ЧЧ:ММ:СС (для часов в верхней панели). */
export function formatUtc(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
