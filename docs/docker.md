# Docker: стек, запуск, обновление, мониторинг

С 2026-11-05 платформа работает в Docker Compose. Один файл `docker-compose.yml` в корне, настройки сервисов в `docker/<сервис>/`, секреты только в `.env` (в git не попадает, образец `.env.example`).

## Сервисы

| Сервис | Зачем | Наружу |
|---|---|---|
| `frontend` | Nuxt SSR (сайт) | `127.0.0.1:3000` |
| `backend` | NestJS API; при старте сам применяет миграции Prisma | `127.0.0.1:3001` |
| `postgres` | база (вместо SQLite), том `postgres-data` | нет (сеть `data`, internal) |
| `redis` | очередь фоновых задач BullMQ (письма, копия); без него те же задачи идут по таймеру внутри `backend` | нет |
| `meilisearch` | полнотекстовый поиск (слова, предложения, формы, игры; личный индекс заметок и картинок только владельцу) | нет |
| `prometheus`, `node-exporter`, `grafana` | метрики сервера, панель «korean-ops» | Grafana `127.0.0.1:3002` (с ноутбука: `ssh -L 3002:127.0.0.1:3002 сервер`) |
| `docker-proxy` | read-only доступ к списку контейнеров и журналам для вкладки «Сервисы» кабинета (запись запрещена) | нет (сеть `docker-ops`, internal) |
| `caddy` | **необязательный** вход «всё в одном» (профиль `edge`) | 80, 443 |

Данные приложения (картинки, миниатюры, файлы календаря, копии) лежат в томе `app-data` (в контейнере `/data`), база в `postgres-data`. `docker compose down` данных не удаляет; `down -v` удаляет **всё**, не запускай его на боевом сервере.

**Страница обслуживания (2026-11-13):** `docker/caddy/maintenance.html` (один файл, без внешних запросов, сама перезагружается каждые 15 секунд). Caddy профиля `edge` отдаёт её из `handle_errors` при 502/503/504 со статусом 503, `Cache-Control: no-store` и `Retry-After: 15` (файл смонтирован в `/srv/maintenance`); для `/api/*` вместо страницы короткий JSON 503. Боевой Caddy вне репозитория: фрагмент для него и команды в `docs/hosting.md`. Тест: `tests/maintenance.test.mjs`.

**Боевой сервер:** на нём уже стоит свой Caddy с тремя сайтами (`meeymirita.ru`, `anitech…`, `korean…`). Видео он больше не раздаёт сам: `/video/*` уходит на `/api/video/*`, файлы лежат на Яндекс.Диске (`docs/disk-and-telegram.md`). В остальном он продолжает работать как раньше: блок `korean.meeymirita.ru` ходит на `127.0.0.1:3000` и `:3001`, а там теперь слушают контейнеры. Менять Caddyfile не нужно, профиль `edge` на сервере не включают (80 и 443 заняты).
Поэтому `trust proxy` бэкенда принимает `X-Forwarded-For` от loopback и частных сетей Docker (`TRUST_PROXY`, `main.ts`): иначе все посетители выглядели бы одним адресом и неверные попытки одного блокировали бы всех, включая владельца.

## Первый запуск с нуля (пустая база)

```
bash scripts/init-env.sh            # .env с новыми случайными паролями
docker compose up -d --build
```
Проверка: `docker compose ps` (все `healthy`), `curl http://127.0.0.1:3001/api/health`. Состояние служб и журналы смотрит владелец в «Кабинет → Сервисы».

## Обновление

