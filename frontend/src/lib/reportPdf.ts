import '@/assets/home/fonts.css'
import { buildPdf, canvasJpeg } from '@/lib/pdf'
import { percent, spent, type ReportGroup } from '@/data/report'

/** Что нужно для листа: раздел отчёта, период и ответы по дням для графика. */
export interface ReportPdfSpec {
  group: ReportGroup
  /** подпись периода: «за последние 30 дней» */
  period: string
  days: { day: string; ok: number; bad: number }[]
  /** дата формирования, уже по-русски */
  date: string
}

const W = 1240
const H = 1754
const M = 70
const KO = '"Noto Sans KR", "Archivo", sans-serif'
const LAT = '"Archivo", "Noto Sans KR", sans-serif'
const INK = '#25264f'
const MUTED = '#7a7aa3'
const VIOLET = '#6a4fd4'

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 40px "Archivo"', 'Абв Abc'),
      document.fonts.load('600 26px "Archivo"', 'Абв Abc'),
      document.fonts.load('400 22px "Archivo"', 'Абв Abc'),
      document.fonts.load('700 40px "Noto Sans KR"', '우리말'),
      document.fonts.load('400 22px "Noto Sans KR"', '우리말'),
    ])
  } catch {
    /* без загрузки шрифтов рисуем системным */
  }
}

function page(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.textBaseline = 'alphabetic'
  return { c, g }
}

const label = (d: string) => `${Number(d.slice(8))}.${d.slice(5, 7)}`
const dateShort = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

function header(g: CanvasRenderingContext2D, spec: ReportPdfSpec) {
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
  g.fillText('Отчёт по занятиям', M + 44, M + 140)
  g.fillStyle = '#4a4a78'
  g.font = `400 30px ${LAT}`
  g.fillText(`${spec.group.name} · ${spec.period}`, M + 44, M + 192)
  g.font = `400 26px ${LAT}`
  g.textAlign = 'right'
  g.fillText(spec.date, W - M - 44, M + 62)
  g.textAlign = 'left'
}

function tiles(g: CanvasRenderingContext2D, spec: ReportPdfSpec, y: number) {
  const { group } = spec
  const items: [string, string][] = [
    [String(group.ok + group.bad), 'ответов'],
    [percent(group.ok, group.bad) + '%', 'верных'],
    [String(group.ok), 'верно'],
    [String(group.bad), 'ошибок'],
    [spent(group.seconds), 'время, примерно'],
  ]
  const gap = 16
  const w = (W - M * 2 - gap * 4) / 5
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

/** График «ответы по дням»: заливка под всеми ответами и линия верных. */
function chart(g: CanvasRenderingContext2D, spec: ReportPdfSpec, y: number, h: number) {
  g.fillStyle = INK
  g.font = `700 32px ${LAT}`
  g.fillText('Ответы по дням', M, y)
  const x0 = M + 54
  const x1 = W - M - 10
  const top = y + 54
  const bottom = y + h - 54
  const days = spec.days
  const totals = days.map(d => d.ok + d.bad)
  const max = Math.max(1, ...totals)
  // потолок оси кратен четырём, чтобы все подписи были целыми
  const top4 = Math.max(4, Math.ceil(max / 4) * 4)
  g.font = `400 20px ${LAT}`
  for (let i = 0; i <= 4; i++) {
    const v = (top4 / 4) * i
    const yy = bottom - ((bottom - top) * i) / 4
    g.strokeStyle = i === 0 ? '#cfc8ee' : '#ece8fa'
    g.lineWidth = i === 0 ? 2 : 1
    g.beginPath()
    g.moveTo(x0, yy)
    g.lineTo(x1, yy)
    g.stroke()
    g.fillStyle = MUTED
    g.textAlign = 'right'
    g.fillText(String(v), x0 - 12, yy + 7)
  }
  g.textAlign = 'left'
  if (!days.length || max <= 1 && totals.every(t => t === 0)) {
    g.fillStyle = MUTED
    g.font = `400 26px ${LAT}`
    g.fillText('За этот период ответов нет.', x0 + 20, (top + bottom) / 2)
    return
  }
  const px = (i: number) => (days.length === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (days.length - 1))
  const py = (v: number) => bottom - ((bottom - top) * v) / top4
  // заливка и линия «всего»
  const fill = g.createLinearGradient(0, top, 0, bottom)
  fill.addColorStop(0, 'rgba(31,147,207,.35)')
  fill.addColorStop(1, 'rgba(31,147,207,.03)')
  g.beginPath()
  g.moveTo(px(0), bottom)
  totals.forEach((v, i) => g.lineTo(px(i), py(v)))
  g.lineTo(px(days.length - 1), bottom)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  const line = (vals: number[], color: string, w: number) => {
    g.beginPath()
    vals.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))))
    g.strokeStyle = color
    g.lineWidth = w
    g.lineJoin = 'round'
    g.stroke()
  }
  line(totals, '#1f93cf', 4)
  line(days.map(d => d.ok), '#7a63e8', 4)
  // подписи дней: не больше 8
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.textAlign = 'center'
  const every = Math.max(1, Math.ceil(days.length / 8))
  const idx: number[] = []
  for (let i = 0; i < days.length; i += every) idx.push(i)
  const lastI = days.length - 1
  // последнюю подпись добавляем, только если она не налезает на предыдущую
  if (idx[idx.length - 1] !== lastI && lastI - idx[idx.length - 1]! >= every * 0.6) idx.push(lastI)
  idx.forEach(i => g.fillText(label(days[i]!.day), px(i), bottom + 32))
  g.textAlign = 'left'
  // легенда справа от заголовка графика
  const legend: [string, string][] = [['#7a63e8', 'Верных'], ['#1f93cf', 'Всего ответов']]
  let lx = W - M
  g.font = `400 22px ${LAT}`
  legend.forEach(([col, name]) => {
    const tw = g.measureText(name).width
    g.fillStyle = INK
    g.textAlign = 'right'
    g.fillText(name, lx, y)
    g.fillStyle = col
    g.fillRect(lx - tw - 40, y - 10, 30, 8)
    lx -= tw + 40 + 30
  })
  g.textAlign = 'left'
}

