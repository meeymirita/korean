#!/bin/sh
# Запуск Grafana: копирует настройки из репозитория во временную папку и вписывает в адрес тревог данные Telegram из окружения
# (ALERT_TELEGRAM_TOKEN, ALERT_TELEGRAM_CHAT, ALERT_TELEGRAM_TOPIC задаёт docker-compose.yml из TELEGRAM_* в .env).
# Сами файлы в репозитории не меняются и секретов не содержат.
set -eu
SRC=/etc/grafana/provisioning
DST=/tmp/provisioning
rm -rf "$DST"
cp -R "$SRC" "$DST"
sed -i \
  -e "s#__TELEGRAM_TOKEN__#${ALERT_TELEGRAM_TOKEN:-not-set}#" \
  -e "s#__TELEGRAM_CHAT__#${ALERT_TELEGRAM_CHAT:-0}#" \
  -e "s#__TELEGRAM_TOPIC__#${ALERT_TELEGRAM_TOPIC:-}#" \
  "$DST/alerting/contact-points.yml"
export GF_PATHS_PROVISIONING="$DST"
exec /run.sh "$@"
