import { buildPdf, canvasJpeg } from '@/lib/pdf'
import { H, INK, KO, LAT, M, MUTED, VIOLET, W, loadFonts, page } from '@/lib/reportPdf'
import { modeName, percent, spent } from '@/data/report'
import { groupSessions, lasted, type AnswerItem, type Session } from '@/data/sessions'

/** Что нужно для отчёта об одном запуске таймера: когда шёл, сколько насчитал и ответы за это время. */
export interface TimerPdfSpec {
  start: number
  end: number
  /** секунд по таймеру */
  seconds: number
  answers: AnswerItem[]
  /** картинка в шапке листа; по умолчанию баннер темы из `public/tg` */
  banner?: string
}

type G = CanvasRenderingContext2D

const OK = '#7a63e8'
const BAD = '#f08bd0'
/** Цвета упражнений на полосе под графиком и в таблице: у одного режима один цвет. */
const PALETTE = ['#7a63e8', '#1f93cf', '#f08bd0', '#3fb8a0', '#f2a65a', '#9a7be0', '#5fb0f0', '#e0709a', '#7cc47a', '#c9a23c']
/** Сколько ошибок показываем, остальное строкой «и ещё N». */
const MAX_MISTAKES = 60

const clock = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dateLong = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/** Обрезает текст под ширину, в конце многоточие. */
function fit(g: G, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function header(g: G, spec: TimerPdfSpec) {
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
  g.fillText('Отчёт о занятии', M + 44, M + 140)
  g.fillStyle = '#4a4a78'
  g.font = `400 30px ${LAT}`
  g.fillText(`${dateLong(spec.start)} · ${clock(spec.start)}–${clock(spec.end)}`, M + 44, M + 192)
}

/** Картинка шапки (баннер темы «Отчёт по занятиям»): не загрузилась, рисуем прежнюю шапку с текстом. */
function loadBanner(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

/** Шапка картинкой во всю ширину листа (2:1), под ней строка с датой и временем занятия. Возвращает высоту шапки. */
function picture(g: G, img: HTMLImageElement, spec: TimerPdfSpec): number {
  const w = W - M * 2
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth)
  g.save()
  g.beginPath()
  g.roundRect(M, M, w, h, 36)
  g.clip()
  g.drawImage(img, M, M, w, h)
  g.restore()
  g.fillStyle = '#4a4a78'
  g.font = `400 28px ${LAT}`
  g.fillText(`${dateLong(spec.start)} · ${clock(spec.start)}–${clock(spec.end)}`, M, M + h + 52)
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

/** Шаг столбика в минутах: такой, чтобы столбиков было не больше 36. */
function stepOf(spanMs: number): number {
  return [1, 2, 5, 10, 15, 30, 60, 120].find(m => spanMs / (m * 60_000) <= 36) ?? 240
}

/** График «ответы по времени»: столбики верных и ошибок, под осью полоса упражнений. */
function chart(g: G, spec: TimerPdfSpec, sessions: Session[], color: (mode: string) => string, y: number, h: number) {
  g.fillStyle = INK
  g.font = `700 32px ${LAT}`
  g.fillText('Ответы по времени', M, y)
  const legend: [string, string][] = [[BAD, 'Ошибки'], [OK, 'Верно']]
  let lx = W - M
  g.font = `400 22px ${LAT}`
  legend.forEach(([col, name]) => {
    const tw = g.measureText(name).width
    g.fillStyle = INK
    g.textAlign = 'right'
    g.fillText(name, lx, y)
    g.fillStyle = col
    g.beginPath()
    g.roundRect(lx - tw - 30, y - 18, 18, 18, 5)
    g.fill()
    lx -= tw + 60
  })
  g.textAlign = 'left'

  const x0 = M + 54
  const x1 = W - M - 10
  const top = y + 54
  const bottom = y + h - 120
  const span = Math.max(60_000, spec.end - spec.start)
  const stepMin = stepOf(span)
  const stepMs = stepMin * 60_000
  const n = Math.max(1, Math.ceil(span / stepMs))
  const buckets = Array.from({ length: n }, () => ({ ok: 0, bad: 0 }))
  for (const a of spec.answers) {
    const b = buckets[Math.min(n - 1, Math.max(0, Math.floor((a.t - spec.start) / stepMs)))]!
    if (a.ok) b.ok++
    else b.bad++
  }
  const max = Math.max(1, ...buckets.map(b => b.ok + b.bad))
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
  g.textAlign = 'left'
  // ось времени общая для столбиков и полосы: от начала таймера до конца последнего столбика
  const total = n * stepMs
  const px = (t: number) => x0 + ((x1 - x0) * Math.min(total, Math.max(0, t - spec.start))) / total
  const bw = (x1 - x0) / n
  const pad = Math.min(8, bw * 0.15)
  const ph = (v: number) => ((bottom - top) * v) / top4
  buckets.forEach((b, i) => {
    const x = x0 + i * bw + pad
    const w = bw - pad * 2
    const r = Math.min(6, w / 2)
    if (b.ok) {
      g.fillStyle = OK
      g.beginPath()
      g.roundRect(x, bottom - ph(b.ok), w, ph(b.ok), b.bad ? 0 : [r, r, 0, 0])
      g.fill()
    }
    if (b.bad) {
      // между верными и ошибками белая щель в два пикселя
      const hh = Math.max(3, ph(b.bad) - (b.ok ? 2 : 0))
      g.fillStyle = BAD
      g.beginPath()
      g.roundRect(x, bottom - ph(b.ok + b.bad), w, hh, [r, r, 0, 0])
      g.fill()
    }
  })
  // подписи времени: не больше 9
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.textAlign = 'center'
  const every = Math.max(1, Math.ceil(n / 8))
  for (let i = 0; i <= n; i += every) g.fillText(clock(spec.start + i * stepMs), x0 + i * bw, bottom + 30)
  g.textAlign = 'left'
  // полоса упражнений
  const sy = bottom + 52
  g.fillStyle = '#f3effd'
  g.beginPath()
  g.roundRect(x0, sy, x1 - x0, 26, 13)
  g.fill()
  for (const s of sessions) {
    const a = px(s.start)
    const w = Math.max(8, px(s.end) - a)
    g.fillStyle = color(s.mode)
    g.beginPath()
    g.roundRect(Math.min(a, x1 - w), sy, w, 26, 8)
    g.fill()
  }
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText(`Столбик: ${stepMin} мин. Полоса под графиком: какое упражнение шло, цвета как в таблице ниже.`, x0, sy + 58)
}

const COLS = [M, M + 470, M + 590, M + 730, M + 990]

function tableHead(g: G, y: number) {
  g.fillStyle = MUTED
  g.font = `600 18px ${LAT}`
  ;['УПРАЖНЕНИЕ', 'НАЧАЛО', 'ОТВЕТОВ', 'ДОЛЯ ВЕРНЫХ', 'ДЛИЛОСЬ'].forEach((t, i) => g.fillText(t, COLS[i]!, y))
  rule(g, y + 14, '#d9d2f5', 3)
}

function rule(g: G, y: number, color = '#ece8fa', w = 1.5) {
  g.strokeStyle = color
  g.lineWidth = w
  g.beginPath()
  g.moveTo(M, y)
  g.lineTo(W - M, y)
  g.stroke()
}

function row(g: G, s: Session, col: string, y: number) {
  g.fillStyle = col
  g.beginPath()
  g.arc(M + 9, y - 8, 9, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = INK
  g.font = `700 24px ${LAT}`
  g.fillText(fit(g, modeName(s.mode), 420), M + 32, y)
  g.font = `400 24px ${LAT}`
  g.fillText(clock(s.start), COLS[1]!, y)
  g.fillText(String(s.ok + s.bad), COLS[2]!, y)
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText(`${s.ok} / ${s.bad}`, COLS[2]! + 50, y)
  const p = percent(s.ok, s.bad)
  g.fillStyle = '#e8e3fa'
  g.beginPath()
  g.roundRect(COLS[3]!, y - 16, 150, 14, 7)
  g.fill()
  if (p > 0) {
    const bar = g.createLinearGradient(COLS[3]!, 0, COLS[3]! + 150, 0)
    bar.addColorStop(0, '#f08bd0')
    bar.addColorStop(1, '#7aa7ff')
    g.fillStyle = bar
    g.beginPath()
    g.roundRect(COLS[3]!, y - 16, Math.max(14, (150 * p) / 100), 14, 7)
    g.fill()
  }
  g.fillStyle = INK
  g.font = `400 24px ${LAT}`
  g.fillText(`${p}%`, COLS[3]! + 164, y)
  g.font = `400 22px ${LAT}`
  g.fillText(s.end > s.start ? lasted(s.end - s.start) : '—', COLS[4]!, y)
  rule(g, y + 20)
}

const MCOLS = [M, M + 250, M + 620, M + 860]

function mistakesHead(g: G, y: number) {
  g.fillStyle = MUTED
  g.font = `600 18px ${LAT}`
  ;['УПРАЖНЕНИЕ', 'ВОПРОС', 'ВЕРНО', 'ТВОЙ ОТВЕТ'].forEach((t, i) => g.fillText(t, MCOLS[i]!, y))
  rule(g, y + 14, '#d9d2f5', 3)
}

function mistakeRow(g: G, a: AnswerItem, y: number) {
  g.fillStyle = MUTED
  g.font = `400 20px ${LAT}`
  g.fillText(fit(g, modeName(a.mode), 230), MCOLS[0]!, y)
  g.fillStyle = INK
  g.font = `600 22px ${KO}`
  g.fillText(fit(g, a.d?.q ?? a.w ?? '—', 350), MCOLS[1]!, y)
  g.fillStyle = '#2f8f6b'
  g.fillText(fit(g, a.d?.a ?? '—', 220), MCOLS[2]!, y)
  g.fillStyle = '#c2478f'
  g.font = `400 22px ${KO}`
  g.fillText(fit(g, a.d?.y ?? '—', W - M - MCOLS[3]!), MCOLS[3]!, y)
  rule(g, y + 18)
}

function footer(g: G, date: string, n: number, total: number) {
  g.fillStyle = '#9a9ac0'
  g.font = `400 20px ${LAT}`
  g.textAlign = 'center'
  g.fillText(`Сформировано на платформе 우리말 · ${date}${total > 1 ? ` · стр. ${n} из ${total}` : ''}`, W / 2, H - 46)
  g.textAlign = 'left'
}

/** Рисует отчёт об одном запуске таймера: плитки, график по времени, упражнения по порядку и ошибки. */
export async function renderTimerPdf(spec: TimerPdfSpec): Promise<Blob> {
  await loadFonts()
  const answers = spec.answers.filter(a => a.t >= spec.start && a.t <= spec.end)
  const sessions = groupSessions(answers).reverse()
  const modes = [...new Set(sessions.map(s => s.mode))]
  const color = (mode: string) => PALETTE[modes.indexOf(mode) % PALETTE.length]!
  const ok = answers.filter(a => a.ok).length
  const bad = answers.length - ok

  const pages: { c: HTMLCanvasElement; g: G }[] = []
  let cur = page()
  pages.push(cur)
  const LAST = H - 120
  /** Не хватает места: новая страница; возвращает, была ли она открыта. */
  const next = (y: number, need: number): number => {
    if (y + need <= LAST) return y
    cur = page()
    pages.push(cur)
    return M + 40
  }

  const img = await loadBanner(spec.banner ?? '/tg/tg-study.png')
  // с картинкой шапка выше прежней (230): всё, что ниже, сдвигается
  const shift = img ? picture(cur.g, img, spec) - 230 : 0
  if (!img) header(cur.g, spec)
  tiles(
    cur.g,
    [
      [spent(spec.seconds), 'по таймеру'],
      [String(answers.length), 'ответов'],
      [answers.length ? percent(ok, bad) + '%' : '—', 'верных'],
      [String(bad), 'ошибок'],
      [String(sessions.length), 'упражнений'],
    ],
    330 + shift,
  )
  chart(cur.g, { ...spec, answers }, sessions, color, 530 + shift, 480)

  // таблица начинается на первом листе, только если там поместятся хотя бы три строки
  let y = next(1080 + shift, 100 + 54 * 3)
  cur.g.fillStyle = INK
  cur.g.font = `700 32px ${LAT}`
  cur.g.fillText('Что было на занятии', M, y)
  y += 50
  if (!sessions.length) {
    cur.g.fillStyle = MUTED
    cur.g.font = `400 24px ${LAT}`
    cur.g.fillText('Пока шёл таймер, ответов в играх и тренажёрах не было.', M, y)
    y += 40
  } else {
    tableHead(cur.g, y)
    y += 50
    for (const s of sessions) {
      const ny = next(y, 30)
      if (ny !== y) {
        tableHead(cur.g, ny)
        y = ny + 50
      }
      row(cur.g, s, color(s.mode), y)
      y += 54
    }
  }

  const wrong = answers.filter(a => !a.ok).sort((a, b) => a.t - b.t)
  if (wrong.length) {
    y = next(y + 50, 200)
    cur.g.fillStyle = INK
    cur.g.font = `700 32px ${LAT}`
    cur.g.fillText(`Ошибки · ${wrong.length}`, M, y)
    y += 50
    mistakesHead(cur.g, y)
    y += 46
    for (const a of wrong.slice(0, MAX_MISTAKES)) {
      const ny = next(y, 30)
      if (ny !== y) {
        mistakesHead(cur.g, ny)
        y = ny + 46
      }
      mistakeRow(cur.g, a, y)
      y += 46
    }
    if (wrong.length > MAX_MISTAKES) {
      y = next(y, 30)
      cur.g.fillStyle = MUTED
      cur.g.font = `400 22px ${LAT}`
      cur.g.fillText(`и ещё ${wrong.length - MAX_MISTAKES}: все ответы есть на странице отчёта`, M, y + 6)
    }
  }

  const date = `${dateLong(spec.end)}, ${clock(spec.end)}`
  pages.forEach((p, i) => footer(p.g, date, i + 1, pages.length))
  const jpegs = await Promise.all(pages.map(p => canvasJpeg(p.c)))
  return buildPdf(jpegs.map(jpeg => ({ jpeg, width: W, height: H })), `Занятие ${dateLong(spec.start)}, ${clock(spec.start)}`)
}
