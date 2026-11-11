import { afterEach, describe, expect, it } from 'vitest'
import markupRaw from '@/game/markup.html?raw'
import { initGame } from '@/game/engine'
import { iconImg } from '@/game/icons'
import { LONG_SENTENCES, longClauses, longWords } from '@/game/long-sentences'

// «Собери предложение»: уровень «Мастер» (отдельный файл: игровые тесты в одном файле упираются в память).
const markup = markupRaw.replace('CAT_SLEEP', '').replace(/ICON\((\w+)\)/g, (_, n: string) => iconImg(n))
let dispose: (() => void) | undefined

function start() {
  dispose?.()
  localStorage.clear()
  document.body.innerHTML = `<div id="root">${markup}</div>`
  dispose = initGame({
    record: () => ({}),
    importXp: () => {},
    state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }),
    cats: () => null,
    mode: () => 'build',
    saveCats: () => {},
    grammar: () => {},
  })
  document.querySelector<HTMLButtonElement>('#helpOk')?.click()
}
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
})

const chips = () => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')]
const master = () => chips().find(b => b.textContent === 'Мастер')!
const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#tiles .tile')]
const word = (b: Element) => (b.childNodes[0]?.textContent ?? '').trim()
const current = () => LONG_SENTENCES.find(x => x.ru === document.querySelector('.prompt')!.textContent)!

/** Нажимает плитки по словам и проверяет ответ. */
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

describe('«Собери предложение»: уровень «Мастер»', () => {
  it('чип стоит после «Сложного», даёт длинное предложение с лишними плитками', () => {
    start()
    expect(chips().map(b => b.textContent).slice(-5)).toEqual(['Любой', 'Простой', 'Средний', 'Сложный', 'Мастер'])
    master().click()
    expect(master().classList.contains('on')).toBe(true)
    const x = current()
    expect(x).toBeTruthy()
    const words = longWords(x)
    const got = tiles().map(word)
    for (const w of words) expect(got).toContain(w)
    expect(got.length).toBeGreaterThanOrEqual(words.length)
    expect(got.length).toBeLessThanOrEqual(words.length + 2)
  })

  it('порядок учебника верный', () => {
    start()
    master().click()
    answer(longWords(current()))
    expect(document.querySelector('#slots')!.classList.contains('ok')).toBe(true)
  })

  it('группы внутри части можно переставить, а сказуемое в начале считается ошибкой', () => {
    for (let n = 0; n < 40; n++) {
      start()
      master().click()
      const x = current()
      const cls = longClauses(x)
      const first = cls[0]!
      const free = first.slice(0, -1)
      if (free.length < 2) continue
      answer([[...free].reverse(), [first[first.length - 1]!], ...cls.slice(1)].flat(2))
      expect(document.querySelector('#slots')!.classList.contains('ok'), x.ko).toBe(true)

      start()
      master().click()
      const y = current()
      const c2 = longClauses(y)
      const f2 = c2[0]!
      if (f2.length < 2) continue
      answer([f2[f2.length - 1]!, ...f2.slice(0, -1), ...c2.slice(1)].flat(2))
      expect(document.querySelector('#slots')!.classList.contains('ok'), y.ko).toBe(false)
      return
    }
    throw new Error('не нашлось подходящего предложения')
  })
})
