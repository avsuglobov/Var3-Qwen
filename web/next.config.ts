import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // better-sqlite3 — нативный модуль: исключён из бандла сервера (этап 17), иначе build ломается на .node-биндинге.
  serverExternalPackages: ["better-sqlite3"],
  // Корень проекта — эта папка (web/). Без этого Next принимает за корень родительскую папку, если там лежит свой
  // package-lock.json (например, у демо-прототипа), и предупреждает о нескольких lockfile.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Этап 19: standalone-выход для Docker-образа — сервер и трассировка зависимостей в .next/standalone.
  output: "standalone"
};

export default nextConfig;