const COLS = [M, M + 330, M + 470, M + 740, M + 815, M + 965]

function tableHead(g: CanvasRenderingContext2D, y: number) {
  g.fillStyle = MUTED
  g.font = `600 18px ${LAT}`
  ;['РЕЖИМ', 'ОТВЕТОВ', 'ДОЛЯ ВЕРНЫХ', 'ДНЕЙ', 'ВРЕМЯ', 'ПОСЛЕДНИЙ'].forEach((t, i) => g.fillText(t, COLS[i]!, y))
  g.strokeStyle = '#d9d2f5'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(M, y + 14)
  g.lineTo(W - M, y + 14)
  g.stroke()
}

function row(g: CanvasRenderingContext2D, r: ReportPdfSpec['group']['rows'][number], y: number) {
  g.fillStyle = INK
  // длинное название сначала уменьшаем, и только потом обрезаем
  let fs = 25
  g.font = `700 ${fs}px ${LAT}`
  while (g.measureText(r.name).width > 295 && fs > 20) g.font = `700 ${--fs}px ${LAT}`
  let name = r.name
  while (g.measureText(name).width > 295 && name.length > 4) name = name.slice(0, -2)
  g.fillText(name === r.name ? name : name + '…', COLS[0]!, y)
  g.font = `400 24px ${LAT}`
  g.fillText(String(r.ok + r.bad), COLS[1]!, y)
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText(`${r.ok} / ${r.bad}`, COLS[1]! + 64, y)
  const p = percent(r.ok, r.bad)
  g.fillStyle = '#e8e3fa'
  g.beginPath()
  g.roundRect(COLS[2]!, y - 16, 170, 14, 7)
  g.fill()
  if (p > 0) {
    const bar = g.createLinearGradient(COLS[2]!, 0, COLS[2]! + 170, 0)
    bar.addColorStop(0, '#f08bd0')
    bar.addColorStop(1, '#7aa7ff')
    g.fillStyle = bar
    g.beginPath()
    g.roundRect(COLS[2]!, y - 16, Math.max(14, (170 * p) / 100), 14, 7)
    g.fill()
  }
  g.fillStyle = INK
  g.font = `400 24px ${LAT}`
  g.fillText(`${p}%`, COLS[2]! + 184, y)
  g.fillText(String(r.days), COLS[3]!, y)
  g.font = `400 22px ${LAT}`
  g.fillText(spent(r.seconds), COLS[4]!, y)
  g.font = `400 24px ${LAT}`
  g.fillText(dateShort(r.last), COLS[5]!, y)
  g.strokeStyle = '#ece8fa'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(M, y + 22)
  g.lineTo(W - M, y + 22)
  g.stroke()
}

function footer(g: CanvasRenderingContext2D, spec: ReportPdfSpec, n: number, total: number) {
  g.fillStyle = '#9a9ac0'
  g.font = `400 20px ${LAT}`
  g.textAlign = 'center'
  g.fillText(`Сформировано на платформе 우리말 · ${spec.date}${total > 1 ? ` · стр. ${n} из ${total}` : ''}`, W / 2, H - 46)
  g.textAlign = 'left'
}

/** Рисует лист (или несколько, если режимов много) и возвращает готовый PDF. */
export async function renderReportPdf(spec: ReportPdfSpec): Promise<Blob> {
  await loadFonts()
  const pages: { c: HTMLCanvasElement; g: CanvasRenderingContext2D }[] = []
  let cur = page()
  pages.push(cur)
  header(cur.g, spec)
  tiles(cur.g, spec, 330)
  chart(cur.g, spec, 520, 440)
  let y = 1040
  cur.g.fillStyle = INK
  cur.g.font = `700 32px ${LAT}`
  cur.g.fillText('По режимам', M, y)
  y += 52
  tableHead(cur.g, y)
  y += 52
  const LAST = H - 120
  for (const r of spec.group.rows) {
    if (y > LAST) {
      cur = page()
      pages.push(cur)
      y = M + 40
      tableHead(cur.g, y)
      y += 52
    }
    row(cur.g, r, y)
    y += 58
  }
  cur.g.fillStyle = MUTED
  cur.g.font = `400 20px ${LAT}`
  if (y < H - 140) cur.g.fillText('Время по режимам примерное: считается по промежуткам между ответами.', M, y + 10)
  pages.forEach((p, i) => footer(p.g, spec, i + 1, pages.length))
  const jpegs = await Promise.all(pages.map(p => canvasJpeg(p.c)))
  return buildPdf(jpegs.map(jpeg => ({ jpeg, width: W, height: H })), `Отчёт: ${spec.group.name}`)
}
