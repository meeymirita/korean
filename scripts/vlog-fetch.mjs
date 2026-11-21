// Субтитры ютуб-видео по фразам со временем: node scripts/vlog-fetch.mjs <ссылка> <файл.json>
// Берёт корейские субтитры (свои или автоматические) через yt-dlp, звук и видео не скачивает.
// Результат (название, канал, фразы s/e/ko) кладите вне репозитория, перевод и разбор дописываются потом вручную.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, out] = process.argv.slice(2)
if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url ?? '') || !out) {
  console.error('Использование: node scripts/vlog-fetch.mjs <ссылка на ютуб> <файл.json>')
  process.exit(1)
}
const dir = mkdtempSync(join(tmpdir(), 'vlog-'))
try {
  const info = JSON.parse(execFileSync('yt-dlp', ['--no-playlist', '--dump-single-json', url], { encoding: 'utf8', maxBuffer: 1 << 26 }))
  execFileSync('yt-dlp', ['--no-playlist', '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'ko', '--sub-format', 'json3', '-o', join(dir, 's.%(ext)s'), url], { stdio: 'inherit' })
  const f = readdirSync(dir).find(n => n.endsWith('.json3'))
  if (!f) throw new Error('Корейских субтитров нет: нужна расшифровка речи (Whisper).')
  const lines = []
  for (const ev of JSON.parse(readFileSync(join(dir, f), 'utf8')).events ?? []) {
    const ko = (ev.segs ?? []).map(s => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
    if (!ko || ev.tStartMs == null) continue
    const s = ev.tStartMs / 1000
    lines.push({ s: Math.round(s * 10) / 10, e: Math.round((s + (ev.dDurationMs ?? 2000) / 1000) * 10) / 10, ko })
  }
  writeFileSync(out, JSON.stringify({ yt: info.id, title: info.title, channel: info.channel ?? info.uploader, duration: info.duration, lines }, null, 1))
  console.log(`Готово: ${lines.length} фраз → ${out}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
