import '@/assets/home/fonts.css'

/** Карточка для соцсетей 1200×630: рисуется на canvas в цветах платформы, шрифты те же, что на сайте. */
export const CARD_W = 1200
export const CARD_H = 630

export interface CardSpec {
  /** маленькая строка сверху, например «слово» или «правило» */
  kicker: string
  /** главное: слово, правило, название достижения */
  title: string
  /** под главным: чтение, перевод */
  sub?: string
  /** до четырёх строк пояснений (пример, формула) */
  lines?: string[]
  /** большой значок слева сверху (эмодзи) */
  icon?: string
  footer?: string
}

/** Режет текст на строки не шире max (по замеру), слова не рвёт; лишнее заменяет многоточием. */
export function wrapLines(measure: (s: string) => number, text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w
    if (measure(next) <= max || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1]!.replace(/[\s.,;:!?]*$/, '') + '…'
    return kept
  }
  return lines
}

const KO = '"Noto Sans KR", "Archivo", sans-serif'
const LAT = '"Archivo", "Noto Sans KR", sans-serif'

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 64px "Noto Sans KR"', '한국어'),
      document.fonts.load('400 28px "Noto Sans KR"', '한국어'),
      document.fonts.load('700 32px "Archivo"', 'Абв Abc'),
      document.fonts.load('400 28px "Archivo"', 'Абв Abc'),
    ])
  } catch {
    /* без загрузки шрифтов рисуем системным */
  }
}

/** Рисует карточку и возвращает PNG. */
export async function renderCard(spec: CardSpec): Promise<Blob> {
  await loadFonts()
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const c = canvas.getContext('2d')!

  // фон: пастельный розово-голубой, как на сайте
  const bg = c.createLinearGradient(0, 0, CARD_W, CARD_H)
  bg.addColorStop(0, '#fdf2fb')
  bg.addColorStop(0.55, '#f1f0ff')
  bg.addColorStop(1, '#e3f0ff')
  c.fillStyle = bg
  c.fillRect(0, 0, CARD_W, CARD_H)
  const blob = (x: number, y: number, r: number, col: string) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.fillRect(0, 0, CARD_W, CARD_H)
  }
  blob(1080, 80, 380, 'rgba(201,228,255,.9)')
  blob(80, 560, 360, 'rgba(255,209,236,.85)')

  // карточка
  const pad = 56
  c.fillStyle = 'rgba(255,255,255,.72)'
  c.beginPath()
  c.roundRect(pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 36)
  c.fill()
  c.strokeStyle = 'rgba(120,110,200,.2)'
  c.lineWidth = 2
  c.stroke()

  const left = pad + 56
  const maxW = CARD_W - left * 2
  c.textBaseline = 'alphabetic'

  c.fillStyle = '#8b8fc4'
  c.font = `600 26px ${LAT}`
  c.fillText(spec.kicker.toUpperCase().split('').join(' '), left, pad + 84)

  if (spec.icon) {
    c.font = `96px ${LAT}`
    c.fillText(spec.icon, CARD_W - left - 100, pad + 130)
  }

  // главное: подбираем размер, чтобы влезло в одну-две строки
  let size = 120
  const measure = (t: string) => c.measureText(t).width
  let title: string[] = []
  for (; size >= 52; size -= 8) {
    c.font = `700 ${size}px ${KO}`
    title = wrapLines(measure, spec.title, maxW - (spec.icon ? 120 : 0), 2)
    if (title.length === 1 || size <= 64) break
  }
  c.fillStyle = '#1e2350'
  let y = pad + 84 + 40 + size
  for (const l of title) {
    c.fillText(l, left, y)
    y += size * 1.12
  }

  if (spec.sub) {
    y += 4
    c.fillStyle = '#d64da9'
    c.font = `600 38px ${LAT}`
    for (const l of wrapLines(measure, spec.sub, maxW, 2)) {
      c.fillText(l, left, y)
      y += 50
    }
  }

  c.fillStyle = '#4a4f86'
  c.font = `400 30px ${KO}`
  y += 10
  for (const raw of (spec.lines ?? []).slice(0, 4)) {
    const rows = wrapLines(measure, raw, maxW, 1)
    for (const l of rows) {
      if (y > CARD_H - pad - 70) break
      c.fillText(l, left, y)
      y += 44
    }
  }

  c.fillStyle = '#8b8fc4'
  c.font = `600 24px ${LAT}`
  c.fillText(spec.footer ?? 'korean.meeymirita.ru', left, CARD_H - pad - 36)
  c.fillStyle = '#6a5cd0'
  c.font = `700 30px ${KO}`
  c.textAlign = 'right'
  c.fillText('✳︎ 우리말', CARD_W - left, CARD_H - pad - 34)
  c.textAlign = 'left'

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('не получилось нарисовать карточку'))), 'image/png'))
}

/** Отдаёт картинку: в меню «Поделиться» телефона, если оно умеет файлы, иначе скачивает. Возвращает, что произошло. */
export async function shareBlob(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  // меню «Поделиться» осталось для телефона и планшета; на компьютере браузер кладёт файл во временную папку, там проще скачать
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
