/** Подмена картинок сайта: ключ картинки и то, как её положение превращается в стили. */

export interface Placement {
  /** сдвиг, % (50 = по центру) */
  x: number
  y: number
  /** приближение, 1 = как есть */
  zoom: number
}

export const NEUTRAL: Placement = { x: 50, y: 50, zoom: 1 }
export const ZOOM = { min: 1, max: 3 }

/**
 * Ключ картинки из её адреса: имя файла из `src/assets` без расширения и без хэша сборки
 * (`/assets/yuna-today-DxZ3p0kQ.webp` и `/src/assets/home/yuna-today.webp?import` дают `yuna-today`).
 * У картинок не из `assets` (значки профиля, картинки по токену, data:) ключа нет, их менять нельзя.
 */
export function siteImageKey(src: string, base = 'http://localhost/'): string | null {
  if (!src || /^(data|blob):/i.test(src)) return null
  let path: string
  try {
    path = new URL(src, base).pathname
  } catch {
    return null
  }
  const built = path.startsWith('/assets/')
  if (!built && !path.startsWith('/src/assets/')) return null
  let name = decodeURIComponent(path.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '')
  if (built) name = name.replace(/-[A-Za-z0-9_-]{8}$/, '')
  name = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(name) ? name : null
}

export const isNeutral = (p: Placement) => p.x === 50 && p.y === 50 && p.zoom === 1

/**
 * Стили положения. Фоновые слои блоков (`block-…`) занимают всё место, поэтому двигаются как `object-position`;
 * остальные картинки сдвигаются целиком (translate) и приближаются (scale) вокруг центра.
 */
export function placementStyle(key: string, p: Placement): Record<string, string> {
  if (isNeutral(p)) return { objectPosition: '', transform: '', transformOrigin: '' }
  if (key.startsWith('block-')) return { objectPosition: `${p.x}% ${p.y}%`, transform: `scale(${p.zoom})`, transformOrigin: `${p.x}% ${p.y}%` }
  return { objectPosition: '', transform: `translate(${p.x - 50}%, ${p.y - 50}%) scale(${p.zoom})`, transformOrigin: 'center center' }
}

/** Куда сдвинется положение, если потянуть картинку на dx, dy пикселей (размер картинки w × h). */
export function dragPlacement(key: string, from: Placement, dx: number, dy: number, w: number, h: number): Placement {
  const k = key.startsWith('block-') ? -1 : 1
  const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
  return { ...from, x: clamp(from.x + (k * dx * 100) / Math.max(1, w)), y: clamp(from.y + (k * dy * 100) / Math.max(1, h)) }
}
