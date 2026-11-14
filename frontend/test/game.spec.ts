import { describe, expect, it } from 'vitest'
import { ENGINE_MODES, NEW_MODES, opts, optText, play, records, start, stop } from './game-helpers'

// Прохождение всех режимов движка. Остальные игровые проверки: game-grammar, game-breakdown, game-texts, game-stories, game-variants.
describe('игра «Хлебушек»: прохождение режимов', () => {
  it('все новые режимы есть среди режимов каталога', () => {
    for (const m of NEW_MODES) expect(ENGINE_MODES).toContain(m)
  })

  // режимы поделены на три файла (game-modes-2, game-modes-3): 40 вопросов на режим в одном процессе занимали больше 3 ГБ
  for (const mode of ENGINE_MODES.filter((_, i) => i % 3 === 0)) {
    it(`режим «${mode}»: 40 вопросов подряд без ошибок и без повторов вариантов`, () => {
      play(mode, 40)
      expect(records.length).toBe(40)
      expect(records.every(r => r.mode === mode)).toBe(true)
    })
  }

  it('микс: показывает вопросы всех видов и не падает', () => {
    play('mix', 120)
  })

  it('новые режимы можно пройти без единой ошибки, если знаешь ответы (верный вариант всегда есть)', () => {
    for (const mode of NEW_MODES) {
      start(mode)
      for (let i = 0; i < 30; i++) {
        // верный вариант игра отмечает после ответа, поэтому сначала нажимаем любой, потом сверяем, что отмеченный один
        opts()[0]!.click()
        expect(document.querySelectorAll('#opts .opt.ok').length).toBe(1)
        ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
      }
      stop()
    }
  })

  it('правило 도: у вопроса «Тоже» верный вариант всегда содержит 도', () => {
    start('too')
    for (let i = 0; i < 40; i++) {
      opts()[0]!.click()
      const ok = document.querySelector('#opts .opt.ok')!
      expect(optText(ok)).toContain('도')
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
    }
  })

  it('правило 에: «Когда?» не требует частицу у 오늘, 내일, 지금, 언제; у остальных 에, а со «тоже» и «только» 에도 и 에만', () => {
    start('when')
    const seen = { off: 0, on: 0, too: 0, only: 0 }
    for (let i = 0; i < 300; i++) {
      const sentence = document.querySelector('.sentence')!.textContent ?? ''
      const card = document.querySelector('#card')!.textContent ?? ''
      opts()[0]!.click()
      const right = optText(document.querySelector('#opts .opt.ok')!)
      const free = /^(오늘|내일|지금|언제)\s/.test(sentence.trim())
      if (free) {
        expect(right, sentence).toBe('ничего не нужно')
        seen.off++
      } else if (right === '에도') {
        expect(card, 'в русском «тоже»: ' + sentence).toContain('тоже')
        seen.too++
      } else if (right === '에만') {
        expect(card, 'в русском «только»: ' + sentence).toContain('Только')
        seen.only++
      } else {
        expect(right, sentence).toBe('에')
        seen.on++
      }
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
    }
    expect(seen.off).toBeGreaterThan(5)
    expect(seen.on).toBeGreaterThan(40)
    expect(seen.too, 'вариант «тоже» встречается').toBeGreaterThan(5)
    expect(seen.only, 'вариант «только» встречается').toBeGreaterThan(5)
  })

  it('цены читаются верно: 3500원 — 삼천오백, 10000원 — 만', () => {
    start('price')
    for (let i = 0; i < 60; i++) {
      opts()[0]!.click()
      const right = optText(document.querySelector('#opts .opt.ok')!)
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      if (prompt === '3,500원') expect(right).toBe('삼천오백 원')
      if (prompt === '10,000원') expect(right).toBe('만 원')
      if (prompt === '삼천오백 원') expect(right).toBe('3,500원')
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
    }
  })
})
