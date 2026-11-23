import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig.json держит jsx: "preserve" для Next; для тестов JSX компилируется автоматически (React 17+ runtime)
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" }
});
