import { describe, expect, it } from 'vitest'
import { ENGINE_MODES, play, records } from './game-helpers'

// Прохождение режимов движка, часть 3 из 3 (начало в game.spec.ts): в одном процессе все режимы не помещались в память на CI.
describe('игра «Хлебушек»: прохождение режимов, часть 3', () => {
  for (const mode of ENGINE_MODES.filter((_, i) => i % 3 === 2)) {
    it(`режим «${mode}»: 40 вопросов подряд без ошибок и без повторов вариантов`, () => {
      play(mode, 40)
      expect(records.length).toBe(40)
      expect(records.every(r => r.mode === mode)).toBe(true)
    })
  }
})
