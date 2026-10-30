# Хостинг владельца (настроено 2026-10-29, обновлено 2026-10-30, работает)

- Сервер Ubuntu (`root@se-40678`), проект в `/var/sites/korean` (новый каталог), сайт `https://korean.meeymirita.ru` (отдельный блок в Caddy,
  A-запись `korean` в DNS). Главная `meeymirita.ru` — другой проект (`/var/sites/meeymirita_start_page`).
  Владелец сам заходит по SSH; мне доступа нет, поэтому команды ему даём текстом.
- **Обновление одной командой:** `cd /var/sites/korean && bash scripts/deploy.sh`. Скрипт: отказывается работать при несохранённых правках в папке; `git pull --ff-only`; ставит пакеты, если менялись
  `package*.json`; при изменениях в `server/` ставит пакеты сервера, собирает его и перезапускает службу `progress`; собирает сайт (с пререндером); проверяет `/api/health` до 20 секунд;
  **если сервер не ответил или сборка упала, сам возвращает прежнюю версию**, пересобирает и перезапускает. Параметры: `--force` (собрать всё и перезапустить, даже если изменений нет),
  `--no-restart`. Уведомление в Telegram по желанию: файл `/etc/korean-deploy.env` со строками `NOTIFY_TELEGRAM_TOKEN=…` и `NOTIFY_TELEGRAM_CHAT=…` (права `chmod 600`). Тесты: `tests/deploy.test.mjs`.
  Вручную то же самое выглядит так (так делали раньше):
- Обновление сайта вручную: `git pull` → `npm run build` (папка `dist`). Сервер прогресса перезапускать только если менялся
  `server/`: `cd server && npm ci && npm run build`, затем `systemctl restart progress`.
- **Caddy** (`/etc/caddy/Caddyfile`, копия до правки `Caddyfile.bak`), блок сайта:
  `encode zstd gzip`, заголовки безопасности (HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, `-Server`), `request_body max_size 60MB`,
  кэш (`/assets/*` вечный, страницы и карта сайта `no-cache`), `handle /api/* { reverse_proxy 127.0.0.1:3001 }`,
  `handle { root * …/dist; try_files {path} {path}/index.html /index.html; file_server }` (**`{path}/index.html` нужен для готовых страниц SEO**; применено владельцем 2026-10-30,
  `Content-Security-Policy` для сайта пока не включён, копия прежнего Caddyfile: `Caddyfile.bak2`).
  `try_files` обязателен для SPA (иначе прямые ссылки на `/korean/...` дают 404). Для предварительной отрисовки (SEO) строка должна быть такой:
  `try_files {path} {path}/index.html /index.html` (ищет сначала файл, потом готовую страницу раздела, потом общий `index.html`). После правки:
  `caddy validate --config /etc/caddy/Caddyfile` и `systemctl reload caddy`.
- **Сервер прогресса** — служба systemd `progress` (`/etc/systemd/system/progress.service`: `WorkingDirectory=` папка
  проекта, `ExecStart=/usr/bin/node server/dist/main.js`, `Restart=always`, автозапуск включён). pm2 на сервере нет
  (владелец не ставил). Токен лежит в `server/.env` на сервере (не в git, права 600); данные в `server/data/`
  (`app.db` с базой, `uploads/` и `thumbs/` с картинками, `backups/` с ежедневными копиями базы). Диагностика: `systemctl status progress`, `journalctl -u progress -n 20`,
  `curl http://127.0.0.1:3001/api/health`, снаружи `curl https://meeymirita.ru/api/health`. Подключение проверено:
  на странице «Прогресс» статус «подключён · сохранено на сервере».
- **Как давать владельцу команды для терминала:** его терминал переносит длинные строки и портит вставку.
  Давай короткие команды (до ~70 символов), многострочные файлы собирай серией `echo '…' >> $F`, а не `cat <<EOF`
  (отступы при копировании ломают `EOF`), не вставляй команды с отступами в начале строк. Просить показать вывод
  (`cat`, `status`), прежде чем править чужой конфиг (в Caddyfile могут быть другие сайты).
