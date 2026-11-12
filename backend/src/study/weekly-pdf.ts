import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Лист недельного отчёта по занятиям: рисуется на сервере (холст `@napi-rs/canvas`) в том же стиле, что отчёт о занятии на сайте
 * (`frontend/src/lib/timerPdf.ts`: те же размеры, цвета и шрифты). Изменил оформление там: поправь и здесь.
 * Шрифты лежат в `backend/assets/fonts` (Archivo и Noto Sans KR, лицензия OFL): в образе сервера системных шрифтов нет.
 */
export interface WeeklySpec {
  /** семь дней подряд, от старого к новому: ответы и секунды по таймеру */
  days: { day: string; ok: number; bad: number; seconds: number }[]
  /** упражнения за неделю, самые частые сверху */
  modes: { name: string; ok: number; bad: number; days: number; seconds: number }[]
  /** повторяющиеся ошибки собраны в одну строку со счётчиком */
  mistakes: { mode: string; q: string; a: string; y: string; n: number }[]
  /** сколько ошибок было всего (в `mistakes` попадают не все) */
  mistakesTotal: number
  /** картинка шапки (баннер темы); нет: шапка с текстом */
  banner?: Buffer
  /** когда собран отчёт, уже текстом */
  made: string
}

type G = SKRSContext2D

const W = 1240
const H = 1754
const M = 70
const KO = '"Noto Sans KR", "Archivo"'
const LAT = '"Archivo", "Noto Sans KR"'
const INK = '#25264f'
const MUTED = '#7a7aa3'
const VIOLET = '#6a4fd4'
const OK = '#7a63e8'
const BAD = '#f08bd0'
const PALETTE = ['#7a63e8', '#1f93cf', '#f08bd0', '#3fb8a0', '#f2a65a', '#9a7be0', '#5fb0f0', '#e0709a', '#7cc47a', '#c9a23c']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

let fontsReady = false
function fonts() {
  if (fontsReady) return
  fontsReady = true
  const dir = fileURLToPath(new URL('../../assets/fonts/', import.meta.url))
  for (const f of readdirSync(dir)) {
    if (/\.(ttf|otf)$/.test(f)) GlobalFonts.registerFromPath(path.join(dir, f), f.startsWith('Archivo') ? 'Archivo' : 'Noto Sans KR')
  }
}

const date = (day: string) => new Date(`${day}T12:00:00`)
const percent = (ok: number, bad: number) => (ok + bad ? Math.round((ok / (ok + bad)) * 100) : 0)

/** «1 ч 05 мин», «12 мин», «меньше минуты». */
export function spent(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 1) return sec > 0 ? 'меньше минуты' : '—'
  return m >= 60 ? `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин` : `${m} мин`
}

