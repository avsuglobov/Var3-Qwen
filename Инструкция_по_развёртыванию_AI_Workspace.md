# AI Workspace — инструкция по развёртыванию

> **[ПРОМТ ПРОДОЛЖЕНИЯ — не удалять]** Полный промт для нового чата (этапы 16–20, прод-контур) хранится в корне репозитория: [continuation-prompt.md](continuation-prompt.md). Версия от 2026-11-27.

Приложение: личный кабинет AI-сотрудников (вариант 3), Next.js 15 в каталоге `web/` репозитория.
Версия для развёртывания: **`main @ 1f9873b`** — этап 5 (финальный a11y-аудит), все PR #1–#11 смержены.
Повторная верификация этой версии выполнена 2026-11-25: `npm ci` ✓, `npm run check` ✓ (247 unit-проверок), `npm run build` ✓, полный `npm run e2e` ✓ (418 проверок, 14 наборов).

Статическое состояние не используется: это серверное приложение — один Node-процесс обслуживает и интерфейс, и REST API (`app/api/*`). Внешних служб (СУБД, брокеров) не требуется; всё изменяемое состояние — один файл `web/.data/db.json` (формат `aiws-db-v2`). Прототип `download/` на сервер не переносится.

---

## 1. Требования

| Компонент | Требование | Примечание |
| --- | --- | --- |
| ОС | Ubuntu 22.04/24.04 LTS или Debian 12 | любой Linux с systemd; команды даны для Debian-семейства |
| Node.js | **не ниже 22.12** (поле `engines`) | vitest 5 и vite 8 на более старых не работают; `node -v` → 22.x |
| npm | 10.x (в составе Node 22) | установка строго по lock-файлу через `npm ci` |
| RAM | 1 ГБ минимум, 2 ГБ рекомендуется | `next build` укладывается в ~1,5 ГБ пика; на 1 ГБ добавьте swap 2 ГБ |
| Диск | 2 ГБ | node_modules, сборка `.next`, логи, файл данных |
| Сеть | входящие 22, 80, 443 | приложение слушает `127.0.0.1:3000`, наружу порт 3000 не публикуется |
| Git | 2.x | для закрытого репозитория — deploy-ключ только на чтение |

Подготовка сервера (Debian-семейство):

```bash
sudo adduser --disabled-password aiws
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node -v   # ожидается v22.x (>= 22.12)
```

При 1 ГБ памяти — перед сборкой добавьте swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

## 2. Получение кода

**Вариант A — из GitHub** (репозиторий доступен для чтения):

```bash
sudo mkdir -p /opt/aiws && sudo chown aiws:aiws /opt/aiws
sudo -u aiws git clone https://github.com/avsuglobov/Var3-Qwen.git /opt/aiws/app
cd /opt/aiws/app/web
```

**Вариант B — из бандла** `var3-final-main.bundle` (полная история `main`, 2 МБ; бандл не требует сети):

```bash
sudo mkdir -p /opt/aiws && sudo chown aiws:aiws /opt/aiws
sudo -u aiws git clone /путь/к/var3-final-main.bundle /opt/aiws/app
cd /opt/aiws/app/web
git checkout main   # в бандле одна ветка main @ 1f9873b
```

Все дальнейшие команды выполняются в каталоге `web/` — `package.json` приложения находится там; запуск npm из корня репозитория подхватил бы манифест прототипа.

## 3. Установка, сборка, первый запуск

```bash
cd /opt/aiws/app/web
npm ci          # установка строго по package-lock.json (воспроизводимая)
npm run build   # production-сборка Next.js в .next (внутри — проверка типов)
```

По желанию — полная проверка окружения: `npm run check` (typecheck + ESLint + 247 unit-тестов + сканер хардкод-цветов).

Первый запуск вручную и контрольные точки:

```bash
PORT=3000 npm start   # в первом терминале
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/overview   # ожидается 200
curl -fsS http://127.0.0.1:3000/api/collections/leads | head -c 200          # JSON-массив демо-лидов
curl -fsS http://127.0.0.1:3000/api/company-profile                          # профиль компании
```

Если запросы вернули данные — интерфейс и REST-слой работают, файл `.data/db.json` создан автоматически и заполнен демонстрационным сидом. Остановите процесс (Ctrl+C) и переведите под systemd.

## 4. Постоянный запуск через systemd

Unit-файл `/etc/systemd/system/aiws.service`:

```ini
[Unit]
Description=AI Workspace (Next.js)
After=network.target

[Service]
Type=simple
User=aiws
Group=aiws
WorkingDirectory=/opt/aiws/app/web
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aiws
systemctl status aiws --no-pager
journalctl -u aiws -f   # журнал приложения в реальном времени
```

Альтернатива без systemd — pm2: `pm2 start npm --name aiws -- start && pm2 save && pm2 startup`.

**Необязательная переменная окружения** (дополнение к записке, поддержка есть в `lib/server/store.ts`): `AIWS_DATA_DIR` — каталог файлового хранилища вместо `web/.data` (например, на отдельном томе). Если задаёте — дайте пользователю `aiws` права на запись в этот каталог.

## 5. Публикация через nginx и HTTPS

Node слушает `127.0.0.1:3000`; наружу — nginx с TLS. Файл `/etc/nginx/sites-available/aiws`:

