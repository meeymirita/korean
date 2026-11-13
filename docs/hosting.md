# Боевой сервер

Ubuntu (`root@se-40678`), проект в `/var/sites/korean`, сайт `https://korean.meeymirita.ru` (отдельный блок в Caddy). Главная `meeymirita.ru` другой проект.
Владелец заходит по SSH сам, Claude доступа не имеет: команды даём текстом, короткие (терминал владельца портит длинные строки), перед правкой конфига просим показать его (`cat`).

## Как это работает
Подробно про стек, обновление, копии и мониторинг: `docs/docker.md`. Здесь: сервер, Caddy, защита, диагностика.
| Что | Как |
|---|---|
| Сайт и API | контейнеры `frontend` (`127.0.0.1:3000`) и `backend` (`127.0.0.1:3001`) из `docker-compose.yml`, `restart: unless-stopped` |
| Данные | том `app-data` (картинки, копии), база в томе PostgreSQL; секреты в `.env` проекта (права 600), оба вне git |
| Видео | на Яндекс.Диске, папка `korean_video`; хостовый Caddy шлёт `/video/*` на `/api/video/*` (`docs/disk-and-telegram.md`). Старая `/var/sites/korean-video/` не нужна |
| Вход | хостовый Caddy сервера (`/etc/caddy/Caddyfile`, ниже блок сайта), он же обслуживает остальные сайты; Caddy из compose (профиль `edge`) на сервере не включают |
| Docker | Docker Engine и Compose v2 (`docker compose version`) |

