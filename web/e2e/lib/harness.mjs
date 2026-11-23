/* Общая обвязка e2e: запуск `next start` (напрямую через node, чтобы kill() гасил именно сервер), запуск браузера, отчёт. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

export const PORT = process.env.PORT || "3101";
export const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

export async function loadChromium() {
  const mod = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  return mod.chromium ?? mod.default?.chromium;
}

export function startServer() {
  if (process.env.BASE_URL) return null;
  return spawn(process.execPath, [createRequire(import.meta.url).resolve("next/dist/bin/next"), "start", "-p", PORT], { stdio: "ignore", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
}

export async function waitReady(path = "/overview") {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + path)).ok) return; } catch { /* ждём */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("сервер не поднялся: " + BASE);
}

export async function launch() {
  const chromium = await loadChromium();
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_ARGS ? process.env.CHROMIUM_ARGS.split(" ") : ["--no-sandbox"] });
}

export function reporter() {
  const results = [];
  const check = (name, ok, extra) => { results.push({ name, ok: !!ok }); console.log((ok ? "  ok   " : "  FAIL ") + name + (!ok && extra ? " — " + extra : "")); };
  const done = (label) => { const ok = results.every((r) => r.ok); console.log(ok ? `\n${label}: все проверки пройдены (${results.length})` : `\n${label}: есть провалы`); return ok ? 0 : 1; };
  return { check, done };
}
