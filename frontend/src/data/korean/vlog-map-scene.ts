import type { Place } from './vlog-map'

/**
 * Сцена «Карта мест»: картинка владельца `assets/vlogmap/scene.webp` (1672×941, аниме-город с подписями мест) и невидимая кнопка на каждой подписи.
 * Координаты в системе картинки `SCENE_W × SCENE_H`. Только справка: ничего не записывается и не засчитывается.
 */
export const SCENE_W = 1672
export const SCENE_H = 941

/**
 * Где на картинке `assets/vlogmap/scene.webp` стоит подпись-пузырь каждого места (центр и ширина в системе `SCENE_W × SCENE_H`):
 * на ней лежит невидимая кнопка. Новая картинка: сверь все 30 точек.
 */
export const PLACE_AT: Record<string, { x: number; y: number; w: number }> = {
  mall: { x: 140, y: 205, w: 125 }, market: { x: 270, y: 225, w: 90 }, convenience: { x: 365, y: 232, w: 115 }, daiso: { x: 480, y: 243, w: 100 }, supermarket: { x: 580, y: 243, w: 95 }, clothes: { x: 685, y: 240, w: 120 },
  cafe: { x: 810, y: 185, w: 100 }, restaurant: { x: 915, y: 218, w: 90 }, bakery: { x: 1020, y: 222, w: 95 }, icecream: { x: 1145, y: 232, w: 175 },
  pharmacy: { x: 1270, y: 220, w: 95 }, clinic: { x: 1385, y: 197, w: 100 }, salon: { x: 1490, y: 222, w: 110 }, laundry: { x: 1595, y: 232, w: 105 },
  home: { x: 115, y: 400, w: 85 }, work: { x: 305, y: 395, w: 170 },
  bookstore: { x: 495, y: 412, w: 95 }, library: { x: 610, y: 402, w: 120 }, cinema: { x: 748, y: 395, w: 125 }, gym: { x: 880, y: 403, w: 115 }, bath: { x: 1012, y: 403, w: 120 },
  subway: { x: 1190, y: 407, w: 115 }, bus: { x: 1305, y: 418, w: 95 }, train: { x: 1420, y: 418, w: 95 }, airport: { x: 1545, y: 428, w: 105 },
  mountain: { x: 237, y: 596, w: 90 }, park: { x: 440, y: 678, w: 105 },
  palace: { x: 820, y: 602, w: 85 }, stay: { x: 1120, y: 660, w: 185 },
  sea: { x: 1450, y: 687, w: 175 },
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
