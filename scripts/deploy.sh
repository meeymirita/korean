#!/usr/bin/env bash
# Обновление сайта на сервере одной командой:  bash scripts/deploy.sh
#
# Что делает: проверяет, что в папке проекта нет чужих правок, забирает свежий код (git pull), делает копию базы,
# собирает образы Docker (сайт и сервер), перезапускает изменившиеся службы, ждёт ответа сайта и API
# и, если не ответили, сам возвращает прежнюю версию и пересобирает её. Данные (тома PostgreSQL, app-data) не трогаются.
#
# Параметры (необязательные):
#   --force        собрать и перезапустить, даже если в git ничего не менялось
#   --no-restart   только собрать образы, службы не перезапускать
#   --no-backup    не делать копию базы перед обновлением
# Переменные окружения (нужны тестам, на сервере обычно не трогаешь):
#   COMPOSE_CMD         команда Compose (по умолчанию: docker compose)
#   BUILD_CMD / UP_CMD  свои команды сборки и запуска вместо Compose
#   BACKUP_CMD          команда копии перед обновлением (по умолчанию: bash scripts/backup-docker.sh)
#   HEALTH_URL          проверка API (по умолчанию: http://127.0.0.1:3001/api/health)
#   SITE_HEALTH_URL     проверка сайта (по умолчанию: http://127.0.0.1:3000/robots.txt)
#   HEALTH_TRIES        сколько секунд ждать ответа (по умолчанию 60: после миграций backend стартует не сразу)
#   SMOKE_URLS          страницы для проверки после запуска, через пробел, вид «адрес|что должно быть в ответе»
#                       (по умолчанию главная, словарь, одно слово и карта сайта на 127.0.0.1:3000; пустая строка выключает проверку)
#   GIT_PULL=0          не делать git pull (код уже на месте)
#   NOTIFY_TELEGRAM_TOKEN и NOTIFY_TELEGRAM_CHAT — отправить результат в Telegram (по желанию; задать в /etc/korean-deploy.env)
set -uo pipefail

cd "$(dirname "$0")/.."
[ -f /etc/korean-deploy.env ] && . /etc/korean-deploy.env

COMPOSE=${COMPOSE_CMD:-docker compose}
BUILD_CMD=${BUILD_CMD:-$COMPOSE build}
UP_CMD=${UP_CMD:-$COMPOSE up -d --remove-orphans}
BACKUP_CMD=${BACKUP_CMD:-bash scripts/backup-docker.sh}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3001/api/health}
SITE_HEALTH_URL=${SITE_HEALTH_URL:-http://127.0.0.1:3000/robots.txt}
HEALTH_TRIES=${HEALTH_TRIES:-60}
SMOKE_BASE=${SMOKE_BASE:-http://127.0.0.1:3000}
# главная, большой словарь, страница слова «학교» и карта сайта: то, что видят посетители и поисковики
SMOKE_URLS=${SMOKE_URLS-"$SMOKE_BASE/|우리말 $SMOKE_BASE/dict|<title $SMOKE_BASE/dict/%ED%95%99%EA%B5%90|학교 $SMOKE_BASE/sitemap_index.xml|<sitemap"}

FORCE=0
RESTART=1
BACKUP=1
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --no-restart) RESTART=0 ;;
    --no-backup) BACKUP=0 ;;
    *) echo "Неизвестный параметр: $a (есть --force, --no-restart и --no-backup)"; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
notify() {
  [ -n "${NOTIFY_TELEGRAM_TOKEN:-}" ] && [ -n "${NOTIFY_TELEGRAM_CHAT:-}" ] || return 0
  curl -s -m 10 "https://api.telegram.org/bot${NOTIFY_TELEGRAM_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${NOTIFY_TELEGRAM_CHAT}" --data-urlencode "text=$*" >/dev/null 2>&1 || true
}
fail() { echo "ОШИБКА: $*" >&2; notify "우리말: деплой не удался: $*"; exit 1; }

