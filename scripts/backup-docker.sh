#!/usr/bin/env bash
# Резервная копия Docker-стека одной командой:  bash scripts/backup-docker.sh
#
# Запускает scripts/backup.sh внутри контейнера backend (там есть pg_dump 17, rsync и доступ к базе и файлам),
# затем переносит готовую копию на сам сервер в BACKUP_HOST_DIR (по умолчанию /var/backups/korean) вместе с копией .env.
# Копии внутри тома app-data: /data/backups/nightly (последние KEEP штук). На сервере: sudo bash scripts/install-backup-timer.sh --now.
# Куда ещё отправлять: OFFSITE_RSYNC=user@host:/путь (rsync по ssh) в .env: этот скрипт отправит туда папку BACKUP_HOST_DIR.
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
COMPOSE=${COMPOSE_CMD:-docker compose}
cd "$ROOT"
[ -f .env ] || { echo "Нет .env" >&2; exit 2; }
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
BACKUP_HOST_DIR=${BACKUP_HOST_DIR:-/var/backups/korean}
KEEP=${KEEP:-$(env_value KEEP)}
KEEP=${KEEP:-14}

# 1. копия внутри контейнера; ROOT=/app, чтобы скрипт не искал .env внутри образа
$COMPOSE exec -T -e ROOT=/app -e DATA_DIR=/data -e BACKUP_DIR=/data/backups/nightly -e KEEP="$KEEP" -e OFFSITE_RSYNC= -e OFFSITE_RCLONE= backend bash -s < scripts/backup.sh

# 2. последняя копия на хост
LATEST=$($COMPOSE exec -T backend sh -c 'ls -d /data/backups/nightly/20??-??-??_?????? | sort | tail -1' | tr -d '\r')
[ -n "$LATEST" ] || { echo "Копия не найдена" >&2; exit 3; }
NAME=$(basename "$LATEST")
umask 077
mkdir -p "$BACKUP_HOST_DIR"
rm -rf "$BACKUP_HOST_DIR/$NAME.tmp"
$COMPOSE cp "backend:$LATEST" "$BACKUP_HOST_DIR/$NAME.tmp"
cp -p .env "$BACKUP_HOST_DIR/$NAME.tmp/config-env"
chmod 600 "$BACKUP_HOST_DIR/$NAME.tmp/config-env"
mv "$BACKUP_HOST_DIR/$NAME.tmp" "$BACKUP_HOST_DIR/$NAME"
ls -d "$BACKUP_HOST_DIR"/20??-??-??_?????? | sort | awk -v k="$KEEP" '{a[NR]=$0} END {for (i = 1; i <= NR - k; i++) print a[i]}' | while read -r old; do rm -rf "$old"; done

# 3. за пределы сервера
OFFSITE=$(env_value OFFSITE_RSYNC)
if [ -n "$OFFSITE" ]; then
  rsync -aH --delete "$BACKUP_HOST_DIR/" "$OFFSITE/" && echo "Копия отправлена на $OFFSITE" || echo "ВНИМАНИЕ: отправка на $OFFSITE не удалась" >&2
fi
echo "Копия на сервере: $BACKUP_HOST_DIR/$NAME"