/** «6–12 ноября 2026 г.» или «30 октября – 5 ноября 2026 г.». */
export function weekLabel(from: string, to: string): string {
  const a = date(from)
  const b = date(to)
  const long = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const end = b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${a.getDate()}–${end}` : `${long(a)} – ${end}`
}

function fit(g: G, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function rule(g: G, y: number, color = '#ece8fa', w = 1.5) {
  g.strokeStyle = color
  g.lineWidth = w
  g.beginPath()
  g.moveTo(M, y)
  g.lineTo(W - M, y)
  g.stroke()
}

function page() {
  const c = createCanvas(W, H)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.textBaseline = 'alphabetic'
  return { c, g }
}

/** Шапка с текстом: когда картинка не загрузилась. Высота 230. */
function header(g: G, label: string) {
  const grad = g.createLinearGradient(M, M, W - M, M + 230)
  grad.addColorStop(0, '#f7d3ee')
  grad.addColorStop(1, '#cfe0ff')
  g.fillStyle = grad
  g.beginPath()
  g.roundRect(M, M, W - M * 2, 230, 36)
  g.fill()
  g.fillStyle = VIOLET
  g.font = `700 26px ${KO}`
  g.fillText('✳︎ 우리말', M + 44, M + 62)
  g.fillStyle = INK
  g.font = `700 66px ${LAT}`
  g.fillText('Отчёт за неделю', M + 44, M + 140)
  g.fillStyle = '#4a4a78'
  g.font = `400 30px ${LAT}`
  g.fillText(label, M + 44, M + 192)
}

/** Шапка картинкой во всю ширину, под ней строка «Отчёт за неделю · даты». Возвращает высоту шапки. */
function picture(g: G, img: Image, label: string): number {
  const w = W - M * 2
  const h = Math.round((w * img.height) / img.width)
  g.save()
  g.beginPath()
  g.roundRect(M, M, w, h, 36)
  g.clip()
  g.drawImage(img, M, M, w, h)
  g.restore()
  g.fillStyle = INK
  g.font = `700 30px ${LAT}`
  g.fillText('Отчёт за неделю', M, M + h + 52)
  const tw = g.measureText('Отчёт за неделю').width
  g.fillStyle = '#4a4a78'
  g.font = `400 28px ${LAT}`
  g.fillText(`· ${label}`, M + tw + 12, M + h + 52)
  return h + 60
}

function tiles(g: G, items: [string, string][], y: number) {
  const gap = 16
  const w = (W - M * 2 - gap * (items.length - 1)) / items.length
  items.forEach(([v, k], i) => {
    const x = M + i * (w + gap)
    g.fillStyle = '#f3effd'
    g.beginPath()
    g.roundRect(x, y, w, 128, 24)
    g.fill()
    g.textAlign = 'center'
    g.fillStyle = '#5a3fc4'
    g.font = `700 ${v.length > 6 ? 36 : 46}px ${LAT}`
    g.fillText(v, x + w / 2, y + 66)
    g.fillStyle = '#5d5d88'
    g.font = `400 22px ${LAT}`
    g.fillText(k, x + w / 2, y + 102)
  })
  g.textAlign = 'left'
}

/** График «ответы по дням»: столбик на день (верные и ошибки), над ним число ответов, под днём время по таймеру. */
function chart(g: G, spec: WeeklySpec, y: number, h: number) {
  g.fillStyle = INK
  g.font = `700 32px ${LAT}`
  g.fillText('Ответы по дням', M, y)
  let lx = W - M
  g.font = `400 22px ${LAT}`
  for (const [col, name] of [[BAD, 'Ошибки'], [OK, 'Верно']] as const) {
    const tw = g.measureText(name).width
    g.fillStyle = INK
    g.textAlign = 'right'
    g.fillText(name, lx, y)
    g.fillStyle = col
    g.beginPath()
    g.roundRect(lx - tw - 30, y - 18, 18, 18, 5)
    g.fill()
    lx -= tw + 60
  }
  g.textAlign = 'left'
  const x0 = M + 54
  const x1 = W - M - 10
  const top = y + 70
  const bottom = y + h - 90
  const max = Math.max(1, ...spec.days.map(d => d.ok + d.bad))
  const top4 = Math.max(4, Math.ceil(max / 4) * 4)
  g.font = `400 20px ${LAT}`
  for (let i = 0; i <= 4; i++) {
    const yy = bottom - ((bottom - top) * i) / 4
    g.strokeStyle = i === 0 ? '#cfc8ee' : '#ece8fa'
    g.lineWidth = i === 0 ? 2 : 1
    g.beginPath()
    g.moveTo(x0, yy)
    g.lineTo(x1, yy)
    g.stroke()
    g.fillStyle = MUTED
    g.textAlign = 'right'
    g.fillText(String((top4 / 4) * i), x0 - 12, yy + 7)
  }
  const bw = (x1 - x0) / spec.days.length
  const w = Math.min(86, bw * 0.56)
  const ph = (v: number) => ((bottom - top) * v) / top4
  g.textAlign = 'center'
  spec.days.forEach((d, i) => {
    const cx = x0 + i * bw + bw / 2
    const x = cx - w / 2
    if (d.ok) {
      g.fillStyle = OK
      g.beginPath()
      g.roundRect(x, bottom - ph(d.ok), w, ph(d.ok), d.bad ? 0 : [8, 8, 0, 0])
      g.fill()
    }
    if (d.bad) {
      g.fillStyle = BAD
      g.beginPath()
      g.roundRect(x, bottom - ph(d.ok + d.bad), w, Math.max(3, ph(d.bad) - (d.ok ? 2 : 0)), [8, 8, 0, 0])
      g.fill()
    }
    if (d.ok + d.bad) {
      g.fillStyle = INK
      g.font = `600 22px ${LAT}`
      g.fillText(String(d.ok + d.bad), cx, bottom - ph(d.ok + d.bad) - 10)
    }
    const dt = date(d.day)
    g.fillStyle = INK
    g.font = `600 22px ${LAT}`
    g.fillText(`${WEEKDAYS[dt.getDay()]} ${dt.getDate()}`, cx, bottom + 34)
    g.fillStyle = MUTED
    g.font = `400 20px ${LAT}`
    g.fillText(d.seconds > 0 ? spent(d.seconds) : '—', cx, bottom + 64)
  })
  g.textAlign = 'left'
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText('Под днём время по таймеру.', x0, bottom + 100)
}

const COLS = [M, M + 470, M + 620, M + 870, M + 970]

function tableHead(g: G, y: number) {
  g.fillStyle = MUTED
  g.font = `600 18px ${LAT}`
  ;['УПРАЖНЕНИЕ', 'ОТВЕТОВ', 'ДОЛЯ ВЕРНЫХ', 'ДНЕЙ', 'ВРЕМЯ'].forEach((t, i) => g.fillText(t, COLS[i]!, y))
  rule(g, y + 14, '#d9d2f5', 3)
}

function row(g: G, r: WeeklySpec['modes'][number], col: string, y: number) {
  g.fillStyle = col
  g.beginPath()
  g.arc(M + 9, y - 8, 9, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = INK
  g.font = `700 24px ${LAT}`
  g.fillText(fit(g, r.name, 420), M + 32, y)
  g.font = `400 24px ${LAT}`
  g.fillText(String(r.ok + r.bad), COLS[1]!, y)
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText(`${r.ok} / ${r.bad}`, COLS[1]! + 62, y)
  const p = percent(r.ok, r.bad)
  g.fillStyle = '#e8e3fa'
  g.beginPath()
  g.roundRect(COLS[2]!, y - 16, 150, 14, 7)
  g.fill()
  if (p > 0) {
    const bar = g.createLinearGradient(COLS[2]!, 0, COLS[2]! + 150, 0)
    bar.addColorStop(0, '#f08bd0')
    bar.addColorStop(1, '#7aa7ff')
    g.fillStyle = bar
    g.beginPath()
    g.roundRect(COLS[2]!, y - 16, Math.max(14, (150 * p) / 100), 14, 7)
    g.fill()
  }
  g.fillStyle = INK
  g.font = `400 24px ${LAT}`
  g.fillText(`${p}%`, COLS[2]! + 164, y)
  g.fillText(String(r.days), COLS[3]!, y)
  g.font = `400 22px ${LAT}`
  g.fillText(spent(r.seconds), COLS[4]!, y)
  rule(g, y + 20)
}

const MCOLS = [M, M + 250, M + 600, M + 830, M + 1040]

function mistakesHead(g: G, y: number) {
  g.fillStyle = MUTED
  g.font = `600 18px ${LAT}`
  ;['УПРАЖНЕНИЕ', 'ВОПРОС', 'ВЕРНО', 'ТВОЙ ОТВЕТ', 'РАЗ'].forEach((t, i) => g.fillText(t, MCOLS[i]!, y))
  rule(g, y + 14, '#d9d2f5', 3)
}

function mistakeRow(g: G, a: WeeklySpec['mistakes'][number], y: number) {
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText(fit(g, a.mode, 230), MCOLS[0]!, y)
  g.fillStyle = INK
  g.font = `700 22px ${KO}`
  g.fillText(fit(g, a.q || '—', 330), MCOLS[1]!, y)
  g.fillStyle = '#2f8f6b'
  g.fillText(fit(g, a.a || '—', 210), MCOLS[2]!, y)
  g.fillStyle = '#c2478f'
  g.font = `400 22px ${KO}`
  g.fillText(fit(g, a.y || '—', 190), MCOLS[3]!, y)
  g.fillStyle = a.n > 1 ? INK : MUTED
  g.font = `${a.n > 1 ? 700 : 400} 22px ${LAT}`
  g.fillText(String(a.n), MCOLS[4]!, y)
  rule(g, y + 18)
}

/** Каждая страница это JPEG на весь лист A4 (как `frontend/src/lib/pdf.ts`). */
export function buildPdf(pages: { jpeg: Buffer; width: number; height: number }[], title: string): Buffer {
  const A4 = { w: 595.28, h: 841.89 }
  const parts: Buffer[] = []
  const offsets: number[] = []
  let size = 0
  const push = (b: Buffer | string) => {
    const u = typeof b === 'string' ? Buffer.from(b, 'utf8') : b
    parts.push(u)
    size += u.length
  }
  const obj = (n: number, body: (Buffer | string)[]) => {
    offsets[n] = size
    push(`${n} 0 obj\n`)
    body.forEach(push)
    push('\nendobj\n')
  }
  const first = (i: number) => 4 + i * 3
  push(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'))
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${first(i)} 0 R`).join(' ')}] >>`])
  const u16 = Array.from('﻿' + title, c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()
  obj(3, [`<< /Title <${u16}> /Producer (korean) >>`])
  pages.forEach((p, i) => {
    const n = first(i)
    obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`])
    const content = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`
    obj(n + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`])
    obj(n + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ])
  })
  const count = first(pages.length)
  const xref = size
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return Buffer.concat(parts)
}

