import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Корень проекта — эта папка (web/). Без этого Next принимает за корень родительскую папку, если там лежит свой
  // package-lock.json (например, у демо-прототипа), и предупреждает о нескольких lockfile.
  outputFileTracingRoot: path.resolve(process.cwd())
};

export default nextConfig;