**Обычно ничего делать не нужно:** пуш в `main` запускает CI, при зелёном CI сам запускается Deploy (`.github/workflows/deploy.yml`, по SSH выполняет `scripts/deploy.sh` на сервере); при красном CI деплоя нет. Руками на сервере нужно только то, что не лежит в git (правка `.env`, затем `docker compose up -d`). Вручную: `cd /var/sites/korean && bash scripts/deploy.sh` или Actions → Deploy → Run workflow. Скрипт проверяет, что в папке нет правок, делает `git pull --ff-only`, **копию базы**, собирает образы, перезапускает изменившиеся службы, ждёт ответа API и сайта и открывает проверочные страницы (главная, `/dict`, слово `학교`, `sitemap_index.xml`; список в `SMOKE_URLS`). Не ответили или страница не открылась: `git reset --hard` на прежний коммит, пересборка и запуск прежней версии, ошибка в конце. Параметры `--force`, `--no-restart`, `--no-backup`. Тест `tests/deploy.test.mjs`.
Миграции базы идут вперёд при старте `backend` (`prisma migrate deploy`). Откат кода не откатывает схему: новую миграцию делай так, чтобы прежний код с ней работал (только добавлять столбцы и таблицы; за этим следит `tests/migrations.test.mjs`), а восстановление базы при крайней необходимости из копии.

## Резервные копии и восстановление

- В образ `backend` кроме `pg_dump` ставятся `ffmpeg` и `yt-dlp` для музыкального плеера (`docs/music.md`); `yt-dlp` обновляется при каждой пересборке образа.
- Внутри `backend`: ночной `pg_dump` в `/data/backups/app-ДАТА.dump` (30 штук) и полный зашифрованный архив на Яндекс.Диск (почта только запасной путь, `docs/backup.md`; внутри `pg_dump`).
- На хосте: `bash scripts/backup-docker.sh` (таймер: `scripts/install-backup-timer.sh`) делает снимок базы с проверкой, файлы жёсткими ссылками, копию `.env`, складывает в `/var/backups/korean` (14 штук), пишет `backup-status.json` и `backup.prom` для Grafana; `OFFSITE_RSYNC=user@host:/путь` в `.env` отправляет копии на другой сервер.
- Восстановление базы из `app.dump`: `docker compose stop backend frontend`, `docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U korean -d korean < app.dump`, `docker compose up -d`. Файлы вернуть в том `app-data`: `docker compose cp ПАПКА/files/. backend:/data/` (потом `docker compose exec -u root backend chown -R node:node /data`).
- Репетируй восстановление в отдельном проекте (`COMPOSE_PROJECT_NAME=проба`, другие порты в `.env`), а не на боевом.

## Мониторинг

Prometheus собирает метрики `backend` (`/api/metrics`: запросы, ошибки, задержка; снаружи он закрыт: ответ 404 на запросы с заголовками прокси (`X-Forwarded-For`) и не с частного адреса, `isInternal` в `backend/src/security.ts`), `node-exporter` (процессор, память, диск, сеть, время работы, `backup.prom`), саму нагрузку по службам (процессор и память каждого контейнера: бэкенд раз в 15 секунд читает её у Docker через read-only прокси, метрики `service_cpu_percent` и `service_memory_bytes`) и себя.
Grafana (`admin` и `GRAFANA_PASSWORD` из `.env`) уже настроена: источник и панель «우리말: нагрузка и состояние» подключаются сами и открываются сразу при входе. В ней: плитки «Сейчас» (сайт, процессор, память, диск, запросы, время работы), нагрузка сервера по видам работы, память, сеть, диск, load average, процессор и память по контейнерам, запросы, время ответа и ошибки сайта, давность последней резервной копии. Правки панели в Grafana не сохраняются (файл `docker/grafana/dashboards/operations.json` главный): меняй файл и делай `docker compose restart grafana`. Учебную статистику в Grafana не собираем: она красивее в кабинете.

**Тревоги** (`docker/grafana/provisioning/alerting`): Grafana сама проверяет раз в минуту и пишет в тему «Тревоги» группы Telegram (мимо сервера сайта, чтобы сообщить и о его падении), а когда всё вернулось, шлёт «снова в порядке»; о той же беде напоминает не чаще раза в 12 часов.
| Тревога | Условие |
|---|---|
| Сервер сайта не отвечает | `up{job="backend"}` меньше 1 дольше 3 минут |
| Диск заполнен | занято больше 85% дольше 10 минут |
| Копия базы старая | последняя удачная копия старше 2 дней (или её нет) |
| Растут ошибки 5xx | больше 5 за 10 минут |
| Много ненайденных слов словаря | больше 30 ответов 404 на `/api/dict/word/*` за час (метрика `dict_word_not_found_total`): возможны битые адреса в карте сайта |

