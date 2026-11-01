import { reactive } from 'vue'

/** Своя картинка на фоне блока главной раздела: хранится только в этом браузере (localStorage), на сервер не уходит. */
export interface BlockBg {
  src: string
  /** положение картинки в блоке, % (50 = по центру) */
  x: number
  y: number
  /** приближение, 1 = как есть (cover) */
  zoom: number
}

/** v2: ключ сменён 2026-11-01, чтобы старые пробные картинки не мешали стандартному фону */
const key = (id: string) => `home_bg2_${id}`
const state = reactive<Record<string, BlockBg | null>>({})

function valid(v: unknown): v is BlockBg {
  const b = v as BlockBg
  return !!b && typeof b.src === 'string' && b.src.length > 0 && [b.x, b.y, b.zoom].every(n => typeof n === 'number' && Number.isFinite(n))
}

function read(id: string): BlockBg | null {
  try {
    const raw = localStorage.getItem(key(id))
    const v = raw ? JSON.parse(raw) : null
    return valid(v) ? v : null
  } catch {
    return null
  }
}

/** Фон блока по его имени. `save` возвращает false, если браузер не дал записать (мало места или запрет). */
export function useBlockBg(id: string, fallback: BlockBg | null = null) {
  if (!(id in state)) state[id] = read(id)
  return {
    get bg() {
      return state[id] ?? fallback
    },
    save(bg: BlockBg): boolean {
      try {
        localStorage.setItem(key(id), JSON.stringify(bg))
      } catch {
        return false
      }
      state[id] = bg
      return true
    },
    clear() {
      state[id] = null
      try {
        localStorage.removeItem(key(id))
      } catch {
        /* без запоминания */
      }
    },
  }
}

/** Ограничения окна: приближение и размер файла после сжатия. */
export const BG_ZOOM = { min: 1, max: 3 }
export const BG_MAX_SIDE = 1400

/** Файл-картинка → сжатый data-URL (не больше 1400 px по длинной стороне), чтобы поместиться в localStorage. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Это не картинка'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const k = Math.min(1, BG_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.naturalWidth * k))
      c.height = Math.max(1, Math.round(img.naturalHeight * k))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/webp', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось открыть картинку'))
    }
    img.src = url
  })
}
