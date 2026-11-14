import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { opts, start } from './game-helpers'

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const text = (sel: string) => $(sel).textContent ?? ''

// Оболочка игры «Хлебушек» (`components/game/GameShell.vue`): счёт, списки справа, настройки, справка. Карточки вопросов рисует движок.
describe('оболочка игры', () => {
  it('при первом запуске открывается «Как играть», в списке все игры, «Понятно» закрывает', async () => {
    start('word')
    await nextTick()
    expect($('#help').classList.contains('on')).toBe(true)
    expect(document.querySelectorAll('#helpModes li').length).toBeGreaterThan(10)
    $<HTMLButtonElement>('#helpOk').click()
    await nextTick()
    expect($('#help').classList.contains('on')).toBe(false)
    start('word', true)
    await nextTick()
    expect($('#help').classList.contains('on'), 'второй раз уже не открывается').toBe(false)
  })

  it('счёт и история обновляются после ответа, вкладки переключают список', async () => {
    start('word')
    $<HTMLButtonElement>('#helpOk').click()
    opts()[0]!.click()
    await nextTick()
    expect(Number(text('#nOk')) + Number(text('#nBad'))).toBe(1)
    expect(document.querySelectorAll('#list .item').length).toBe(1)
    $<HTMLButtonElement>('#tabRecords').click()
    await nextTick()
    expect($('#tabRecords').classList.contains('on')).toBe(true)
    expect(document.querySelectorAll('#list .item.rec').length).toBeGreaterThan(10)
    $<HTMLButtonElement>('#tabWeak').click()
    await nextTick()
    expect($('#tabRecords').classList.contains('on')).toBe(false)
  })

  it('во вкладке «Слова» работает поиск', async () => {
    start('word')
    $<HTMLButtonElement>('#helpOk').click()
    $<HTMLButtonElement>('#tabWords').click()
    await nextTick()
    expect($<HTMLInputElement>('#wq').hidden).toBe(false)
    const all = Number(/Всего слов в игре: (\d+)/.exec(text('#list'))![1])
    expect(all).toBeGreaterThan(50)
    const wq = $<HTMLInputElement>('#wq')
    wq.value = '먹다'
    wq.dispatchEvent(new Event('input'))
    await nextTick()
    expect(text('#list')).toMatch(/Найдено: [1-9]/)
    expect(document.querySelector('#list .item .ko')?.textContent).toContain('먹')
  })

  it('последнюю группу слов выключить нельзя', async () => {
    start('word', false)
    $<HTMLButtonElement>('#helpOk').click()
    await nextTick()
    const boxes = [...document.querySelectorAll<HTMLInputElement>('#cats input')]
    expect(boxes.length).toBeGreaterThan(2)
    for (const b of boxes) {
      if (!b.checked) continue
      b.checked = false
      b.dispatchEvent(new Event('change'))
      await nextTick()
    }
    expect(document.querySelectorAll<HTMLInputElement>('#cats input:checked').length).toBe(1)
  })

  it('чтение кириллицей включается переключателем и запоминается', async () => {
    start('word')
    $<HTMLButtonElement>('#helpOk').click()
    const cb = $<HTMLInputElement>('#cbRead')
    const was = cb.checked
    cb.checked = !was
    cb.dispatchEvent(new Event('change'))
    await nextTick()
    expect(JSON.parse(localStorage.getItem('hleb_game_v1')!).reading).toBe(!was)
    expect($('#lbRead').classList.contains('on')).toBe(!was)
  })
})
