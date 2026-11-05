#!/usr/bin/env bash
# Загружает в Docker-стек полный архив прежнего сайта (распакованный): базу SQLite → PostgreSQL и все файлы.
#   bash scripts/import-dump.sh /путь/к/распакованному/korean [--replace]
#
# В папке должны быть app.db и (если есть) uploads, thumbs, docs, public, site; server.env сюда не нужен (для него scripts/init-env.sh --from).
# Что происходит:
#   1. поднимается стек (backend сам применяет миграции и создаёт пустые таблицы);
#   2. сайт и API на время остановки не пишут в базу;
#   3. app.db копируется в PostgreSQL одной транзакцией и сверяется (строки, суммы, хэши таблиц), при расхождении откат;
#   4. файлы кладутся в том app-data с правами пользователя приложения;
#   5. стек запускается снова, ещё раз сверяется база и проверяется, что каждая картинка из базы есть на диске.
# app.db и архив не меняются. Повторный запуск безопасен (--replace заменяет уже загруженные данные).
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
COMPOSE=${COMPOSE_CMD:-docker compose}
SRC=${1:-}
REPLACE=""
[ "${2:-}" = "--replace" ] && REPLACE="--replace"
[ -n "$SRC" ] && [ -f "$SRC/app.db" ] || { echo "Использование: bash scripts/import-dump.sh /путь/к/korean [--replace]  (в папке должен лежать app.db)" >&2; exit 2; }
SRC=$(cd "$SRC" && pwd)
cd "$ROOT"
[ -f .env ] || { echo "Нет .env: сначала bash scripts/init-env.sh" >&2; exit 2; }

say() { printf '\n== %s\n' "$*"; }

say "Запускаю стек (миграции создадут таблицы)"
$COMPOSE up -d --build
for i in $(seq 1 60); do
  curl -fsS -m 3 "http://127.0.0.1:$(grep -E '^BACKEND_PORT=' .env | cut -d= -f2 | head -1 || echo 3001)/api/health" 2>/dev/null | grep -q '"ok":true' && break
  sleep 2
done

say "Останавливаю сайт и API на время переноса"
$COMPOSE stop frontend backend

say "База: SQLite → PostgreSQL"
$COMPOSE run --rm --no-deps -v "$SRC:/import:ro" backend node scripts/sqlite-to-postgres.mjs /import/app.db $REPLACE

say "Файлы: картинки, миниатюры, файлы календаря, обложка визитки, заменённые картинки сайта"
$COMPOSE run --rm --no-deps --user root -v "$SRC:/import:ro" --entrypoint sh backend -c '
  set -e
  for d in uploads thumbs docs public site; do
    if [ -d "/import/$d" ]; then mkdir -p "/data/$d" && cp -a "/import/$d/." "/data/$d/"; fi
  done
  chown -R node:node /data
  for d in uploads thumbs docs public site; do echo "$d: $(find /data/$d -type f 2>/dev/null | wc -l) файлов"; done
'

say "Запускаю сайт и API"
$COMPOSE up -d

say "Проверка: база совпадает с app.db, файлы на месте"
$COMPOSE stop backend >/dev/null
$COMPOSE run --rm --no-deps -v "$SRC:/import:ro" backend node scripts/sqlite-to-postgres.mjs /import/app.db --check-only
$COMPOSE run --rm --no-deps --entrypoint node -v "$SRC:/import:ro" backend -e '
const { DatabaseSync } = require("node:sqlite"); const fs = require("fs")
const db = new DatabaseSync("/import/app.db", { readOnly: true })
let miss = 0, total = 0
for (const r of db.prepare("SELECT id, ext FROM images").all()) { total++; if (!fs.existsSync(`/data/uploads/${r.id}.${r.ext}`)) { miss++; console.log("нет файла картинки", r.id) } }
for (const r of db.prepare("SELECT ref FROM site_images WHERE kind = \x27file\x27").all()) { total++; if (!fs.existsSync(`/data/site/${r.ref}`)) { miss++; console.log("нет заменённой картинки сайта", r.ref) } }
console.log(`файлы картинок: ${total - miss} из ${total} найдено`)
process.exit(miss ? 1 : 0)
'
$COMPOSE up -d
echo
echo "Готово: данные перенесены, база сверена, файлы на месте."
