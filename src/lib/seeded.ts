/** Небольшой детерминированный генератор (mulberry32) и хэш строки в число. */
export function hashString(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function seededRandom(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Выполняет `fn`, пока `Math.random` заменён генератором от `seed`: всё, что внутри берёт случайное, даёт один и тот же результат
 * при тех же данных (набор «Сегодня» одинаков на весь день и на всех устройствах). После выхода `Math.random` возвращается.
 */
export function withSeed<T>(seed: string, fn: () => T): T {
  const orig = Math.random
  Math.random = seededRandom(seed)
  try {
    return fn()
  } finally {
    Math.random = orig
  }
}
