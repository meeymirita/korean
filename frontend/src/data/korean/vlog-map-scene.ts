import type { Place } from './vlog-map'

/**
 * Сцена «Карта мест»: город, нарисованный кодом (`VlogMapCity.vue`: дороги, река, море, деревья и здания-значки мест), и подпись-кнопка на каждом месте.
 * Координаты в системе картинки `SCENE_W × SCENE_H`. Только справка: ничего не записывается и не засчитывается.
 */
/** Город рисуется в рамке `CITY_W × CITY_H`, вокруг него `PAD` с продолжением леса, гор, дорог и моря: карта просторная, краёв не видно. */
export const CITY_W = 1672
export const CITY_H = 941
export const PAD = { l: 380, t: 130, r: 380, b: 360 }
export const SCENE_W = CITY_W + PAD.l + PAD.r
export const SCENE_H = CITY_H + PAD.t + PAD.b

/**
 * Раскладка города: три ряда мест (верхняя улица, средняя улица, низ), порядок как в списке мест; ряды идут слева направо, соседние
 * подписи смещены по высоте, чтобы не налезать друг на друга. `PLACE_AT`: центр подписи места в системе `SCENE_W × SCENE_H`,
 * здание стоит под подписью (`buildingAt`). Город рисует код (`VlogMapCity.vue`), картинки нет: рисунок чёткий при любом приближении.
 */
const ROWS: { ids: string[]; x0: number; x1: number; y: number; zig: number }[] = [
  { ids: ['mall', 'market', 'convenience', 'daiso', 'supermarket', 'clothes', 'cafe', 'restaurant', 'bakery', 'icecream', 'pharmacy', 'clinic', 'salon', 'laundry'], x0: 80, x1: 1590, y: 165, zig: 36 },
  { ids: ['home', 'work', 'bookstore', 'library', 'cinema', 'gym', 'bath', 'subway', 'bus', 'train', 'airport'], x0: 100, x1: 1580, y: 392, zig: 34 },
]
const LOW: Record<string, { x: number; y: number }> = {
  mountain: { x: 175, y: 705 }, park: { x: 470, y: 730 }, palace: { x: 830, y: 690 }, stay: { x: 1130, y: 720 }, sea: { x: 1470, y: 705 },
}
export const PLACE_AT: Record<string, { x: number; y: number }> = { ...LOW }
for (const r of ROWS) r.ids.forEach((id, i) => { PLACE_AT[id] = { x: Math.round(r.x0 + (i * (r.x1 - r.x0)) / (r.ids.length - 1)), y: r.y + (i % 2) * r.zig } })
// всё сдвигаем внутрь расширенной сцены: подписи и здания стоят в её координатах
for (const id of Object.keys(PLACE_AT)) PLACE_AT[id] = { x: PLACE_AT[id]!.x + PAD.l, y: PLACE_AT[id]!.y + PAD.t }

/** Размер здания под подписью: дворец, ханок, аэропорт и универмаг крупнее. */
const BIG: Record<string, number> = { palace: 170, stay: 140, airport: 140, mall: 104, sea: 150, mountain: 130, park: 120 }
/** Здание места: центр и сторона квадрата значка-здания (оно стоит под подписью). */
export function buildingAt(id: string): { x: number; y: number; size: number } {
  const at = PLACE_AT[id] ?? { x: 0, y: 0 }
  const size = BIG[id] ?? 92
  return { x: at.x, y: at.y + 24 + size / 2, size }
}

/** Середина района по его местам: куда приближается карта, когда выбран район. */
export function districtCenter(district: string, places: Place[]): { x: number; y: number } {
  const pts = places.filter(p => p.district === district).map(p => PLACE_AT[p.id]).filter(Boolean) as { x: number; y: number }[]
  if (!pts.length) return { x: SCENE_W / 2, y: SCENE_H / 2 }
  return { x: pts.reduce((a, b) => a + b.x, 0) / pts.length, y: pts.reduce((a, b) => a + b.y, 0) / pts.length }
}

/** Падающие лепестки: положение, размер, задержка и длительность (в секундах). */
export const PETALS = [
  { x: 200, s: 18, d: 0, t: 14 }, { x: 520, s: 14, d: 3, t: 17 }, { x: 760, s: 20, d: 6, t: 15 }, { x: 980, s: 16, d: 1, t: 18 },
  { x: 1120, s: 13, d: 8, t: 16 }, { x: 300, s: 15, d: 10, t: 19 }, { x: 640, s: 17, d: 5, t: 13 }, { x: 1180, s: 19, d: 12, t: 17 },
]
