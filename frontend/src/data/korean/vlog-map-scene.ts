import type { Place } from './vlog-map'

/**
 * Сцена «Карта мест»: большая карта, нарисованная кодом (`VlogMapCity.vue`: районы, дороги, река, море, деревья, здания-значки мест, анимации), и подпись-кнопка на каждом месте.
 * Координаты в системе картинки `SCENE_W × SCENE_H`. Только справка: ничего не записывается и не засчитывается.
 */
/** Большая карта целиком (лес, дороги, река, море, районы): заполняет окно, за край её не листают (`contain: 'outside'` в `VlogMap.vue`). */
export const SCENE_W = 3200
export const SCENE_H = 2000

/**
 * Где на карте стоит подпись каждого места (центр, система `SCENE_W × SCENE_H`); здание стоит под подписью (`buildingAt`).
 * Места собраны районами: магазины слева сверху, еда в центре сверху, услуги справа сверху, дом слева, культура вокруг площади
 * в центре, транспорт справа, природа слева внизу, старый Сеул в центре внизу, море справа внизу. Город рисует `VlogMapCity.vue`.
 */
export const PLACE_AT: Record<string, { x: number; y: number }> = {
  mall: { x: 420, y: 340 }, market: { x: 650, y: 320 }, convenience: { x: 860, y: 350 }, daiso: { x: 540, y: 610 }, supermarket: { x: 760, y: 620 }, clothes: { x: 975, y: 595 },
  cafe: { x: 1180, y: 330 }, restaurant: { x: 1400, y: 300 }, bakery: { x: 1620, y: 360 }, icecream: { x: 1300, y: 580 },
  pharmacy: { x: 2200, y: 330 }, clinic: { x: 2450, y: 300 }, salon: { x: 2660, y: 410 }, laundry: { x: 2390, y: 580 },
  home: { x: 330, y: 930 }, work: { x: 600, y: 1090 },
  bookstore: { x: 1000, y: 880 }, library: { x: 1230, y: 810 }, cinema: { x: 1470, y: 880 }, gym: { x: 1100, y: 1110 }, bath: { x: 1380, y: 1130 },
  subway: { x: 2230, y: 900 }, bus: { x: 2480, y: 850 }, train: { x: 2730, y: 960 }, airport: { x: 2500, y: 1150 },
  mountain: { x: 320, y: 1600 }, park: { x: 860, y: 1580 },
  palace: { x: 1450, y: 1590 }, stay: { x: 1960, y: 1650 },
  sea: { x: 2720, y: 1700 },
}

/** Размер здания под подписью: дворец, ханок, аэропорт, универмаг и природа крупнее. */
const BIG: Record<string, number> = { palace: 230, stay: 180, airport: 190, mall: 150, sea: 180, mountain: 180, park: 160 }
/** Здание места: центр и сторона квадрата значка-здания (оно стоит под подписью). */
export function buildingAt(id: string): { x: number; y: number; size: number } {
  const at = PLACE_AT[id] ?? { x: 0, y: 0 }
  const size = BIG[id] ?? 124
  return { x: at.x, y: at.y + 30 + size / 2, size }
}

/** Середина района по его местам: куда приближается карта, когда выбран район. */
export function districtCenter(district: string, places: Place[]): { x: number; y: number } {
  const pts = places.filter(p => p.district === district).map(p => PLACE_AT[p.id]).filter(Boolean) as { x: number; y: number }[]
  if (!pts.length) return { x: SCENE_W / 2, y: SCENE_H / 2 }
  return { x: pts.reduce((a, b) => a + b.x, 0) / pts.length, y: pts.reduce((a, b) => a + b.y, 0) / pts.length }
}

/** Падающие лепестки: положение, размер, задержка и длительность (в секундах); на всю ширину карты. */
export const PETALS = Array.from({ length: 26 }, (_, i) => ({ x: 90 + i * 118 + (i % 3) * 30, s: 22 + (i % 4) * 7, d: (i * 3) % 17, t: 16 + (i % 5) * 3 }))
