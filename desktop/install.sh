#!/usr/bin/env bash
# Копирует собранное 우리말.app в /Applications (сначала: npm --prefix desktop run build).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app="$(cat "$here/dist/.last-build" 2>/dev/null || true)"
[ -d "$app" ] || { echo "Нет сборки: npm --prefix desktop run build"; exit 1; }
osascript -e 'tell application "우리말" to quit' >/dev/null 2>&1 || true
rm -rf "/Applications/우리말.app"
cp -R "$app" /Applications/
xattr -dr com.apple.quarantine "/Applications/우리말.app" 2>/dev/null || true
echo "Установлено: /Applications/우리말.app"
