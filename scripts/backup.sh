#!/usr/bin/env bash
# Резервная копия платформы:  bash scripts/backup.sh
#
# Что кладёт в копию (папка BACKUP_DIR/ГГГГ-ММ-ДД_ЧЧММСС):
#   app.db           целостный снимок базы (VACUUM INTO: можно делать, пока сервер работает), с проверкой integrity_check
#   files/           картинки, файлы календаря и обложка визитки; одинаковые файлы за разные дни хранятся один раз (жёсткие ссылки)
#   config/          server/.env (секреты, права 600), а также Caddyfile и служба progress, если их можно прочитать
#   manifest.txt     дата, версия кода, размеры, контрольная сумма базы
# Лишнего (node_modules, dist, .git) в копии нет: их можно собрать заново.
#
# После копирования: оставляются последние KEEP копий, статус пишется в DATA/backup-status.json (его показывает кабинет),
# а если задан OFFSITE_RSYNC или OFFSITE_RCLONE, копия уходит ещё и за пределы сервера.
#
# Переменные (необязательные; на сервере можно положить в /etc/korean-backup.env):
#   ROOT             папка проекта (по умолчанию: папка над scripts/)
#   BACKUP_DIR       куда класть копии (по умолчанию /var/backups/korean)
#   KEEP             сколько последних копий хранить (по умолчанию 14)
#   OFFSITE_RSYNC    user@host:/путь   отправить все копии на другой сервер по ssh (rsync, только новое)
#   OFFSITE_RCLONE   remote:папка      отправить архив копии через rclone (Яндекс Диск, Google Drive, S3...)
#   KEEP_OFFSITE_DAYS  сколько дней хранить архивы в rclone (по умолчанию 30)
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
[ -f /etc/korean-backup.env ] && . /etc/korean-backup.env
BACKUP_DIR=${BACKUP_DIR:-/var/backups/korean}
KEEP=${KEEP:-14}
KEEP_OFFSITE_DAYS=${KEEP_OFFSITE_DAYS:-30}
DATA=${DATA_DIR:-$ROOT/server/data}
STATUS="$DATA/backup-status.json"
STAMP=$(date +%Y-%m-%d_%H%M%S)
WORK="$BACKUP_DIR/$STAMP.tmp"
FINAL="$BACKUP_DIR/$STAMP"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' '; }
write_status() { # ok(true/false) сообщение
  mkdir -p "$DATA"
  printf '{"ok":%s,"time":%s000,"dir":"%s","sizeKb":%s,"offsite":%s,"message":"%s"}\n' \
    "$1" "$(date +%s)" "$(json_escape "${FINAL:-}")" "${SIZE_KB:-0}" "${OFFSITE_DONE:-false}" "$(json_escape "$2")" > "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
}
SIZE_KB=0
OFFSITE_DONE=false
trap 'code=$?; [ $code -ne 0 ] && { rm -rf "$WORK"; write_status false "копия не удалась (код $code)"; echo "ОШИБКА: копия не удалась" >&2; }; exit $code' EXIT

[ -d "$DATA" ] || { echo "Нет папки данных: $DATA" >&2; exit 2; }
[ -f "$DATA/app.db" ] || { echo "Нет базы: $DATA/app.db" >&2; exit 2; }
mkdir -p "$WORK/files" "$WORK/config"
chmod 700 "$BACKUP_DIR" "$WORK"

# 1. база: целостный снимок через SQLite, а не копирование файла «на ходу»
DB_SRC="$DATA/app.db" DB_DST="$WORK/app.db" node -e "
const { DatabaseSync } = require('node:sqlite')
const src = new DatabaseSync(process.env.DB_SRC, { readOnly: true })
src.exec('VACUUM INTO ' + \"'\" + process.env.DB_DST.replace(/'/g, \"''\") + \"'\")
src.close()
const copy = new DatabaseSync(process.env.DB_DST, { readOnly: true })
const r = copy.prepare('PRAGMA integrity_check').get()
copy.close()
if (Object.values(r)[0] !== 'ok') { console.error('integrity_check:', JSON.stringify(r)); process.exit(1) }
" 2>/dev/null || { echo "Снимок базы не получился или база повреждена" >&2; exit 3; }

# 2. файлы: картинки, документы, обложка визитки; неизменённые за прошлые дни берутся ссылками
PREV=$(ls -d "$BACKUP_DIR"/20??-??-??_?????? 2>/dev/null | sort | tail -1 || true)
LINK=()
[ -n "$PREV" ] && [ -d "$PREV/files" ] && LINK=(--link-dest="$PREV/files")
for d in uploads docs thumbs public; do
  [ -d "$DATA/$d" ] && rsync -a "${LINK[@]+"${LINK[@]}"}" "$DATA/$d" "$WORK/files/"
done

# 3. настройки: секреты и конфиги, без которых заново не поднять (права только для владельца)
[ -f "$ROOT/server/.env" ] && cp "$ROOT/server/.env" "$WORK/config/server.env"
for f in /etc/caddy/Caddyfile /etc/systemd/system/progress.service; do
  [ -r "$f" ] && cp "$f" "$WORK/config/$(basename "$f")" || true
done
chmod -R go-rwx "$WORK/config"

# 4. описание копии
{
  echo "дата: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "код: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo неизвестно)"
  echo "база: $(du -k "$WORK/app.db" | cut -f1) КБ, sha256 $(shasum -a 256 "$WORK/app.db" | cut -d' ' -f1)"
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
