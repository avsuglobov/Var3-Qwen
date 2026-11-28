# Этап 19: образ приложения. Сборка из каталога web/: docker build -t aiws-web .
# Запуск: docker compose up -d (см. docker-compose.yml — volume для .data, порт только на localhost).
# Multi-stage: deps → build (standalone) → runner без исходников, npm и dev-зависимостей.
# Node ≥ 22.12 (engines, vitest 5 / vite 8). bookworm-slim (glibc): better-sqlite3 ставит prebuilt-биндинг,
# компилятор не нужен; на alpine (musl) prebuilt нет — сборка из исходников, поэтому база не alpine.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 AIWS_DEBUG=
RUN groupadd -r aiws && useradd -r -g aiws -d /app aiws
# standalone-сервер и трассировка зависимостей из сборки
COPY --from=build --chown=aiws:aiws /app/.next/standalone ./
COPY --from=build --chown=aiws:aiws /app/.next/static ./.next/static
# better-sqlite3 исключён из бандла сервера (serverExternalPackages): нативный модуль кладём рядом явно
COPY --from=deps --chown=aiws:aiws /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
RUN mkdir -p /app/.data && chown aiws:aiws /app/.data
# секреты (.data/secrets.json) монтируются снаружи, в образ не попадают
USER aiws
EXPOSE 3000
CMD ["node", "server.js"]