Пороги меняются в `rules.yml` (в интерфейсе Grafana правила из файла только для чтения). Данные Telegram берутся из тех же `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_ID` (или `TELEGRAM_CHAT_ID`) и `TELEGRAM_TOPIC_ALERT` в `.env`: их вписывает в адрес тревог `docker/grafana/start.sh` при запуске контейнера (через `$ПЕРЕМЕННУЮ` в файле нельзя: Grafana превращает номер чата в число и не стартует). Проверить: Grafana → Alerting → Alert rules (папка Operations), кнопка Test у адреса `telegram-alerts` в Contact points.
В Prometheus (`/targets`) видно, кто отдаёт данные (все должны быть `UP`), запросы вводятся на вкладке Query (например `up`).

## Поиск (Meilisearch)

Публичный индекс собирается из статического каталога сайта (слова, грамматика, предложения, буквы, формы, игры, справочники); личный (`owner-materials`) из заметок и галереи в PostgreSQL, ответ содержит только id.
**Локальный поиск сайта главный, индекс только дополняет:** он находит и по части слова, и по переводам (Meilisearch ищет по началу слова, но прощает опечатки), поэтому результаты индекса добавляются к локальным без дублей, а не заменяют их (`mergeSearchResults` в `search.ts`, тест `frontend/test/search-index.spec.ts`). Индекс подключён в общем поиске (⌘K, «Справочник»), каталоге игр и поиске по заметкам и картинкам кабинета; списки «Слова», «Предложения», «Формы» ищут локально. Пустой или недоступный Meilisearch ничего не ломает.
**Второй индекс `krdict`** (большой словарь `/dict`, 53 149 слов) собирает `backend` сам при старте из `krdict_ko_ru.json` в `DATA_DIR` (если пометки `krdict_ko_ru.json.indexed` нет или формат индекса `INDEX_VERSION` другой), около 15–30 секунд; пока идёт сборка, словарь отвечает «индексируется». Подробно: `docs/dict.md`.
Пересобрать публичный индекс после изменения каталога: «Кабинет → Сервисы → Пересобрать индекс» (после первого деплоя нажми один раз). Ключ Meilisearch есть только у `backend`.

## Данные для тестов и локальной проверки

`npm test` нужны PostgreSQL, Redis, Meilisearch и `pg_dump` 17+ (на macOS `brew install libpq`, путь `/opt/homebrew/opt/libpq/bin`). Настройки как в `.github/workflows/ci.yml`. Поднять временные службы, прогнать, убрать:
```
docker run -d --rm --name kt-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=korean_test -p 5432:5432 postgres:17-alpine
docker run -d --rm --name kt-redis -p 6379:6379 redis:7.4-alpine
docker run -d --rm --name kt-meili -e MEILI_ENV=development -e MEILI_MASTER_KEY=ci-meilisearch-master-key -p 7700:7700 getmeili/meilisearch:v1.12
export PATH="/opt/homebrew/opt/libpq/bin:$PATH" DATABASE_URL=postgresql://postgres:postgres@localhost:5432/korean_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/korean_test REDIS_URL=redis://localhost:6379 MEILISEARCH_URL=http://localhost:7700 MEILISEARCH_MASTER_KEY=ci-meilisearch-master-key
npm --prefix backend run db:migrate    # обязательно: иначе тесты сервера падают с «relation … does not exist»
npm test
docker stop kt-pg kt-redis kt-meili
```
Раньше иногда падали тесты напоминаний (`reminder-server`, `lesson-server`): два тика подряд могли послать два письма. С 2026-11-14 тики не накладываются (`ticking` в `reminder.service.ts` и `lesson.service.ts`), нестабильности нет; если упадёт снова, это новая ошибка.

