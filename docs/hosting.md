# Боевой сервер

Ubuntu (`root@se-40678`), проект в `/var/sites/korean`, сайт `https://korean.meeymirita.ru` (отдельный блок в Caddy). Главная `meeymirita.ru` другой проект.
Владелец заходит по SSH сам, Claude доступа не имеет: команды даём текстом, короткие (терминал владельца портит длинные строки), перед правкой конфига просим показать его (`cat`).

## Как это работает
Подробно про стек, перенос данных, копии и мониторинг: `docs/docker.md`. Здесь: сервер, Caddy, защита, диагностика.
| Что | Как |
|---|---|
| Сайт и API | контейнеры `frontend` (`127.0.0.1:3000`) и `backend` (`127.0.0.1:3001`) из `docker-compose.yml`, `restart: unless-stopped` |
| Данные | том `app-data` (картинки, копии), база в томе PostgreSQL; секреты в `.env` проекта (права 600), оба вне git |
| Видео | `/var/sites/korean-video/` (вне git, `deploy.sh` не трогает), хостовый Caddy отдаёт `/video/*` |
| Вход | хостовый Caddy сервера (`/etc/caddy/Caddyfile`, ниже блок сайта), он же обслуживает остальные сайты; Caddy из compose (профиль `edge`) на сервере не включают |
| Docker | Docker Engine и Compose v2 (`docker compose version`) |

## Обновление
`cd /var/sites/korean && bash scripts/deploy.sh`. Скрипт отказывается работать при несохранённых правках, делает `git pull --ff-only`, копию базы, собирает образы, запускает изменившиеся службы и ждёт ответа `/api/health` и сайта до 60 секунд. **Если что-то не ответило или сборка упала, возвращает прежнюю версию.**
Параметры: `--force`, `--no-restart`, `--no-backup`. Telegram-уведомление по желанию: `/etc/korean-deploy.env` с `NOTIFY_TELEGRAM_TOKEN` и `NOTIFY_TELEGRAM_CHAT` (права 600).
Тест: `tests/deploy.test.mjs`. Диагностика: `docker compose ps`, `docker compose logs --tail 50 backend`, `docker compose logs --tail 50 frontend`, `curl http://127.0.0.1:3001/api/health`; то же без консоли в «Кабинет → Сервисы».

## Caddy (`/etc/caddy/Caddyfile`, блок сайта)
```
korean.meeymirita.ru {
    encode zstd gzip
    log {
        output file /var/log/caddy/korean.log {
            mode 640
            roll_size 20MiB
            roll_keep 5
        }
        format json
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
        -Server
    }
    request_body {
        max_size 60MB
    }
    @assets path /_nuxt/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
    @pages path / /index.html /sitemap.xml /robots.txt /manifest.webmanifest
    header @pages Cache-Control "no-cache"
    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle_path /video/* {
        root * /var/sites/korean-video
        header Cache-Control "public, max-age=86400"
        file_server
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```
После правки: `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`. `/api/*` и `/video/*` должны стоять выше общего `handle`. Content-Security-Policy для сайта пока не включён (см. ниже).

## Откат на прежнюю версию (Vue SPA, ветка `main_old`)
`systemctl stop korean-web`; `git checkout -B main origin/main_old`; `mv backend/.env server/.env && mv backend/data server/data`; в `progress.service` вернуть `server/dist/main.js`;
в Caddy прежний `handle` с `root * /var/sites/korean/dist` и `try_files {path} {path}/index.html /index.html`; `npm ci && npm --prefix server ci && npm run build && npm --prefix server run build`; `systemctl daemon-reload && systemctl restart progress`.
Дальше на сервере делали бы обычный деплой из `main_old`. Нужно это только если Nuxt-версия окажется неработоспособной.

