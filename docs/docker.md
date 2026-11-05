# Docker: стек, запуск, перенос данных, мониторинг

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

**Боевой сервер:** на нём уже стоит свой Caddy с тремя сайтами (`meeymirita.ru`, `anitech…`, `korean…`) и видео из `/var/sites/korean-video`. Он продолжает работать как раньше: блок `korean.meeymirita.ru` ходит на `127.0.0.1:3000` и `:3001`, а там теперь слушают контейнеры. Менять Caddyfile не нужно, профиль `edge` на сервере не включают (80 и 443 заняты).
Поэтому `trust proxy` бэкенда принимает `X-Forwarded-For` от loopback и частных сетей Docker (`TRUST_PROXY`, `main.ts`): иначе все посетители выглядели бы одним адресом и неверные попытки одного блокировали бы всех, включая владельца.

## Первый запуск с нуля (пустая база)

```
bash scripts/init-env.sh            # .env с новыми случайными паролями
docker compose up -d --build
```
Проверка: `docker compose ps` (все `healthy`), `curl http://127.0.0.1:3001/api/health`. Состояние служб и журналы смотрит владелец в «Кабинет → Сервисы».

## Перенос текущего сайта (SQLite → PostgreSQL), по шагам

1. **Архив.** «Настройки → Резервные копии → Сделать архив» (или возьми последний с почты), расшифруй (`docs/backup.md`), распакуй: получится папка `korean` с `app.db`, `uploads`, `thumbs`, `site`, `public`, `server.env`.
2. **Код на сервере.** `cd /var/sites/korean && git pull` (ветка с Docker). Docker и Compose v2 на сервере должны стоять (`docker compose version`).
3. **Настройки.** `bash scripts/init-env.sh --from /путь/к/korean/server.env`: токен, почта, пароль архива, ключ чата переносятся как есть (значения не печатаются), пароли PostgreSQL, Redis, Meilisearch, Grafana генерируются заново. Проверь `.env`: `SITE_URL=https://korean.meeymirita.ru`.
4. **Остановить старое.** `systemctl stop progress korean-web` (иначе порты 3000 и 3001 заняты и в старую базу ещё можно писать).
5. **Загрузка.** `bash scripts/import-dump.sh /путь/к/korean`. Скрипт поднимает стек, останавливает сайт и API, переносит базу одной транзакцией и сверяет её с `app.db` (строки, суммы, хэши каждой таблицы; любое расхождение откатывает перенос), копирует файлы в том `app-data`, запускает сайт и проверяет, что каждая картинка из базы есть на диске. Скрипт безопасно запускать повторно (`--replace` заменяет уже загруженное). `app.db` он не меняет.
6. **Проверка глазами.** Открой сайт, войди своим токеном: прогресс, слова, «Сегодня», магазин и монетки, заметки, картинки и обложка, игры. Если что-то не так: `systemctl start progress korean-web` вернёт старое (старые файлы и `app.db` на месте).
7. **Автозапуск.** Контейнеры стоят с `restart: unless-stopped`; убери старые службы: `systemctl disable progress korean-web`.
8. **Копии.** `sudo bash scripts/install-backup-timer.sh --now` (теперь таймер запускает `scripts/backup-docker.sh`).

Что переносится: все 16 таблиц (ответы, слова, дни, время, заметки, картинки, планы, «Сегодня», монетки, прежняя тетрадь (`nb_items`, раздел убран, данные сохраняются), события, сеансы, гости, настройки в `meta`, картинки сайта) и все файлы (`uploads`, `thumbs`, `docs`, `public`, `site`). Счётчики автонумерации выровнены, новые записи не столкнутся со старыми. Двухфакторная защита (`meta.twofa`) и сеансы переходят вместе с базой.
Не переносится и не нужно: `server.env` как файл (его значения уходят в `.env`), `config/*` из архива (Caddyfile и службы старого сервера: Caddy остаётся прежним), `backend/data/backups` старых копий.
Видео (`/var/sites/korean-video`) не в архиве и не трогаются: их по-прежнему отдаёт Caddy сервера.
Фото к грамматике (`frontend/src/assets/grammar/*.webp`) это часть сайта: они в git и собираются в образ `frontend`, в архив данных не входят и входить не должны.

## Обновление

