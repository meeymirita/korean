import { describe, expect, it } from 'vitest'
import { cleanTopik, TOPIK_KEEP } from '../src/topik/topik.service.js'

describe('«Прогноз TOPIK I»: проверка данных', () => {
  const at = Date.now()
  it('принимает нормальные данные и убирает лишние поля', () => {
    const d = cleanTopik({ tests: [{ at, n: 40, correct: 20, wrong: 5, x: 1 }], mocks: [{ at, l: null, r: 50, src: 'site', n: 30, extra: 'y' }] })
    expect(d.tests[0]).toEqual({ at, n: 40, correct: 20, wrong: 5 })
    expect(d.mocks[0]).toEqual({ at, l: null, r: 50, src: 'site', n: 30 })
  })
  it('отклоняет выход за пределы', () => {
    expect(() => cleanTopik({ tests: [{ at, n: 40, correct: 30, wrong: 20 }], mocks: [] })).toThrow()
    expect(() => cleanTopik({ tests: [], mocks: [{ at, l: -1, r: 10, src: 'real', n: 0 }] })).toThrow()
    expect(() => cleanTopik({ tests: [{ at: 5, n: 40, correct: 1, wrong: 1 }], mocks: [] })).toThrow()
    expect(() => cleanTopik(null)).toThrow()
  })
  it('оставляет последние записи', () => {
    const tests = Array.from({ length: TOPIK_KEEP + 10 }, (_, i) => ({ at: at + i, n: 10, correct: 5, wrong: 0 }))
    const d = cleanTopik({ tests, mocks: [] })
    expect(d.tests.length).toBe(TOPIK_KEEP)
    expect(d.tests.at(-1)!.at).toBe(at + TOPIK_KEEP + 9)
  })
})
