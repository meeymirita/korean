// Субтитры ютуб-видео по фразам со временем:
//   node scripts/vlog-fetch.mjs <ссылка на ютуб> <файл.json>      (скачает субтитры сам, видео не качает)
//   node scripts/vlog-fetch.mjs <папка/ID.ko.json3> <файл.json>   (файл субтитров, скачанный вместе с видео, название и канал не заполняются)
// Результат (номер видео, фразы s/e/ko) кладите вне репозитория, перевод и разбор дописываются потом.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const [src, out] = process.argv.slice(2)
const local = !!src && existsSync(src) && src.endsWith('.json3')
if (!out || !(local || /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(src ?? ''))) {
  console.error('Использование: node scripts/vlog-fetch.mjs <ссылка на ютуб | файл.ko.json3> <файл.json>')
  process.exit(1)
}

/** События субтитров ютуба (json3) → фразы `{ s, e, ko }`. */
export function phrases(json3) {
  const lines = []
  for (const ev of json3.events ?? []) {
    const ko = (ev.segs ?? []).map(s => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
    if (!ko || ev.tStartMs == null) continue
    const s = ev.tStartMs / 1000
    lines.push({ s: Math.round(s * 10) / 10, e: Math.round((s + (ev.dDurationMs ?? 2000) / 1000) * 10) / 10, ko })
  }
  return lines
}

if (local) {
  const lines = phrases(JSON.parse(readFileSync(src, 'utf8')))
  writeFileSync(out, JSON.stringify({ yt: path.basename(src).split('.')[0], lines }, null, 1))
  console.log(`Готово: ${lines.length} фраз → ${out}`)
} else {
  const dir = mkdtempSync(path.join(tmpdir(), 'vlog-'))
  try {
    const info = JSON.parse(execFileSync('yt-dlp', ['--no-playlist', '--dump-single-json', src], { encoding: 'utf8', maxBuffer: 1 << 26 }))
    execFileSync('yt-dlp', ['--no-playlist', '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'ko', '--sub-format', 'json3', '-o', path.join(dir, 's.%(ext)s'), src], { stdio: 'inherit' })
    const f = readdirSync(dir).find(n => n.endsWith('.json3'))
    if (!f) throw new Error('Корейских субтитров нет: нужна расшифровка речи (Whisper).')
    const lines = phrases(JSON.parse(readFileSync(path.join(dir, f), 'utf8')))
    writeFileSync(out, JSON.stringify({ yt: info.id, title: info.title, channel: info.channel ?? info.uploader, duration: info.duration, lines }, null, 1))
    console.log(`Готово: ${lines.length} фраз → ${out}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
