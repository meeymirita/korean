import type { Place } from './vlog-map'

/**
 * Сцена «Бумажный вырез» (оформление 5 карты мест): остров-картинка, плашки районов и декор по макету владельца.
 * Картинки нарезаны из набора «Пастельный набор для карты Кореи» и лежат в `src/assets/vlogmap/` (имя файла без `.webp`).
 * Координаты в системе макета `SCENE_W × SCENE_H`. Только справка: ничего не записывается и не засчитывается.
 */
export const SCENE_W = 1672
export const SCENE_H = 941

/** Плашка района: центр, значок из набора. `target`: что открывает нажатие (район `d:<id>` или место). */
export interface Pill { key: string; target: string; district: string; ko: string; ru: string; icon: string; x: number; y: number }
export const PILLS: Pill[] = [
  { key: 'shop', target: 'd:shop', district: 'shop', ko: '시장과 가게', ru: 'Рынки и магазины', icon: 'i_market', x: 335, y: 243 },
  { key: 'food', target: 'd:food', district: 'food', ko: '맛집 거리', ru: 'Кафе и еда', icon: 'i_food', x: 675, y: 178 },
  { key: 'care', target: 'd:care', district: 'care', ko: '건강과 서비스', ru: 'Здоровье и услуги', icon: 'i_health', x: 1015, y: 230 },
  { key: 'home', target: 'd:home', district: 'home', ko: '우리 동네', ru: 'Дом и день', icon: 'i_home', x: 305, y: 415 },
  { key: 'culture', target: 'd:culture', district: 'culture', ko: '문화와 휴식', ru: 'Культура и отдых', icon: 'i_culture', x: 650, y: 372 },
  { key: 'travel', target: 'd:travel', district: 'travel', ko: '교통과 여행', ru: 'Дорога и поездки', icon: 'i_bus', x: 1060, y: 408 },
  { key: 'nature', target: 'd:nature', district: 'nature', ko: '자연', ru: 'Природа', icon: 'i_nature', x: 435, y: 604 },
  { key: 'heritage', target: 'd:heritage', district: 'heritage', ko: '옛 서울', ru: 'Старый Сеул', icon: 'i_seoul', x: 825, y: 584 },
  { key: 'sea', target: 'sea', district: 'sea', ko: '제주', ru: 'Чеджу', icon: 'i_jeju', x: 1080, y: 646 },
]
export const PILL_OF = new Map(PILLS.map(p => [p.district, p]))

/** Где стоят значки мест выбранного района: дугой под плашкой, чтобы не налезали друг на друга. */
export function pinsFor(district: string, places: Place[]): { place: Place; x: number; y: number }[] {
  const pill = PILL_OF.get(district)
  if (!pill) return []
  const n = places.length
  const step = Math.min(118, 420 / Math.max(n, 1))
  return places.map((place, i) => ({ place, x: pill.x + (i - (n - 1) / 2) * step, y: pill.y + 52 + (i % 2) * 50 }))
}

/** Картинка сцены: `n` файл, `x y w` положение и ширина, `z` слой, `t` поворот или отражение, `c` класс (анимация). */
export interface Art { k: string; n: string; x: number; y: number; w: number; z: number; t?: string; c?: string }
export const ART: Art[] = [
  { k: 'mount', n: 'b_jeju', x: 1005, y: 78, w: 185, z: 1 },
  { k: 'cloud1', n: 'cloud', x: 168, y: 148, w: 128, z: 1, c: 'drift' },
  { k: 'cloud2', n: 'cloud', x: 1180, y: 560, w: 110, z: 1, c: 'drift2' },
  { k: 'birds1', n: 'birds', x: 385, y: 112, w: 70, z: 2, c: 'fly' },
  { k: 'birds2', n: 'birds', x: 870, y: 96, w: 96, z: 2, c: 'fly2' },
  { k: 'island', n: 'island', x: 84, y: 82, w: 1136, z: 3, c: 'isl' },
  { k: 'boat', n: 'boat', x: 940, y: 722, w: 172, z: 4, c: 'bob' },
  { k: 'torii', n: 'torii', x: 395, y: 760, w: 335, z: 5 },
  { k: 'branchR1', n: 'branch', x: 840, y: 850, w: 430, z: 6, t: 'rotate(-14deg)' },
  { k: 'branchR2', n: 'branch', x: 1010, y: 800, w: 300, z: 6, t: 'scaleX(-1) rotate(8deg)' },
  { k: 'fence', n: 'fence', x: 120, y: 835, w: 610, z: 7 },
  { k: 'lantern', n: 'lantern', x: 0, y: 95, w: 122, z: 8, c: 'glow' },
  { k: 'branchL', n: 'branch', x: -95, y: -10, w: 430, z: 8, t: 'rotate(22deg)' },
  { k: 'girl', n: 'girl', x: -85, y: 575, w: 430, z: 9 },
]

/** Падающие лепестки: положение, размер, задержка и длительность (в секундах). */
export const PETALS = [
  { x: 200, s: 18, d: 0, t: 14 }, { x: 520, s: 14, d: 3, t: 17 }, { x: 760, s: 20, d: 6, t: 15 }, { x: 980, s: 16, d: 1, t: 18 },
  { x: 1120, s: 13, d: 8, t: 16 }, { x: 300, s: 15, d: 10, t: 19 }, { x: 640, s: 17, d: 5, t: 13 }, { x: 1180, s: 19, d: 12, t: 17 },
]
