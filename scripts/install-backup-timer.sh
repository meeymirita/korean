#!/usr/bin/env bash
# Включает ночную копию на сервере (systemd-таймер, каждый день в 03:30):  sudo bash scripts/install-backup-timer.sh
#   --print   только показать файлы служб, ничего не устанавливая
#   --now     сразу сделать первую копию после установки
# Если копия не удастся или таймер встанет, письмо придёт само: служба progress раз в час проверяет DATA/backup-status.json.
set -euo pipefail

ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
TIME=${BACKUP_TIME:-03:30:00}

service() {
  cat <<UNIT
[Unit]
Description=Резервная копия платформы 우리말

[Service]
Type=oneshot
ExecStart=/bin/bash $ROOT/scripts/backup.sh
Nice=10
UNIT
}
timer() {
  cat <<UNIT
[Unit]
Description=Ночная копия платформы 우리말

[Timer]
OnCalendar=*-*-* $TIME
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT
}

if [ "${1:-}" = "--print" ]; then
  echo "# /etc/systemd/system/korean-backup.service"; service; echo; echo "# /etc/systemd/system/korean-backup.timer"; timer
  exit 0
fi

[ "$(id -u)" = 0 ] || { echo "Запустите от root: sudo bash scripts/install-backup-timer.sh" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "Нужен systemd" >&2; exit 1; }
command -v rsync >/dev/null || { echo "Нужен rsync: apt install rsync" >&2; exit 1; }

service > /etc/systemd/system/korean-backup.service
timer > /etc/systemd/system/korean-backup.timer
systemctl daemon-reload
systemctl enable --now korean-backup.timer
echo "Таймер включён. Следующий запуск:"
systemctl list-timers korean-backup.timer --no-pager | head -3

if [ "${1:-}" = "--now" ]; then
  echo "Делаю первую копию…"
  systemctl start korean-backup.service
  systemctl status korean-backup.service --no-pager | head -8 || true
fi