`cd /var/sites/korean && bash scripts/deploy.sh` (или автодеплой из GitHub Actions после зелёного CI). Скрипт проверяет, что в папке нет правок, делает `git pull --ff-only`, **копию базы**, собирает образы, перезапускает изменившиеся службы и ждёт ответа API и сайта. Не ответили: `git reset --hard` на прежний коммит, пересборка и запуск прежней версии, ошибка в конце. Параметры `--force`, `--no-restart`, `--no-backup`. Тест `tests/deploy.test.mjs`.
Миграции базы идут вперёд при старте `backend` (`prisma migrate deploy`). Откат кода не откатывает схему: новую миграцию делай так, чтобы прежний код с ней работал (только добавлять столбцы и таблицы), а восстановление базы при крайней необходимости из копии.

## Резервные копии и восстановление

- Внутри `backend`: ночной `pg_dump` в `/data/backups/app-ДАТА.dump` (30 штук) и полный зашифрованный архив на почту (как раньше, `docs/backup.md`; архив теперь содержит `pg_dump` вместо `app.db`).
- На хосте: `bash scripts/backup-docker.sh` (таймер: `scripts/install-backup-timer.sh`) делает снимок базы с проверкой, файлы жёсткими ссылками, копию `.env`, складывает в `/var/backups/korean` (14 штук), пишет `backup-status.json` и `backup.prom` для Grafana; `OFFSITE_RSYNC=user@host:/путь` в `.env` отправляет копии на другой сервер.
- Восстановление базы из `app.dump`: `docker compose stop backend frontend`, `docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U korean -d korean < app.dump`, `docker compose up -d`. Файлы вернуть в том `app-data`: `docker compose cp ПАПКА/files/. backend:/data/` (потом `docker compose exec -u root backend chown -R node:node /data`).
- Репетируй восстановление в отдельном проекте (`COMPOSE_PROJECT_NAME=проба`, другие порты в `.env`), а не на боевом.

## Мониторинг

Prometheus собирает метрики `backend` (`/api/metrics`: запросы, ошибки, задержка; снаружи через Caddy он закрыт, ответ 404 на запросы с `X-Forwarded-For`), `node-exporter` (процессор, память, диск, сеть, время работы, `backup.prom`), `cadvisor` (процессор и память каждого контейнера) и себя.
Grafana (`admin` и `GRAFANA_PASSWORD` из `.env`) уже настроена: источник и панель «우리말: нагрузка и состояние» подключаются сами и открываются сразу при входе. В ней: плитки «Сейчас» (сайт, процессор, память, диск, запросы, время работы), нагрузка сервера по видам работы, память, сеть, диск, load average, процессор и память по контейнерам, запросы, время ответа и ошибки сайта, давность последней резервной копии. Правки панели в Grafana не сохраняются (файл `docker/grafana/dashboards/operations.json` главный): меняй файл и делай `docker compose restart grafana`. Учебную статистику в Grafana не собираем: она красивее в кабинете.
В Prometheus (`/targets`) видно, кто отдаёт данные (все должны быть `UP`), запросы вводятся на вкладке Query (например `up`). На Mac в Docker Desktop панели «по контейнерам» пустые (cAdvisor не видит там Docker), на Linux-сервере они работают.

## Поиск (Meilisearch)

Публичный индекс собирается из статического каталога сайта (слова, грамматика, предложения, буквы, формы, игры, справочники); личный (`owner-materials`) из заметок и галереи в PostgreSQL, ответ содержит только id.
**Локальный поиск сайта главный, индекс только дополняет:** он находит и по части слова, и по переводам (Meilisearch ищет по началу слова, но прощает опечатки), поэтому результаты индекса добавляются к локальным без дублей, а не заменяют их (`mergeSearchResults` в `search.ts`, тест `frontend/test/search-index.spec.ts`). Индекс подключён в общем поиске (⌘K, «Справочник»), каталоге игр и поиске по заметкам и картинкам кабинета; списки «Слова», «Предложения», «Формы» ищут локально. Пустой или недоступный Meilisearch ничего не ломает.
Пересобрать публичный индекс после изменения каталога: «Кабинет → Сервисы → Пересобрать индекс» (после первого деплоя нажми один раз). Ключ Meilisearch есть только у `backend`.

## Данные для тестов и локальной проверки

Тесты (`npm test`) ходят в PostgreSQL по `TEST_DATABASE_URL` (у каждого теста своя схема) и в Redis, Meilisearch по `REDIS_URL`, `MEILISEARCH_URL`. Быстро поднять всё нужное: `docker run -d --name kt-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=korean_test -p 55432:5432 postgres:17-alpine` и аналогично `redis:7.4-alpine`, `getmeili/meilisearch:v1.12` (`MEILI_MASTER_KEY`), для тестов копий нужен `pg_dump` 17+ (`brew install libpq`). Переменные как в `.github/workflows/ci.yml`.

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
PostgreSQL и Redis наружу не открываем никогда: их смотрят через SSH-туннель.
