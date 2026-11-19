#!/usr/bin/env bash
# Локальный запуск платформы с уже заполненными демо-данными (учёба за месяц, входящие слова и материалы, проверки тетради).
# Свои порты и свои контейнеры, чужое не трогает: база kt-pg-local на 5432, сервер на 3011, сайт на http://localhost:5198.
#   bash scripts/local-demo.sh          поднять (при первом запуске восстановит базу из дампа)
#   bash scripts/local-demo.sh down     остановить сервер, сайт и базу (данные остаются в томе kt-pg-local-data)
#   bash scripts/local-demo.sh dump     сохранить текущую базу в дамп (после того как добавил данные)
#   bash scripts/local-demo.sh reset    стереть базу и восстановить из дампа заново
# Дамп лежит вне репозитория (открытый): DEMO_DIR, по умолчанию ~/Documents/projects/korean-local-demo (korean_local.sql).
# Токен владельца только для этого локального запуска, к боевому сайту он не подходит.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_DIR="${DEMO_DIR:-$HOME/Documents/projects/korean-local-demo}"
DUMP="$DEMO_DIR/korean_local.sql"
RUN="$DEMO_DIR/run"
TOKEN="local-demo-token-2026"
PG=kt-pg-local
DB=korean_local
mkdir -p "$RUN" "$DEMO_DIR/data"

listening() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
stop_pid() { [ -f "$RUN/$1.pid" ] && kill "$(cat "$RUN/$1.pid")" 2>/dev/null || true; rm -f "$RUN/$1.pid"; }
psql_db() { docker exec -i "$PG" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
restore() {
  [ -f "$DUMP" ] || { echo "Нет дампа $DUMP: база будет пустой (миграции накатятся)."; return 0; }
  echo "Восстанавливаю базу из дампа…"
  psql_db -q < "$DUMP" >/dev/null
}

case "${1:-up}" in
  down)
    stop_pid nuxt; stop_pid backend
    docker stop "$PG" >/dev/null 2>&1 || true
    echo "Остановлено (данные в томе kt-pg-local-data)."
    exit 0 ;;
  dump)
    docker exec "$PG" pg_dump -U postgres --clean --if-exists --no-owner "$DB" > "$DUMP.tmp" && mv "$DUMP.tmp" "$DUMP"
    echo "Дамп сохранён: $DUMP ($(wc -c < "$DUMP") байт)"
    exit 0 ;;
  reset)
    stop_pid nuxt; stop_pid backend
    docker rm -f "$PG" >/dev/null 2>&1 || true
    docker volume rm kt-pg-local-data >/dev/null 2>&1 || true ;;
  up) ;;
  *) echo "Команды: up | down | dump | reset"; exit 2 ;;
esac

# --- база ---
FRESH=0
if ! docker ps -a --format '{{.Names}}' | grep -qx "$PG"; then
  docker run -d --name "$PG" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB" \
    -v kt-pg-local-data:/var/lib/postgresql/data -p 5432:5432 postgres:17-alpine >/dev/null
  FRESH=1
else
  docker start "$PG" >/dev/null 2>&1 || true
fi
for _ in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
# том уже есть, но пустой (нет таблицы materials): тоже восстановить
if [ "$FRESH" = 1 ] || [ "$(psql_db -tAc "select to_regclass('public.days') is not null" 2>/dev/null || echo f)" != "t" ]; then restore; fi
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$DB"
npm --prefix "$ROOT/backend" run db:migrate >/dev/null 2>&1 || echo "Миграции не накатились (смотри npm --prefix backend run db:migrate)"

# --- сервер ---
if ! listening 3011; then
  (cd "$ROOT" && npm run server:build >"$RUN/build.log" 2>&1) || { echo "Сервер не собрался: $RUN/build.log"; exit 1; }
  (cd "$ROOT/backend" && DATA_DIR="$DEMO_DIR/data" PORT=3011 PROGRESS_TOKEN="$TOKEN" DISABLE_2FA=1 nohup node dist/main.js </dev/null >"$RUN/backend.log" 2>&1 & echo $! >"$RUN/backend.pid")
  for _ in $(seq 1 40); do listening 3011 && break; sleep 1; done
fi

# --- сайт ---
if ! listening 5198; then
  (cd "$ROOT" && API_PORT=3011 nohup npx --prefix frontend nuxt dev --port 5198 --cwd frontend </dev/null >"$RUN/nuxt.log" 2>&1 & echo $! >"$RUN/nuxt.pid")
  for _ in $(seq 1 60); do listening 5198 && break; sleep 1; done
fi

echo "Готово: http://localhost:5198/korean/words  (токен для входа: $TOKEN)"
echo "Остановить: bash scripts/local-demo.sh down; сохранить новые данные: bash scripts/local-demo.sh dump"
