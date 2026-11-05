#!/usr/bin/env bash
# Создаёт .env для Docker-стека из .env.example с новыми случайными паролями:  bash scripts/init-env.sh [--from backend.env] [--force]
#
#   --from ФАЙЛ   прежний backend/.env (или server.env из архива): токен, почта, ключи и пароль архива переносятся как есть
#   --force       заменить уже существующий .env (старый сохранится как .env.bak)
# Значения секретов на экран не выводятся. Права файла 600.
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
OUT="$ROOT/.env"
FROM=""
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM=${2:-}; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) echo "Неизвестный параметр: $1 (есть --from ФАЙЛ и --force)" >&2; exit 2 ;;
  esac
done
[ -z "$FROM" ] || [ -f "$FROM" ] || { echo "Нет файла $FROM" >&2; exit 2; }
if [ -f "$OUT" ]; then
  [ "$FORCE" = 1 ] || { echo ".env уже есть. Чтобы создать заново: --force (старый станет .env.bak)" >&2; exit 1; }
  cp -p "$OUT" "$OUT.bak"
fi

umask 077
cp "$ROOT/.env.example" "$OUT"

# set_var КЛЮЧ ЗНАЧЕНИЕ: заменяет строку КЛЮЧ=… (значение через переменную окружения, без экранирования)
set_var() {
  local tmp
  tmp=$(mktemp "$OUT.XXXXXX")
  KEY="$1" VAL="$2" awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"] }
    index($0, k "=") == 1 { print k "=" v; found = 1; next } { print }
    END { if (!found) print k "=" v }' "$OUT" > "$tmp"
  mv "$tmp" "$OUT"
}
secret() { openssl rand -hex 24; }

# 1. новые случайные пароли везде, где в образце заглушка
for key in $(grep -E '^[A-Z_]+=replace-with-a-long-random-secret$' "$ROOT/.env.example" | cut -d= -f1); do
  set_var "$key" "$(secret)"
done

# 2. значения из прежнего backend/.env (комментарии и пустые значения пропускаем)
CARRIED=""
if [ -n "$FROM" ]; then
  for key in PROGRESS_TOKEN SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM BACKUP_PASSPHRASE BACKUP_MAIL_TO REMINDER_MAIL_TO \
             OPENROUTER_API_KEY CHAT_MODEL CHAT_BASE CHAT_DAILY_LIMIT DISABLE_2FA BACKUP_AUTO BACKUP_EVERY_DAYS CADDY_LOG_FILE SITE_URL; do
    line=$(grep -E "^$key=" "$FROM" | tail -1 || true)
    [ -n "$line" ] || continue
    value=${line#*=}
    value=${value%$'\r'}
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then value=${value:1:-1}; fi
    if [[ "$value" == \'*\' && "$value" == *\' ]]; then value=${value:1:-1}; fi
    [ -n "$value" ] || continue
    set_var "$key" "$value"
    CARRIED="$CARRIED $key"
  done
fi

# 3. на сервере: папки видео и журнала Caddy лежат на своих местах
[ -d /var/sites/korean-video ] && set_var VIDEO_DIR /var/sites/korean-video
if [ -d /var/log/caddy ]; then
  set_var CADDY_LOG_DIR /var/log/caddy
  grep -q '^CADDY_LOG_FILE=.\+' "$OUT" || set_var CADDY_LOG_FILE /var/log/caddy/korean.log
fi

chmod 600 "$OUT"
# в Docker .env монтируется в контейнер, где приложение работает от пользователя node (uid 1000): отдаём файл ему, права остаются 600
[ "$(id -u)" = 0 ] && chown 1000:1000 "$OUT" 2>/dev/null || true
echo "Готово: $OUT (права 600)."
[ -z "$CARRIED" ] || echo "Перенесено из $FROM:$CARRIED"
grep -q '^PROGRESS_TOKEN=.\{20,\}' "$OUT" || echo "ВНИМАНИЕ: токен короче 20 знаков, замени PROGRESS_TOKEN."
echo "Пароли PostgreSQL, Redis, Meilisearch и Grafana сгенерированы заново; посмотреть их можно только в самом .env."