## Свои адреса для сервисов (Grafana, Prometheus, Meilisearch)

Сервисы слушают только `127.0.0.1`, наружу их открывает хостовый Caddy. DNS-записи A на сервер: `grafana.korean`, `prometheus.korean`, `search.korean` (зона `meeymirita.ru`). Страница «Сервисы» в кабинете (`/korean/services`) ссылается на все три.

1. **Настройки в `.env`** (Grafana нужен её внешний адрес, иначе вход уводит на localhost):
```
sed -i 's|^GRAFANA_URL=.*|GRAFANA_URL=https://grafana.korean.meeymirita.ru|' .env
grep -q '^GRAFANA_URL=' .env || echo 'GRAFANA_URL=https://grafana.korean.meeymirita.ru' >> .env
docker compose up -d
```
2. **Логин и пароль для Prometheus и Meilisearch** (у них своего входа нет, закрываем паролем Caddy; пароль покажется один раз, сохрани его):
```
PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20); HASH=$(caddy hash-password --plaintext "$PASS"); echo "логин: korean  пароль: $PASS"
```
3. **Блоки в `/etc/caddy/Caddyfile`** (в той же консоли, где выполнен шаг 2, чтобы `$HASH` был известен):
```
cat >> /etc/caddy/Caddyfile <<BLOCKS

grafana.korean.meeymirita.ru {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3002
}

prometheus.korean.meeymirita.ru {
	basic_auth {
		korean $HASH
	}
	reverse_proxy 127.0.0.1:9090
}

search.korean.meeymirita.ru {
	basic_auth {
		korean $HASH
	}
	reverse_proxy 127.0.0.1:7700
}
BLOCKS
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```
В старом Caddy (до 2.8) директива называется `basicauth` вместо `basic_auth`. У Grafana свой вход (`admin` и `GRAFANA_PASSWORD` из `.env`). У Meilisearch в боевом режиме нет веб-панели: адрес `/health` показывает состояние, а API требует ключ `MEILI_MASTER_KEY`.
**Swagger** (`https://swagger.korean.meeymirita.ru/api/docs`): нужна A-запись `swagger.korean` в DNS, строка `SWAGGER=1` в `.env` (`docker compose up -d backend`) и блок в Caddy. Страница документации отдаётся без токена, поэтому её закрываем паролем Caddy, а остальной API на этом адресе остаётся под обычным токеном (кнопка «Try it out» работает с вашим токеном):
```
swagger.korean.meeymirita.ru {
	@docs path /api/docs*
	basicauth @docs {
		korean ТУТ_ХЭШ_ПАРОЛЯ
	}
	reverse_proxy 127.0.0.1:3001
}
```
Хэш тот же, что в блоках Prometheus и поиска (строка после `korean ` в `/etc/caddy/Caddyfile`). Без `SWAGGER=1` страницы нет, ссылка отдаст 404.
PostgreSQL и Redis наружу не открываем никогда: их смотрят через SSH-туннель.

**Память и версии образов (2026-11-10).** У `meilisearch`, `prometheus` и `grafana` стоит потолок памяти (`mem_limit`: 1 ГБ, 512 МБ, 512 МБ; меняется в `.env`: `MEILI_MEM_LIMIT`, `PROMETHEUS_MEM_LIMIT`, `GRAFANA_MEM_LIMIT`). В `.env.example` образы закреплены до младшей версии: `postgres:17.11-alpine`, `redis:7.4.12-alpine`, `getmeili/meilisearch:v1.12.8`, `caddy:2.11.9-alpine`. Боевой сервер берёт версии из своего `.env`: чтобы закрепить их там, владелец правит `.env` и делает `docker compose up -d`.

**Prisma без `dotenv` (2026-11-10).** `backend/prisma.config.ts` читает `DATABASE_URL` из окружения. В контейнере его даёт Compose, в CI переменная задана, локально скрипты `db:generate`, `db:migrate`, `db:dev` запускают Prisma через `node --env-file-if-exists=.env` (файл `backend/.env`, если он есть).