## Dependabot
Раз в неделю открывает pull request-ы (`dependabot/...`), CI показывает, ничего ли не сломалось. Крупные обновления (смена первой цифры: TypeScript 7, `@types/node` 26, `actions/checkout` 7) не сливай вслепую;
мелкие (`minor-and-patch`) обычно безопасны. Слил: на сервере `bash scripts/deploy.sh`. Сомневаешься: закрой, Dependabot предложит снова.

## Усиление защиты (делает владелец, всё ещё открыто)
1. **Служба `progress`** в `[Service]`: `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, `ReadWritePaths=/var/sites/korean/backend/data`, `ProtectKernelTunables=true`, `ProtectKernelModules=true`,
   `ProtectControlGroups=true`, `RestrictSUIDSGID=true`, `RestrictNamespaces=true`, `LockPersonality=true`, `MemoryMax=512M`, `TasksMax=200`, `Restart=always`, `RestartSec=3`; `User=` обычный пользователь, не root.
   Потом `systemctl daemon-reload && systemctl restart progress`. Не стартует: `journalctl -u progress -n 50` (скорее всего, путь в `ReadWritePaths` не совпал с `DATA_DIR`).
2. **CSP в Caddy:** `Content-Security-Policy "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"`.
   Nuxt добавляет свои инлайн-скрипты, поэтому проверяй в консоли браузера, что не заблокировано (возможно, понадобится `'unsafe-inline'` в `script-src`).
3. **Брандмауэр и SSH:** `ufw allow 22,80,443/tcp && ufw enable` (порты 3000 и 3001 наружу не открывать), SSH только по ключу (`PasswordAuthentication no`), `apt install fail2ban`.
4. **Токен:** длинный случайный, только в `backend/.env`. Подозрение на утечку: сменить токен, `systemctl restart progress`, гостевые отозвать в кабинете.
5. **Копии:** база копируется сама раз в день на том же диске; полный архив уходит на почту, ночная копия `scripts/backup.sh`: `docs/backup.md`. Копии вне сервера ещё не настроены (`OFFSITE_RSYNC` или `OFFSITE_RCLONE`).
6. **Обновления системы:** `apt update && apt upgrade` раз в месяц, `apt install unattended-upgrades`. Яндекс.Вебмастер и Google Search Console: добавить сайт и `https://korean.meeymirita.ru/sitemap.xml`.

## Журналы в кабинете
Вкладка «Журналы» (владелец) показывает журнал сервера (в памяти, до 2000 строк; полный `journalctl -u progress`) и доступ Caddy. Для Caddy: блок `log` выше, `chmod 640 /var/log/caddy/korean.log`,
пользователя службы в группу `caddy` (`usermod -aG caddy <пользователь>`), `CADDY_LOG_FILE=/var/log/caddy/korean.log` в `backend/.env`, перезапуск службы. Если файл не читается, вкладка пишет почему.

## Приложение и видео
- `frontend/public/sw.js` (приложение, PWA) отдаёт сам Nuxt; поменял логику, подними `VERSION` в файле. Видео-обзор `public/demo.webm` открывается на главной сам один раз за открытое окно браузера (`sessionStorage['demo_auto_shown']`), файл тяжёлый, поэтому в тестах размера он исключён.
- **Видеоуроки** (44 файла, уроки 1–30 курса 양쌤의 한국어 교실, AV1 + Opus, 7,8 ГБ): `lesson-01.mp4` … `lesson-30.mp4`, `lesson-16-1.mp4`, `lesson-16-2.mp4`, `part2-01.mp4` … `part2-13.mp4`.
  Сайт берёт файл по подписи карточки («Урок N», `videoOf` в `src/data/korean/course.ts`); нет файла: заглушка. Заливка с Mac:
  `rsync -avP ~/Movies/Korean-videos/upload/ root@<сервер>:/var/sites/korean-video/` (единственная копия видео у владельца в `~/Movies/Korean-videos/`).
  AV1 не везде играет (Safari, часть iPad); перекодировать: `ffmpeg -i in.mp4 -c:v libx264 -crf 24 -c:a aac -movflags +faststart out.mp4`.
