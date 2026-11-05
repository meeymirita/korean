#!/usr/bin/env bash
# Резервная копия платформы:  bash scripts/backup.sh
#
# Что кладёт в копию (папка BACKUP_DIR/ГГГГ-ММ-ДД_ЧЧММСС):
#   app.dump         целостный снимок PostgreSQL в custom-формате, с проверкой списка объектов через pg_restore
#   files/           картинки, файлы календаря и обложка визитки; одинаковые файлы за разные дни хранятся один раз (жёсткие ссылки)
#   config/          backend/.env (секреты, права 600), а также Caddyfile и служба progress, если их можно прочитать
#   manifest.txt     дата, версия кода, размеры, контрольная сумма базы
# Лишнего (node_modules, dist, .git) в копии нет: их можно собрать заново.
#
# После копирования: оставляются последние KEEP копий, статус пишется в DATA/backup-status.json (его показывает кабинет),
# а если задан OFFSITE_RSYNC или OFFSITE_RCLONE, копия уходит ещё и за пределы сервера.
#
# Переменные (необязательные; на сервере можно положить в /etc/korean-backup.env):
#   ROOT             папка проекта (по умолчанию: папка над scripts/)
#   BACKUP_DIR       куда класть копии (по умолчанию /var/backups/korean)
#   DATABASE_URL     адрес PostgreSQL из backend/.env
#   PG_DUMP_DATABASE_URL  адрес подключения без Prisma-параметров (необязательно)
#   PG_DUMP_SCHEMA   имя схемы PostgreSQL для резервной копии (необязательно)
#   KEEP             сколько последних копий хранить (по умолчанию 14)
#   OFFSITE_RSYNC    user@host:/путь   отправить все копии на другой сервер по ssh (rsync, только новое)
#   OFFSITE_RCLONE   remote:папка      отправить архив копии через rclone (Яндекс Диск, Google Drive, S3...)
#   KEEP_OFFSITE_DAYS  сколько дней хранить архивы в rclone (по умолчанию 30)
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
if [ -r "$ROOT/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then value=${value:1:-1}; fi
    if [[ "$value" == \'*\' && "$value" == *\' ]]; then value=${value:1:-1}; fi
    export "$key=$value"
  done < "$ROOT/.env"
fi
[ -f /etc/korean-backup.env ] && . /etc/korean-backup.env
if [ -n "${DATA_DIR:-}" ]; then
  DATA=$DATA_DIR
elif [ -n "${APP_DATA_DIR:-}" ]; then
  case "$APP_DATA_DIR" in /*) DATA=$APP_DATA_DIR ;; *) DATA="$ROOT/$APP_DATA_DIR" ;; esac
else
  DATA="$ROOT/backend/data"
fi
BACKUP_DIR=${BACKUP_DIR:-$DATA/backups}
KEEP=${KEEP:-14}
KEEP_OFFSITE_DAYS=${KEEP_OFFSITE_DAYS:-30}
STATUS="$DATA/backup-status.json"
STAMP=$(date +%Y-%m-%d_%H%M%S)
WORK="$BACKUP_DIR/$STAMP.tmp"
FINAL="$BACKUP_DIR/$STAMP"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' '; }
write_status() { # ok(true/false) сообщение
  mkdir -p "$DATA"
  local last_success=0
  if [ -f "$DATA/backup.prom" ]; then
    last_success=$(awk '$1 == "backup_last_success_timestamp_seconds" {print $2}' "$DATA/backup.prom" | tail -1)
    last_success=${last_success:-0}
  fi
  printf '{"ok":%s,"time":%s000,"dir":"%s","sizeKb":%s,"offsite":%s,"message":"%s"}\n' \
    "$1" "$(date +%s)" "$(json_escape "${FINAL:-}")" "${SIZE_KB:-0}" "${OFFSITE_DONE:-false}" "$(json_escape "$2")" > "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
  local ok=0
  [ "$1" = true ] && ok=1
  printf 'backup_last_attempt_timestamp_seconds %s\nbackup_last_success %s\n' "$(date +%s)" "$ok" > "$DATA/backup.prom.tmp"
  if [ "$ok" = 1 ]; then last_success=$(date +%s); fi
  printf 'backup_last_success_timestamp_seconds %s\n' "$last_success" >> "$DATA/backup.prom.tmp"
  mv "$DATA/backup.prom.tmp" "$DATA/backup.prom"
}
SIZE_KB=0
OFFSITE_DONE=false
trap 'code=$?; [ $code -ne 0 ] && { rm -rf "$WORK"; write_status false "копия не удалась (код $code)"; echo "ОШИБКА: копия не удалась" >&2; }; exit $code' EXIT

[ -d "$DATA" ] || { echo "Нет папки данных: $DATA" >&2; exit 2; }
[ -n "${DATABASE_URL:-}" ] || { echo "Не задан DATABASE_URL" >&2; exit 2; }
command -v "${PG_DUMP_BIN:-pg_dump}" >/dev/null || { echo "Не найдена команда pg_dump" >&2; exit 2; }
command -v "${PG_RESTORE_BIN:-pg_restore}" >/dev/null || { echo "Не найдена команда pg_restore" >&2; exit 2; }
PARSED_DUMP=$(PG_DUMP_DATABASE_URL="${PG_DUMP_DATABASE_URL:-$DATABASE_URL}" PG_DUMP_SCHEMA="${PG_DUMP_SCHEMA:-}" node -e '
const url = new URL(process.env.PG_DUMP_DATABASE_URL)
const schema = process.env.PG_DUMP_SCHEMA || url.searchParams.get("schema") || ""
url.searchParams.delete("schema")
if (schema && !/^[a-zA-Z_][a-zA-Z0-9_$]{0,62}$/.test(schema)) process.exit(2)
process.stdout.write(url.toString() + "\t" + schema)
') || { echo "Параметры подключения для pg_dump некорректны" >&2; exit 2; }
IFS=$'\t' read -r PGDATABASE DUMP_SCHEMA <<< "$PARSED_DUMP"
mkdir -p "$WORK/files" "$WORK/config"
chmod 700 "$BACKUP_DIR" "$WORK"

# 1. база: pg_dump создаёт согласованный снимок работающей PostgreSQL
DUMP_ARGS=(--format=custom --no-owner --file="$WORK/app.dump" --dbname="$PGDATABASE")
if [ -n "$DUMP_SCHEMA" ]; then
  DUMP_ARGS+=(--schema="$DUMP_SCHEMA")
fi
"${PG_DUMP_BIN:-pg_dump}" "${DUMP_ARGS[@]}" || { echo "Снимок PostgreSQL не получился" >&2; exit 3; }
"${PG_RESTORE_BIN:-pg_restore}" --list "$WORK/app.dump" >/dev/null || { echo "Проверка архива PostgreSQL не прошла" >&2; exit 3; }

# 2. файлы: картинки, документы, обложка визитки; неизменённые за прошлые дни берутся ссылками
PREV=$(ls -d "$BACKUP_DIR"/20??-??-??_?????? 2>/dev/null | sort | tail -1 || true)
LINK=()
[ -n "$PREV" ] && [ -d "$PREV/files" ] && LINK=(--link-dest="$PREV/files")
for d in uploads docs thumbs public site; do
  [ -d "$DATA/$d" ] && rsync -a "${LINK[@]+"${LINK[@]}"}" "$DATA/$d" "$WORK/files/"
done

# 3. настройки: секреты и конфиги, без которых заново не поднять (права только для владельца)
if [ -r "$ROOT/.env" ]; then
  cp "$ROOT/.env" "$WORK/config/server.env"
elif [ -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env" "$WORK/config/server.env"
fi
for f in /etc/caddy/Caddyfile /etc/systemd/system/progress.service /etc/systemd/system/korean-backup.service /etc/systemd/system/korean-backup.timer /etc/korean-backup.env; do
  [ -r "$f" ] && cp "$f" "$WORK/config/$(basename "$f")" || true
done
for d in /etc/caddy/conf.d /etc/systemd/system/progress.service.d; do
  [ -d "$d" ] && for f in "$d"/*; do [ -f "$f" ] && [ -r "$f" ] && cp "$f" "$WORK/config/$(basename "$d")-$(basename "$f")"; done || true
done
chmod -R go-rwx "$WORK/config"

# 4. описание копии
{
  echo "дата: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "код: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo неизвестно)"
  echo "база: $(du -k "$WORK/app.dump" | cut -f1) КБ, sha256 $(sha256sum "$WORK/app.dump" | cut -d' ' -f1)"
  echo "файлов: $(find "$WORK/files" -type f | wc -l | tr -d ' ')"
} > "$WORK/manifest.txt"

mv "$WORK" "$FINAL"
SIZE_KB=$(du -sk "$FINAL" | cut -f1)

# 5. старые копии: оставляем последние KEEP
ls -d "$BACKUP_DIR"/20??-??-??_?????? 2>/dev/null | sort | awk -v k="$KEEP" '{a[NR]=$0} END {for (i = 1; i <= NR - k; i++) print a[i]}' | while read -r old; do rm -rf "$old"; done || true

# 6. за пределы сервера (если настроено); ошибка отправки не отменяет локальную копию, но видна в статусе
OFFSITE_MSG=""
if [ -n "${OFFSITE_RSYNC:-}" ]; then
  if rsync -aH --delete "$BACKUP_DIR/" "$OFFSITE_RSYNC/" 2>/dev/null; then OFFSITE_DONE=true; else OFFSITE_MSG="; отправка rsync не удалась"; fi
fi
if [ -n "${OFFSITE_RCLONE:-}" ]; then
  if tar -cf - -C "$FINAL" . | rclone rcat "$OFFSITE_RCLONE/korean-$STAMP.tar" 2>/dev/null; then
    OFFSITE_DONE=true
    rclone delete "$OFFSITE_RCLONE" --min-age "${KEEP_OFFSITE_DAYS}d" 2>/dev/null || true
  else OFFSITE_MSG="; отправка rclone не удалась"; fi
fi

write_status true "копия $STAMP готова${OFFSITE_MSG}"
trap - EXIT
echo "Копия: $FINAL ($((SIZE_KB / 1024)) МБ)${OFFSITE_MSG}"
