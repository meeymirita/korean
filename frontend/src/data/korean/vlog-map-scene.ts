import type { Place } from './vlog-map'

/**
 * Сцена «Карта мест»: картинка владельца `assets/vlogmap/scene.webp` (1672×941, аниме-город с пузырями-значками) и точка на каждом значке.
 * Координаты в системе картинки `SCENE_W × SCENE_H`. Только справка: ничего не записывается и не засчитывается.
 */
export const SCENE_W = 1672
export const SCENE_H = 941

/**
 * Где на картинке `assets/vlogmap/scene.webp` стоит значок каждого места (центр пузыря, система `SCENE_W × SCENE_H`).
 * `none: true`: на картинке значка нет, точка стоит на свободном месте и обведена пунктиром, пока владелец не дорисует значок.
 */
export const PLACE_AT: Record<string, { x: number; y: number; none?: boolean }> = {
  mall: { x: 200, y: 100 }, market: { x: 333, y: 128 }, convenience: { x: 408, y: 128 }, supermarket: { x: 497, y: 153 },
  daiso: { x: 170, y: 250, none: true }, clothes: { x: 420, y: 240, none: true },
  cafe: { x: 700, y: 100 }, restaurant: { x: 793, y: 140 }, bakery: { x: 897, y: 158 }, icecream: { x: 997, y: 160 },
  pharmacy: { x: 1250, y: 122 }, clinic: { x: 1365, y: 128 }, salon: { x: 1458, y: 158 }, laundry: { x: 1555, y: 172 },
  home: { x: 130, y: 310 }, work: { x: 275, y: 330 },
  bookstore: { x: 487, y: 347 }, library: { x: 590, y: 327 }, cinema: { x: 727, y: 318 }, gym: { x: 838, y: 327 }, bath: { x: 940, y: 342 },
  subway: { x: 1170, y: 285 }, bus: { x: 1313, y: 303 }, train: { x: 1428, y: 372 }, airport: { x: 1580, y: 382 },
  park: { x: 378, y: 632 }, mountain: { x: 213, y: 553 },
  palace: { x: 815, y: 560 }, stay: { x: 1090, y: 620 },
  sea: { x: 1397, y: 708 },
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
