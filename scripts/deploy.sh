#!/usr/bin/env bash
# Обновление сайта на сервере одной командой:  bash scripts/deploy.sh
#
# Что делает: забирает свежий код (git pull), ставит пакеты, если они менялись, собирает сайт, при изменении сервера собирает и перезапускает
# его, проверяет, что сервер отвечает, и, если нет, сам возвращает прежнюю версию и сообщает об этом.
#
# Параметры (необязательные):
#   --force        собрать и перезапустить сервер, даже если в server/ ничего не менялось
#   --no-restart   не перезапускать службу (только собрать)
# Переменные окружения (нужны тестам, на сервере обычно не трогаешь):
#   RESTART_CMD         как перезапускать сервер (по умолчанию: systemctl restart progress)
#   HEALTH_URL          адрес проверки (по умолчанию: http://127.0.0.1:3001/api/health)
#   HEALTH_TRIES        сколько секунд ждать ответа (по умолчанию 20)
#   GIT_PULL=0          не делать git pull (код уже на месте)
#   INSTALL_ROOT_CMD, INSTALL_SERVER_CMD, BUILD_SERVER_CMD, BUILD_SITE_CMD — свои команды вместо npm
#   NOTIFY_TELEGRAM_TOKEN и NOTIFY_TELEGRAM_CHAT — отправить результат в Telegram (по желанию; задать в /etc/korean-deploy.env)
set -uo pipefail

cd "$(dirname "$0")/.."
[ -f /etc/korean-deploy.env ] && . /etc/korean-deploy.env

RESTART_CMD=${RESTART_CMD:-systemctl restart progress}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3001/api/health}
HEALTH_TRIES=${HEALTH_TRIES:-20}
INSTALL_ROOT_CMD=${INSTALL_ROOT_CMD:-npm ci}
INSTALL_SERVER_CMD=${INSTALL_SERVER_CMD:-npm --prefix server ci}
BUILD_SERVER_CMD=${BUILD_SERVER_CMD:-npm --prefix server run build}
BUILD_SITE_CMD=${BUILD_SITE_CMD:-npm run build}

FORCE=0
RESTART=1
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --no-restart) RESTART=0 ;;
    *) echo "Неизвестный параметр: $a (есть --force и --no-restart)"; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
notify() {
  [ -n "${NOTIFY_TELEGRAM_TOKEN:-}" ] && [ -n "${NOTIFY_TELEGRAM_CHAT:-}" ] || return 0
  curl -s -m 10 "https://api.telegram.org/bot${NOTIFY_TELEGRAM_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${NOTIFY_TELEGRAM_CHAT}" --data-urlencode "text=$*" >/dev/null 2>&1 || true
}
fail() { echo "ОШИБКА: $*" >&2; notify "우리말: деплой не удался: $*"; exit 1; }

# сервер отвечает? (ждём до HEALTH_TRIES секунд)
healthy() {
  local i
  for i in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS -m 3 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then return 0; fi
    sleep 1
  done
  return 1
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

CHANGED=$(git diff --name-only "$PREV" "$NEW")
changed() { echo "$CHANGED" | grep -Eq "$1"; }
echo "Было $(git rev-parse --short "$PREV"), стало $(git rev-parse --short "$NEW"); изменено файлов: $(echo "$CHANGED" | grep -c . || true)"

# откат: прежний код, прежняя сборка и перезапуск
rollback() {
  say "ОТКАТ на $(git rev-parse --short "$PREV")"
  git reset --hard "$PREV" >/dev/null
  { $INSTALL_SERVER_CMD && $BUILD_SERVER_CMD; } >/dev/null 2>&1 || echo "(пересборка сервера при откате не удалась)"
  $BUILD_SITE_CMD >/dev/null 2>&1 || echo "(пересборка сайта при откате не удалась)"
  [ "$RESTART" = 1 ] && $RESTART_CMD
  if healthy; then echo "Откат выполнен, сервер отвечает."; else echo "ВНИМАНИЕ: после отката сервер не отвечает, смотри: journalctl -u progress -n 30 --no-pager"; fi
}

if [ "$FORCE" = 1 ] || changed '^(package\.json|package-lock\.json)$'; then
  say "Пакеты сайта"
  $INSTALL_ROOT_CMD || { rollback; fail "не удалось поставить пакеты сайта"; }
fi

SERVER_CHANGED=0
if [ "$FORCE" = 1 ] || changed '^server/'; then SERVER_CHANGED=1; fi

if [ "$SERVER_CHANGED" = 1 ]; then
  say "Сервер: пакеты и сборка"
  $INSTALL_SERVER_CMD && $BUILD_SERVER_CMD || { rollback; fail "не удалось собрать сервер"; }
fi

say "Сборка сайта"
$BUILD_SITE_CMD || { rollback; fail "не удалось собрать сайт"; }

if [ "$RESTART" = 1 ] && [ "$SERVER_CHANGED" = 1 ]; then
  say "Перезапуск сервера"
  $RESTART_CMD || { rollback; fail "не удалось перезапустить службу"; }
  if ! healthy; then
    rollback
    fail "сервер не ответил после обновления на $(git rev-parse --short "$NEW") (откатились на $(git rev-parse --short "$PREV"))"
  fi
elif [ "$RESTART" = 1 ]; then
  say "Код сервера не менялся: перезапуск не нужен"
  healthy || fail "сервер не отвечает (обновление его не трогало; смотри journalctl -u progress -n 30 --no-pager)"
fi

say "Готово: $(git rev-parse --short HEAD) ($BRANCH). Сервер отвечает."
notify "우리말: обновлено до $(git rev-parse --short HEAD), сервер отвечает"
