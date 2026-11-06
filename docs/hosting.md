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

## Dependabot
Раз в неделю открывает pull request-ы (`dependabot/...`), CI показывает, ничего ли не сломалось. Крупные обновления (смена первой цифры: TypeScript 7, `@types/node` 26, `actions/checkout` 7) не сливай вслепую;
мелкие (`minor-and-patch`) обычно безопасны. Слил: на сервере `bash scripts/deploy.sh`. Сомневаешься: закрой, Dependabot предложит снова.

## Усиление защиты (делает владелец, всё ещё открыто)
1. **Контейнеры:** приложение работает не от root (пользователь `node`), порты сайта и API слушают только `127.0.0.1`, база, Redis и поиск во внутренней сети Docker без выхода наружу, Docker-сокет доступен только через read-only прокси (`docs/docker.md`). Делать здесь больше нечего.
2. **CSP в Caddy:** `Content-Security-Policy "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"`.
   Nuxt добавляет свои инлайн-скрипты, поэтому проверяй в консоли браузера, что не заблокировано (возможно, понадобится `'unsafe-inline'` в `script-src`).
3. **Брандмауэр и SSH:** `ufw allow 22,80,443/tcp && ufw enable` (порты 3000 и 3001 наружу не открывать), SSH только по ключу (`PasswordAuthentication no`), `apt install fail2ban`.
4. **Токен:** длинный случайный, только в `.env` проекта (права 600). Подозрение на утечку: сменить `PROGRESS_TOKEN` в `.env`, `docker compose up -d`, гостевые токены отозвать в кабинете.
5. **Копии:** ночной `pg_dump` внутри `backend`, копия на хост (`scripts/backup-docker.sh`, таймер) и полный архив на почту: `docs/backup.md`. Копии вне сервера не настроены (`OFFSITE_RSYNC` в `.env`, если понадобится).
6. **Обновления системы:** `apt update && apt upgrade` раз в месяц, `apt install unattended-upgrades`. Яндекс.Вебмастер и Google Search Console: добавить сайт и `https://korean.meeymirita.ru/sitemap.xml`.

## Приложение и видео
- `frontend/public/sw.js` (приложение, PWA) отдаёт сам Nuxt; поменял логику, подними `VERSION` в файле. Видео-обзор `public/demo.webm` открывается на главной сам один раз за открытое окно браузера (`sessionStorage['demo_auto_shown']`), файл тяжёлый, поэтому в тестах размера он исключён.
- **Видеоуроки** (44 файла, уроки 1–30 курса 양쌤의 한국어 교실, AV1 + Opus, 7,8 ГБ): `lesson-01.mp4` … `lesson-30.mp4`, `lesson-16-1.mp4`, `lesson-16-2.mp4`, `part2-01.mp4` … `part2-13.mp4`.
  Сайт берёт файл по подписи карточки («Урок N», `videoOf` в `src/data/korean/course.ts`); нет файла: заглушка. Заливка с Mac:
  `rsync -avP ~/Movies/Korean-videos/upload/ root@<сервер>:/var/sites/korean-video/` (единственная копия видео у владельца в `~/Movies/Korean-videos/`).
  AV1 не везде играет (Safari, часть iPad); перекодировать: `ffmpeg -i in.mp4 -c:v libx264 -crf 24 -c:a aac -movflags +faststart out.mp4`.


## Яндекс.Диск и Telegram (с 2026-11-06)
Переменные в корневом `.env` (в `docker-compose.yml` они уже проброшены в `backend`; после правки `docker compose up -d`):
`YADISK_TOKEN` (OAuth-токен с правом `cloud_api:disk.app_folder`; получить: `https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>`), `YADISK_ROOT` (папка внутри «Приложения/<название>», пусто = корень),
`YADISK_KEEP=14` (сколько дат копий хранить), `TELEGRAM_BOT_TOKEN` (@BotFather), `TELEGRAM_CHAT_ID` (написать боту `/start`, открыть `https://api.telegram.org/bot<токен>/getUpdates`, взять `message.chat.id`).
Структура Диска: `Копия сайта/Копия ГГГГ-ММ-ДД/korean-….tar.gz.enc` (полный архив, шифрование `BACKUP_PASSPHRASE`), `База и env/База ГГГГ-ММ-ДД/db-env-….tar.gz.enc`, `Картинки/` (картинки, файлы календаря, картинки сайта, обложка визитки одной плоской папкой), `Видео/lesson-01.mp4` …
- Архив после сборки уходит на Диск; почта нужна только как запасной путь. Картинки зеркалятся при загрузке, при старте сервера и раз в час (`POST /api/backup/media-sync` запускает вручную).
- Видео: `node scripts/upload-videos.mjs` (с Mac, продолжает с места остановки; `YADISK_TOKEN` берёт из окружения или `.env`). Чтобы сайт отдавал их с Диска, в Caddy вместо блока `/video/*` с `file_server`:
```
handle_path /video/* {
    rewrite * /api/video{path}
    reverse_proxy 127.0.0.1:3001
}
```
  `/api/video/<имя>.mp4` отвечает 302 на временную ссылку Диска (перемотка работает). Перед переключением убедись, что все 44 файла на Диске.
- Уведомления (код входа, напоминание, подборка, «Сегодня созвон», тревоги копий): Telegram, при сбое или без него почта (`SMTP_*`). Двухфакторная защита с Telegram не требует адреса почты.