- **Сервер** — NestJS + SQLite, подробно в `docs/server.md`. Нужен Node 22.18+ или 24.12+ (`node -v`): база встроенная (`node:sqlite`),
  но у сервера свои пакеты. После `git pull`, который меняет что-то в `server/`: `cd server && npm ci && npm run build`, затем
  `systemctl restart progress`. Картинки обрабатывает пакет `sharp` (ставится вместе с остальными, готовые сборки для Linux есть).
- **Переход со старого сервера** (один раз): в `/etc/systemd/system/progress.service` заменить `ExecStart` на
  `/usr/bin/node server/dist/main.js`, затем `systemctl daemon-reload && systemctl restart progress`. Старые файлы
  `server/data/progress.json`, `guests.json`, `notes.json` новому серверу не нужны (прогресс начинается с чистого листа); их можно
  удалить или оставить как архив. `server/.env` остаётся прежним.
- **Токен владельца** создать так: `openssl rand -base64 24` (подсказка есть в `server/.env.example`).


## Усиление защиты на хостинге (делает владелец на сервере)

Сервер уже защищает себя сам (см. `docs/server.md`, «Защита»), но часть защиты живёт вне кода. Команды и куски конфигов ниже.

**1. Служба `progress` (systemd).** В `/etc/systemd/system/progress.service`, секция `[Service]`, добавить и затем
`systemctl daemon-reload && systemctl restart progress`:
```
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/sites/korean/server/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
MemoryMax=512M
TasksMax=200
Restart=always
RestartSec=3
```
Если после этого служба не стартует, смотри `journalctl -u progress -n 50`: скорее всего, путь в `ReadWritePaths` не совпал с `DATA_DIR`.
Служба не должна работать от root: `User=` должен быть обычный пользователь.

**2. Caddy** (`/etc/caddy/Caddyfile`, блок сайта). Заголовки для самого сайта и ограничение тела запроса к API:
```
korean.meeymirita.ru {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
        Content-Security-Policy "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        -Server
    }
    request_body {
        max_size 60MB
    }
    # кэш для скорости (и для SEO): файлы с хэшем в имени вечные, значки сутки, страница и карта сайта проверяются каждый раз
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
    @static path /favicon.svg /favicon-32.png /og-image.png /icon-*.png /apple-touch-icon.png
    header @static Cache-Control "public, max-age=86400"
    @pages path / /index.html /sitemap.xml /robots.txt /manifest.webmanifest
    header @pages Cache-Control "no-cache"
    # ... существующие root, try_files и reverse_proxy /api/* остаются как были
}
```
После правки: `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`. Если после CSP что-то не грузится
(шрифты, картинки), открой консоль браузера: там написано, какой источник заблокирован.

**3. Брандмауэр и вход по SSH.** Наружу должны смотреть только 80, 443 и SSH: `ufw allow 22,80,443/tcp && ufw enable`;
порт 3001 наружу не открывать (сервер и так слушает только 127.0.0.1). SSH только по ключу
(`PasswordAuthentication no` в `/etc/ssh/sshd_config`) и `apt install fail2ban`.

**4. Токен владельца**: длинный случайный (`openssl rand -base64 24`), только в `server/.env` на сервере (права `chmod 600 server/.env`),
нигде больше. Подозреваешь утечку: меняй токен и `systemctl restart progress`, гостевые токены отзови в кабинете.

**5. Копии.** База копируется сама раз в день (`server/data/backups`, 30 штук), но это на том же диске: раз в неделю забирай
`server/data/backups` и `server/data/uploads` к себе (`rsync -av сервер:/var/sites/korean/server/data/ ./backup/`).

**6. Обновления системы**: `apt update && apt upgrade` раз в месяц, `apt install unattended-upgrades` для автоматических
обновлений безопасности.
