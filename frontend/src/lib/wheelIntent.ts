/**
 * Что значит событие колеса на карте: приблизить или подвинуть.
 * Щипок на тачпаде и Ctrl/⌘+колесо приходят с `ctrlKey` и приближают; колесо мыши по строкам (Firefox) и крупными шагами (±100 на Windows и Linux) тоже приближает;
 * всё остальное (два пальца по тачпаду, мелкие шаги, любой сдвиг вбок) двигает карту.
 */
export interface WheelLike {
  ctrlKey: boolean
  deltaMode: number
  deltaX: number
  deltaY: number
}

export function wheelIntent(e: WheelLike): 'zoom' | 'pan' {
  if (e.ctrlKey) return 'zoom'
  if (e.deltaMode !== 0) return 'zoom'
  if (e.deltaX !== 0) return 'pan'
  return Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 100 && e.deltaY % 100 === 0 ? 'zoom' : 'pan'
}