/** Рисует недельный отчёт и возвращает PDF. */
export async function renderWeeklyPdf(spec: WeeklySpec): Promise<Buffer> {
  fonts()
  const label = weekLabel(spec.days[0]!.day, spec.days.at(-1)!.day)
  const img = spec.banner ? await loadImage(spec.banner).catch(() => null) : null
  const ok = spec.days.reduce((s, d) => s + d.ok, 0)
  const bad = spec.days.reduce((s, d) => s + d.bad, 0)
  const seconds = spec.days.reduce((s, d) => s + d.seconds, 0)
  const active = spec.days.filter(d => d.ok + d.bad > 0 || d.seconds > 0).length

  const pages: ReturnType<typeof page>[] = []
  let cur = page()
  pages.push(cur)
  const LAST = H - 120
  const next = (y: number, need: number): number => {
    if (y + need <= LAST) return y
    cur = page()
    pages.push(cur)
    return M + 40
  }

  const shift = img ? picture(cur.g, img, label) - 230 : 0
  if (!img) header(cur.g, label)
  tiles(
    cur.g,
    [
      [spent(seconds), 'по таймеру'],
      [String(ok + bad), 'ответов'],
      [ok + bad ? percent(ok, bad) + '%' : '—', 'верных'],
      [String(bad), 'ошибок'],
      [`${active} из ${spec.days.length}`, 'дней с занятиями'],
    ],
    330 + shift,
  )
  chart(cur.g, spec, 530 + shift, 480)

  // таблица начинается на первом листе, только если там поместятся хотя бы три строки
  let y = next(1080 + shift, 100 + 54 * 3)
  cur.g.fillStyle = INK
  cur.g.font = `700 32px ${LAT}`
  cur.g.fillText('Упражнения за неделю', M, y)
  y += 50
  if (!spec.modes.length) {
    cur.g.fillStyle = MUTED
    cur.g.font = `400 24px ${LAT}`
    cur.g.fillText('За эту неделю ответов в играх и тренажёрах не было.', M, y)
    y += 40
  } else {
    tableHead(cur.g, y)
    y += 50
    spec.modes.forEach((r, i) => {
      const ny = next(y, 30)
      if (ny !== y) {
        tableHead(cur.g, ny)
        y = ny + 50
      }
      row(cur.g, r, PALETTE[i % PALETTE.length]!, y)
      y += 54
    })
    cur.g.fillStyle = MUTED
    cur.g.font = `400 20px ${LAT}`
    if (y + 10 <= LAST) cur.g.fillText('Время по упражнениям примерное: считается по промежуткам между ответами.', M, y + 10)
    y += 30
  }

  if (spec.mistakes.length) {
    y = next(y + 50, 200)
    cur.g.fillStyle = INK
    cur.g.font = `700 32px ${LAT}`
    cur.g.fillText(`Ошибки · ${spec.mistakesTotal}`, M, y)
    y += 50
    mistakesHead(cur.g, y)
    y += 46
    for (const a of spec.mistakes) {
      const ny = next(y, 30)
      if (ny !== y) {
        mistakesHead(cur.g, ny)
        y = ny + 46
      }
      mistakeRow(cur.g, a, y)
      y += 46
    }
    const shown = spec.mistakes.reduce((s, a) => s + a.n, 0)
    if (spec.mistakesTotal > shown) {
      y = next(y, 30)
      cur.g.fillStyle = MUTED
      cur.g.font = `400 22px ${LAT}`
      cur.g.fillText(`и ещё ${spec.mistakesTotal - shown}: все ответы есть на странице отчёта`, M, y + 6)
    }
  }

  pages.forEach((p, i) => {
    p.g.fillStyle = '#9a9ac0'
    p.g.font = `400 20px ${LAT}`
    p.g.textAlign = 'center'
    p.g.fillText(`Сформировано на платформе 우리말 · ${spec.made}${pages.length > 1 ? ` · стр. ${i + 1} из ${pages.length}` : ''}`, W / 2, H - 46)
    p.g.textAlign = 'left'
  })
  return buildPdf(pages.map(p => ({ jpeg: p.c.toBuffer('image/jpeg', 92), width: W, height: H })), `Отчёт за неделю: ${label}`)
}
