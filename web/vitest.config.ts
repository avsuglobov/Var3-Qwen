import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig.json держит jsx: "preserve" для Next; для тестов JSX компилируется автоматически (React 17+ runtime)
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // AIWS_DEBUG=1: юнит-тесты вызывают обработчик /api/debug напрямую, в проде он выключен флагом (этап 19)
  test: { include: ["tests/**/*.test.ts"], environment: "node", env: { AIWS_DEBUG: "1" } }
});
