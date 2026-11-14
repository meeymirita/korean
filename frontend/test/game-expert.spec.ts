import { describe, expect, it } from 'vitest'
import { closeHelp, start } from './game-helpers'

// «Эксперт»: текст без перевода, где правила идут вперемешку; размер 5 / 10 / 15 пропусков.
describe('режим «Эксперт»', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const gaps = () => document.querySelectorAll('.story .gap').length

  it('размеры 5, 10 и 15 пропусков; перевода у предложений нет, плитки общие', () => {
    start('expert')
    closeHelp()
    for (const [label, n] of [['5 пропусков', 5], ['10 пропусков', 10], ['15 пропусков', 15]] as const) {
      chip(label).click()
      expect(gaps(), label).toBe(n)
      expect(document.querySelectorAll(".story-tr.off").length, "перевод скрыт хотя бы у части").toBeGreaterThan(0)
      expect(document.querySelectorAll('#bank .tile').length).toBeGreaterThan(4)
    }
  })

  it('плитки разных правил в одном банке и проверка в конце работает', () => {
    start('expert')
    closeHelp()
    chip('15 пропусков').click()
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')].map(t => (t.textContent ?? '').replace(/^\d/, '').trim())
    expect(tiles.some(t => /^(은|는|이|가|을|를)$/.test(t)) || tiles.length > 8).toBe(true)
    for (const g of [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]) {
      document.querySelector<HTMLButtonElement>('#bank .tile')!.click()
      g.click()
    }
    const check = document.querySelector<HTMLButtonElement>('#schk')!
    expect(check.disabled).toBe(false)
    check.click()
    expect(document.querySelectorAll('.story .gap.ok, .story .gap.bad, .story .gap.no').length).toBeGreaterThan(0)
  })
})
