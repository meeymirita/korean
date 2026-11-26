import type { Place } from './vlog-map'

/**
 * Сцена «Карта мест»: картинка владельца `assets/vlogmap/scene.webp` (1672×941, аниме-город с подписями мест) и невидимая кнопка на каждой подписи.
 * Координаты в системе картинки `SCENE_W × SCENE_H`. Только справка: ничего не записывается и не засчитывается.
 */
export const SCENE_W = 1672
export const SCENE_H = 941

/**
 * Где на картинке `assets/vlogmap/scene.webp` стоит подпись-пузырь каждого места (центр и ширина в системе `SCENE_W × SCENE_H`):
 * на ней лежит невидимая кнопка. В магазинном ряду подписи на картинке перепутаны (на здании DAISO написано «판트», на магазине
 * одежды «다이소»), поэтому точки поставлены по зданиям, а не по тексту.
 */
export const PLACE_AT: Record<string, { x: number; y: number; w: number }> = {
  mall: { x: 150, y: 135, w: 130 }, market: { x: 275, y: 160, w: 100 }, convenience: { x: 372, y: 155, w: 130 }, daiso: { x: 475, y: 175, w: 110 }, supermarket: { x: 568, y: 198, w: 100 }, clothes: { x: 675, y: 195, w: 120 },
  cafe: { x: 782, y: 115, w: 110 }, restaurant: { x: 890, y: 155, w: 100 }, bakery: { x: 998, y: 160, w: 100 }, icecream: { x: 1125, y: 180, w: 195 },
  pharmacy: { x: 1268, y: 152, w: 110 }, clinic: { x: 1380, y: 128, w: 100 }, salon: { x: 1488, y: 160, w: 110 }, laundry: { x: 1603, y: 178, w: 110 },
  home: { x: 105, y: 355, w: 85 }, work: { x: 292, y: 347, w: 170 },
  bookstore: { x: 500, y: 362, w: 100 }, library: { x: 610, y: 347, w: 120 }, cinema: { x: 732, y: 337, w: 125 }, gym: { x: 868, y: 350, w: 120 }, bath: { x: 1012, y: 355, w: 120 },
  subway: { x: 1198, y: 358, w: 125 }, bus: { x: 1322, y: 372, w: 95 }, train: { x: 1428, y: 373, w: 95 }, airport: { x: 1552, y: 390, w: 110 },
  mountain: { x: 232, y: 572, w: 95 }, park: { x: 402, y: 660, w: 110 },
  palace: { x: 836, y: 582, w: 90 }, stay: { x: 1135, y: 642, w: 185 },
  sea: { x: 1472, y: 678, w: 180 },
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