```nginx
server {
    listen 80;
    server_name aiws.example.ru;          # замените на ваше доменное имя
    client_max_body_size 10m;             # импорт лидов до 5 МБ + запас на служебные поля

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;          # импорт/экспорт снимков могут быть долгими
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/aiws /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d aiws.example.ru   # сертификат и автообновление
```

Панель сбоев `/api/debug` — тестовый инструмент (умеет выводить хранилище из строя и портить файл данных). Если сервер доступен шире доверенного контура, закройте маршрут: внутри `server`-блока, **перед** `location /`:

```nginx
location /api/debug { deny all; }
```

## 6. Данные и резервное копирование

Единственное изменяемое состояние — файл `web/.data/db.json` (формат `aiws-db-v2`). Каталог `.data` исключён из репозитория, обновления кода его не затрагивают. Запись снимка атомарная: обрыв питания не оставляет файл в промежуточном состоянии; повреждённый файл заменяется демо-сидом с восстановлением (сценарий покрыт проверками через `/api/debug`).

```bash
sudo chown -R aiws:aiws /opt/aiws/app/web/.data
# crontab -e от пользователя aiws:
15 3 * * * cp /opt/aiws/app/web/.data/db.json /opt/aiws/backups/db-$(date +\%F).json
40 3 1 * * cp /opt/aiws/app/web/.data/db.json /opt/aiws/backups/monthly/db-$(date +\%F).json
```

Восстановление: остановить службу → вернуть файл из копии → запустить службу.

## 7. Вариант в Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t aiws .
docker volume create aiws_data
docker run -d --name aiws -p 3000:3000 \
  -v aiws_data:/app/web/.data --restart unless-stopped aiws
```

Наружу — тот же nginx (раздел 5); обновление — пересборка образа и замена контейнера, том `aiws_data` сохраняет данные.

## 8. Проверки после развёртывания

Быстрая и безопасная — безбраузерный набор REST-контракта (30 проверок, браузер не нужен):

```bash
cd /opt/aiws/app/web
BASE_URL=http://127.0.0.1:3000 node e2e/api.check.mjs
```

Полный аудит (14 наборов, 418 проверок) — против работающего сервера, с системным Chromium на сервере без графики:

```bash
sudo apt-get install -y chromium
PLAYWRIGHT_MODULE=playwright CHROMIUM_PATH=/usr/bin/chromium \
  BASE_URL=http://127.0.0.1:3000 npm run e2e
```

Важно: наборы намеренно мутируют данные и в конце возвращают хранилище к демо-состоянию сбросом — прогонять на тестовом контуре, не параллельно с ручной проверкой заказчика.

Для локальной разработки полный прогон выполняется из чистого клона: `npm ci` → `npm run check` → `npm run build` → `npx playwright install chromium` → `npm run e2e`. Все четыре шага на версии `1f9873b` повторно пройдены 2026-11-25 без ошибок.

## 9. Обновление и откат

```bash
cd /opt/aiws/app/web
sudo -u aiws git pull
npm ci && npm run build
sudo systemctl restart aiws
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/collections/leads
```

Откат — возврат к предыдущему коммиту и пересборка: `git checkout 1f9873b` → `npm ci && npm run build` → `sudo systemctl restart aiws`. Данные при откате сохраняются (формат `aiws-db-v2` общий, схема читает записи предыдущих версий); при необходимости вернуть и данные — восстановить файл из резервной копии (раздел 6).

## 10. Безопасность тестового контура

1. `/api/debug` закрыт на nginx (`location /api/debug { deny all; }`) при любом доступе посторонних.
2. Node слушает только `127.0.0.1`; наружу — nginx на 80/443; брандмауэр: 22, 80, 443.
3. HTTPS через Let's Encrypt (certbot обновляет автоматически).
4. Служба — от выделенного пользователя `aiws` без прав root; файл данных бэкапится.
5. Репозиторий забирается deploy-ключом только на чтение (для закрытого доступа).

## 11. Чек-лист развёртывания с нуля

- [ ] Пользователь `aiws`, брандмауэр 22/80/443, Node.js ≥ 22.12, при 1 ГБ — swap 2 ГБ
- [ ] Код в `/opt/aiws/app` (GitHub или бандл), работа в `web/`
- [ ] `npm ci` и `npm run build` без ошибок
- [ ] Ручной запуск: `/overview` → 200, `/api/collections/leads` → JSON, `/api/company-profile` → профиль
- [ ] systemd-юнит `aiws` включён и активен, журнал чистый
- [ ] nginx + certbot: домен отвечает по HTTPS, лимит тела 10M
- [ ] `/api/debug` закрыт (если сервер не доверенный)
- [ ] Cron-бэкапы `db.json` настроены, владельцы `.data` — `aiws`
- [ ] `BASE_URL=... node e2e/api.check.mjs` против развёрнутого сервера — зелёный

## 12. Известные ограничения текущей версии

Данные живут в файле, демо-контент помечен бейджем «Демо». Осознанные плейсхолдеры «Скоро» (не блокируют развёртывание): вложения в диалоге; пересчёт аналитики; смена тарифа в настройках; создание курсов в обучении (сейчас — демо-курсы); генерация тестов из материалов хранилища; переключение воронок и статус синхронизации с внешними CRM; реальное подключение интеграций (карточки статусов и сценарий «Запросить интеграцию» есть, внешние сервисы не вызываются).
