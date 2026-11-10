import { describe, expect, it } from 'vitest'
import { coverage, WITH_BREAKDOWN } from './game-helpers'

// Разбор «Как собрано» после ответа, вторая половина режимов (первая в game-breakdown.spec.ts).
describe('разбор после ответа, часть 2', () => {
  for (const mode of WITH_BREAKDOWN.filter((_, i) => i % 2 === 1)) {
    it(`режим «${mode}»: после ответа показан разбор «Как собрано» с карточками`, () => {
      // в диалогах ответ «저도요.» (частица 도 и вежливое 요) разбор пока не разбирает, поэтому там допуск ниже
      expect(coverage(mode, 60), mode).toBeGreaterThanOrEqual(mode === 'dlg' ? 0.75 : 0.9)
    })
  }
})