## Обновление
**Обычно автоматически:** пуш в `main` → CI → при зелёном CI сам запускается Deploy (GitHub Actions, по SSH выполняет `scripts/deploy.sh`); при красном CI деплоя нет. Вручную: `cd /var/sites/korean && bash scripts/deploy.sh` (или Actions → Deploy → Run workflow). Скрипт отказывается работать при несохранённых правках, делает `git pull --ff-only`, копию базы, собирает образы, запускает изменившиеся службы и ждёт ответа `/api/health` и сайта до 60 секунд. **Если что-то не ответило или сборка упала, возвращает прежнюю версию.**
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
    @pages path / /index.html /sitemap.xml /robots.txt /manifest.webmanifest
    header @pages Cache-Control "no-cache"
    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle_path /video/* {
        rewrite * /api/video{path}
        reverse_proxy 127.0.0.1:3001
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```
После правки: `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`. `/api/*` и `/video/*` должны стоять выше общего `handle`. Content-Security-Policy сайт ставит сам (пока в режиме отчёта, см. ниже), в Caddy её не добавляй. Строку `@assets … immutable` не добавляй: Caddy навешивал её и на 404 и 502 во время деплоя, и браузеры запоминали ошибку на год (Nuxt сам ставит нужный заголовок на найденные файлы).

### Страница обслуживания на время деплоя (вставляет владелец руками)
Пока контейнеры перезапускаются, Caddy отдаёт голый 502. Страница `docker/caddy/maintenance.html` (самодостаточная, сама обновляется раз в 15 секунд) это исправляет. Хостовый Caddy вне репозитория, поэтому делается руками:
```
mkdir -p /var/www/maintenance
cp /var/sites/korean/docker/caddy/maintenance.html /var/www/maintenance/
```
В блок `korean.meeymirita.ru` перед закрывающей `}` добавить:
```
    handle_errors {
        @down expression {http.error.status_code} in [502, 503, 504]
        handle @down {
            header Cache-Control "no-store"
            header Retry-After "15"
            @api path /api/*
            handle @api {
                respond `{"error":"maintenance"}` 503
            }
            handle {
                root * /var/www/maintenance
                rewrite * /maintenance.html
                file_server {
                    status 503
                }
            }
        }
    }
```
Дальше `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`. `no-store` обязателен: иначе браузер запомнит ошибку (см. предупреждение про `@assets` выше). Файл после правки в репозитории копируй заново. Проверка: `docker compose stop frontend`, открыть сайт (страница с 우리말), `docker compose start frontend`.

## Dependabot
Раз в неделю открывает pull request-ы (`dependabot/...`), CI показывает, ничего ли не сломалось. Крупные обновления (смена первой цифры: TypeScript 7, `@types/node` 26, `actions/checkout` 7) не сливай вслепую;
мелкие (`minor-and-patch`) обычно безопасны. Слил в `main`: выкладка пойдёт сама после зелёного CI. Сомневаешься: закрой, Dependabot предложит снова.

## Усиление защиты (делает владелец, всё ещё открыто)
1. **Контейнеры:** приложение работает не от root (пользователь `node`), порты сайта и API слушают только `127.0.0.1`, база, Redis и поиск во внутренней сети Docker без выхода наружу, Docker-сокет доступен только через read-only прокси (`docs/docker.md`). Делать здесь больше нечего.
2. **CSP сайта** (`frontend/src/nitro/plugins/csp.ts`): сайт сам ставит заголовок на каждую страницу: только свои файлы, а встроенные скрипты Nuxt разрешены по хэшу (без `'unsafe-inline'` для скриптов).
   Сейчас режим «только отчёт» (`Content-Security-Policy-Report-Only`): браузер ничего не блокирует, а нарушения шлёт на `POST /api/csp-report` (`backend/src/csp-report.controller.ts`), они попадают в журнал событий строкой `csp` (не больше 20 новых в час).
   Включить блокировку: через неделю без записей `csp` в журнале добавь в `.env` на сервере `CSP_ENFORCE=1` и выполни `docker compose up -d frontend`. Готовые заранее страницы (`/about`, `/history`) отдаются файлами без этого заголовка. В Caddy отдельную CSP не добавляй: две политики складываются.
3. **Брандмауэр и SSH:** `ufw allow 22,80,443/tcp && ufw enable` (порты 3000 и 3001 наружу не открывать), SSH только по ключу (`PasswordAuthentication no`), `apt install fail2ban`.
4. **Токен:** длинный случайный, только в `.env` проекта (права 600). Подозрение на утечку: сменить `PROGRESS_TOKEN` в `.env`, `docker compose up -d`, гостевые токены отозвать в кабинете.
5. **Копии:** ночной `pg_dump` внутри `backend`, копия на хост (`scripts/backup-docker.sh`, таймер) и полный архив на Яндекс.Диск: `docs/backup.md`. Копии вне сервера не настроены (`OFFSITE_RSYNC` в `.env`, если понадобится).
6. **Обновления системы:** `apt update && apt upgrade` раз в месяц, `apt install unattended-upgrades`. Яндекс.Вебмастер и Google Search Console: добавить сайт и `https://korean.meeymirita.ru/sitemap.xml`.

## Приложение и видео
- `frontend/public/sw.js` (приложение, PWA) отдаёт сам Nuxt; поменял логику, подними `VERSION` в файле. Видео-обзор `public/demo.webm` открывается на главной только по ссылке (само при заходе не показывается с 2026-11-09), файл тяжёлый, поэтому в тестах размера он исключён.
- **Видеоуроки** (44 файла, уроки 1–30 курса 양쌤의 한국어 교실, AV1 + Opus, 7,8 ГБ) лежат на Яндекс.Диске в папке `korean_video`: `lesson-01.mp4` … `lesson-30.mp4`, `lesson-16-1.mp4`, `lesson-16-2.mp4`, `part2-01.mp4` … `part2-13.mp4`.
  Сайт берёт файл по подписи карточки («Урок N», `videoOf` в `src/data/korean/course.ts`); нет файла: заглушка. Новое видео: положить на Диск в `korean_video` руками или `node scripts/upload-videos.mjs [папка]` (копия видео у владельца в `~/Movies/Korean-videos/`).
  AV1 не везде играет (Safari, часть iPad); перекодировать: `ffmpeg -i in.mp4 -c:v libx264 -crf 24 -c:a aac -movflags +faststart out.mp4`.


## Яндекс.Диск, Telegram, вход на 4 часа
Диск, раздача видео через Caddy, сеанс входа, поломки: `docs/disk-and-telegram.md`. Уведомления в Telegram: `docs/telegram.md`.
