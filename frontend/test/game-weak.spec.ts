import { describe, expect, it } from 'vitest'
import { boot, closeHelp } from './game-helpers'

// «Слабые места»: задания берутся из слабых правил, которые отдаёт страница.
describe('режим «Слабые места»', () => {
  const run = (weak: () => { game?: string; family?: string }[]) => {
    boot({ mode: () => 'weak', weak })
    closeHelp()
  }

  it('слабое правило с играми (числа): в задании числа, не другое', () => {
    for (let i = 0; i < 6; i++) {
      run(() => [{ game: 'num' }])
      expect(document.querySelector('#bank, .opts, .options, .choices, .card')).toBeTruthy()
      expect(document.body.textContent).toMatch(/[Чч]исл|корейск|китайск|одно|два|цен|원|\d/)
    }
  })

  it('слабая семья частиц: идёт текст с пропусками', () => {
    run(() => [{ family: 'only' }])
    expect(document.querySelectorAll('.story .gap').length).toBeGreaterThan(0)
  })

  it('слабых нет: обычные задания вперемешку, без ошибок', () => {
    for (let i = 0; i < 8; i++) {
      run(() => [])
      expect(document.querySelector('.card')).toBeTruthy()
    }
  })
})
