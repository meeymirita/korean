import { describe, expect, it } from 'vitest'
import { grammarOpened, start, opts, coverage, WITH_BREAKDOWN } from './game-helpers'

// Разбор «Как собрано» после ответа (вынесено из game.spec.ts: тот не помещался в память на CI).
describe('разбор после ответа', () => {
  // режимы поделены на два файла (вторая половина в game-breakdown-2): 60 вопросов на режим в одном процессе занимали больше 2 ГБ
  for (const mode of WITH_BREAKDOWN.filter((_, i) => i % 2 === 0)) {
    it(`режим «${mode}»: после ответа показан разбор «Как собрано» с карточками`, () => {
      // в диалогах ответ «저도요.» (частица 도 и вежливое 요) разбор пока не разбирает, поэтому там допуск ниже
      expect(coverage(mode, 60), mode).toBeGreaterThanOrEqual(mode === 'dlg' ? 0.75 : 0.9)
    })
  }
  it('в разборе у карточки частицы есть объяснение и ссылка на правило', () => {
    start('place')
    opts()[0]!.click()
    const card = document.querySelector('#fb .bd-card.particle')!
    expect(card.querySelector('.bd-ex')?.textContent?.length ?? 0).toBeGreaterThan(5)
    const rule = card.querySelector<HTMLButtonElement>('.bd-rule')!
    expect(rule).not.toBeNull()
    rule.click()
    expect(grammarOpened.length).toBe(1)
  })
  it('в блице разбор не показывается: на него нет времени', () => {
    start('place')
    ;(document.querySelector('#blitzBtn') as HTMLButtonElement | null)?.click()
    opts()[0]?.click()
    if (document.querySelector('#blitzBtn')) expect(document.querySelector('#fb .bd')).toBeNull()
  })
})
