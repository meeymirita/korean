#!/usr/bin/env bash
# Скачивает влоги новых авторов: по папке на автора в ~/Movies/Korean-videos/vlog/<slug>/ (видео <id>.mp4 + субтитры <id>.ko.json3).
# Все авторы:  bash scripts/vlog-download.sh      Один:  bash scripts/vlog-download.sh dora
# Список видео: frontend/src/data/korean/vlog-plan.ts (VLOG_PLAN). Уже скачанное yt-dlp пропускает (архив в папке автора).
set -u
ROOT="$HOME/Movies/Korean-videos/vlog"
get() { # slug ссылки...
  local slug="$1"; shift
  [ -n "${ONLY:-}" ] && [ "$ONLY" != "$slug" ] && return 0
  mkdir -p "$ROOT/$slug"
  yt-dlp -f "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][vcodec^=avc1]" --merge-output-format mp4 \
    --write-subs --write-auto-subs --sub-langs ko --sub-format json3 --sleep-interval 2 --max-sleep-interval 5 \
    --ignore-errors --download-archive "$ROOT/$slug/архив.txt" -P "$ROOT/$slug" -o "%(id)s.%(ext)s" \
    "$@" 2>&1 | tee -a "$ROOT/$slug/журнал.txt" | grep -E "Destination|ERROR|has already" || true
  echo "== $slug: $(ls "$ROOT/$slug"/*.mp4 2>/dev/null | wc -l | tr -d ' ') mp4, $(ls "$ROOT/$slug"/*.ko.json3 2>/dev/null | wc -l | tr -d ' ') субтитров"
}
ONLY="${1:-}"
Y=https://www.youtube.com/watch?v=
get dora "$Y"Jex4XTA3BDg "$Y"W7ErKzubTjY "$Y"7T3l2syFC_s "$Y"uPKRQhaYeMg "$Y"ENLlmkwv6jk "$Y"P1WgK4TxJYE "$Y"MFgVfcqBkJ0 "$Y"8u47xrx3Ffw "$Y"QJanmo9TXc8 "$Y"4qXLtgcswWY "$Y"cIAydgtc7zE "$Y"wtIzSP2fDOk
get ria "$Y"qlMmOiQPLsc "$Y"NGPw_UD_D9U "$Y"EpGocbJZ3jc "$Y"9W4jYPAn1GY "$Y"FY9_RtFt84U "$Y"o-X_6t45Sic "$Y"Oh8fiYihNhM
get choisusu "$Y"29mdX4IG7YI "$Y"_kPYR0gBstk "$Y"932sf30NQzE "$Y"R2WQ6wQCr1Y "$Y"B1NfSUKXaTs "$Y"qoidYvlCiPM "$Y"MNsHXC_-HVA "$Y"wquDm0eqMMU "$Y"ZzcszvIgT_8 "$Y"6y6YoL-TjYQ "$Y"3GYl0X6tk2M "$Y"23C9rdaLOCc "$Y"BnTS2DOdMSY