# адрес отвечает? (ждём до HEALTH_TRIES секунд)
wait_for() { # url [шаблон ответа]
  local i
  for i in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS -m 3 "$1" 2>/dev/null | grep -q "${2:-.}"; then return 0; fi
    sleep 1
  done
  return 1
}
healthy() { wait_for "$HEALTH_URL" '"ok":true' && wait_for "$SITE_HEALTH_URL"; }
# дымовая проверка страниц: печатает первый адрес, который не ответил как надо
smoke() {
  local item
  for item in $SMOKE_URLS; do
    if ! wait_for "${item%%|*}" "${item#*|}"; then echo "${item%%|*}"; return 1; fi
  done
  return 0
}

# рабочая папка должна быть чистой: иначе обновление и откат могут затереть чьи-то правки
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "в папке проекта есть несохранённые правки (список выше); сохрани или убери их и запусти снова"
fi

PREV=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "${GIT_PULL:-1}" != "0" ]; then
  say "Получаю свежий код"
  git pull --ff-only || fail "git pull не смог обновить (ветка разошлась с GitHub?)"
fi
NEW=$(git rev-parse HEAD)

if [ "$PREV" = "$NEW" ] && [ "$FORCE" = 0 ]; then
  say "Новых изменений нет ($(git rev-parse --short HEAD)). Нечего обновлять; для принудительной сборки: --force"
  exit 0
fi
echo "Было $(git rev-parse --short "$PREV"), стало $(git rev-parse --short "$NEW"); изменено файлов: $(git diff --name-only "$PREV" "$NEW" | grep -c . || true)"

# откат: прежний код, прежние образы (слои в кэше, это быстро) и запуск
rollback() {
  say "ОТКАТ на $(git rev-parse --short "$PREV")"
  git reset --hard "$PREV" >/dev/null
  $BUILD_CMD >/dev/null 2>&1 || echo "(пересборка при откате не удалась)"
  [ "$RESTART" = 1 ] && $UP_CMD
  if [ "$RESTART" = 1 ] && healthy; then echo "Откат выполнен, сервер отвечает."; elif [ "$RESTART" = 1 ]; then echo "ВНИМАНИЕ: после отката сервер не отвечает, смотри: docker compose logs --tail 50 backend frontend"; fi
}

if [ "$BACKUP" = 1 ]; then
  say "Копия базы перед обновлением"
  if ! $BACKUP_CMD; then
    # без копии откат кода всё равно возможен; но предупреждаем громко
    echo "ВНИМАНИЕ: копия не получилась, обновление продолжается без неё (--no-backup скрывает это предупреждение)" >&2
    notify "우리말: перед деплоем не удалось сделать копию базы"
  fi
fi

say "Сборка образов (сайт и сервер)"
$BUILD_CMD || { rollback; fail "не удалось собрать образы"; }

if [ "$RESTART" = 1 ]; then
  say "Перезапуск изменившихся служб"
  $UP_CMD || { rollback; fail "не удалось запустить стек"; }
  if ! wait_for "$HEALTH_URL" '"ok":true'; then
    rollback
    fail "сервер не ответил после обновления на $(git rev-parse --short "$NEW") (откатились на $(git rev-parse --short "$PREV")); смотри: docker compose logs --tail 50 backend"
  fi
  if ! wait_for "$SITE_HEALTH_URL"; then
    rollback
    fail "сайт не ответил после обновления на $(git rev-parse --short "$NEW") (откатились на $(git rev-parse --short "$PREV")); смотри: docker compose logs --tail 50 frontend"
  fi
  if ! BROKEN=$(smoke); then
    rollback
    fail "страница $BROKEN не открылась после обновления на $(git rev-parse --short "$NEW") (откатились на $(git rev-parse --short "$PREV")); смотри: docker compose logs --tail 50 frontend backend"
  fi
fi

say "Готово: $(git rev-parse --short HEAD) ($BRANCH). Сайт, сервер и проверочные страницы отвечают."
notify "우리말: обновлено до $(git rev-parse --short HEAD), сайт и сервер отвечают"
