import { describe, expect, it } from 'vitest'
import { boot, closeHelp } from './game-helpers'
import { longClauses, longWords } from '@/game/long-sentences'
import { LONG3 } from '@/game/long-sentences-3'

// «Собери предложение»: уровень «Мастер+» (три части, две связки). Отдельный файл: игровые тесты в одном файле упираются в память.
const chips = () => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')]
const plus = () => chips().find(b => b.textContent === 'Мастер+')!
const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#tiles .tile')]
const word = (b: Element) => (b.childNodes[0]?.textContent ?? '').trim()
const current = () => LONG3.find(x => x.ru === document.querySelector('.prompt')!.textContent)!

function start() {
  boot({ mode: () => 'build' })
  closeHelp()
  plus().click()
}
function answer(words: string[]) {
  const used = new Set<number>()
  for (const w of words) {
    const i = tiles().findIndex((b, k) => !used.has(k) && word(b) === w)
    expect(i, `нет плитки ${w}`).toBeGreaterThanOrEqual(0)
    used.add(i)
    tiles()[i]!.click()
  }
  document.querySelector<HTMLButtonElement>('#chk')!.click()
}

describe('«Собери предложение»: уровень «Мастер+»', () => {
  it('чип стоит после «Мастера», даёт трёхчастное предложение с лишними плитками', () => {
    start()
    expect(plus().classList.contains('on')).toBe(true)
    const x = current()
    expect(x).toBeTruthy()
    expect(longClauses(x).length).toBe(3)
    const got = tiles().map(word)
    for (const w of longWords(x)) expect(got).toContain(w)
    expect(got.length).toBeLessThanOrEqual(longWords(x).length + 2)
    expect(document.querySelector('.label')!.textContent).toContain('мастер+')
  })

  it('порядок учебника верный; перестановка частей и неверная частица нет', () => {
    start()
    const x = current()
    answer(longWords(x))
    expect(document.querySelector('#slots')!.classList.contains('ok')).toBe(true)

    start()
    const y = current()
    const cls = longClauses(y)
    answer([...cls].reverse().flat(2))
    expect(document.querySelector('#slots')!.classList.contains('ok')).toBe(false)
  })
})
