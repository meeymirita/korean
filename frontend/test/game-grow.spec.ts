import { describe, expect, it } from 'vitest'
import { boot, closeHelp } from './game-helpers'
import { LONG_SENTENCES, checkLong, growSteps, longWords } from '@/game/long-sentences'

// «Собери предложение»: уровень «Растёт» (ступени внутри длинного предложения).
const chips = () => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')]
const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#tiles .tile')]
const word = (b: Element) => (b.childNodes[0]?.textContent ?? '').trim()
const label = () => document.querySelector('.label')!.textContent!
const next = () => document.querySelector<HTMLButtonElement>('#nextBtn')
const stepWords = (x: (typeof LONG_SENTENCES)[number], ko: string) => longWords({ ...x, ko })

function start() {
  boot({ mode: () => 'build' })
  closeHelp()
  chips().find(b => b.textContent === 'Растёт')!.click()
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
const current = () => LONG_SENTENCES.find(s => s.ru === document.querySelector('.prompt')!.textContent)!

describe('growSteps: ступени всех предложений', () => {
  it('у каждой части есть ступень «вся часть», слова частей дают всё предложение, основа короче части', () => {
    for (const x of LONG_SENTENCES) {
      const steps = growSteps(x)
      expect(steps.length, x.ko).toBeGreaterThanOrEqual(1)
      const fulls = steps.filter(s => !s.core)
      expect(fulls.flatMap(s => stepWords(x, s.ko)), x.ko).toEqual(longWords(x))
      steps.forEach((s, i) => {
        if (s.core) expect(stepWords(x, s.ko).length, x.ko).toBeLessThan(stepWords(x, steps[i + 1]!.ko).length)
        expect(checkLong({ ...x, ko: s.ko }, stepWords(x, s.ko)), x.ko).toBe(true)
      })
    }
  })
})

describe('«Собери предложение»: уровень «Растёт»', () => {
  it('идёт по ступеням одного предложения', () => {
    start()
    expect(label()).toMatch(/Растёт · шаг 1 из/)
    const n = Number(/из (\d+)/.exec(label())![1])
    const x = current()
    const steps = growSteps(x)
    expect(steps.length).toBe(n)
    for (let k = 0; k < n; k++) {
      expect(label()).toContain('шаг ' + (k + 1) + ' из ' + n)
      answer(stepWords(x, steps[k]!.ko))
      expect(document.querySelector('#slots')!.classList.contains('ok'), 'ступень ' + k).toBe(true)
      if (k < n - 1) next()!.click()
    }
  })

  it('на второй части над заданием показана собранная первая', () => {
    start()
    const x = current()
    const steps = growSteps(x)
    const k = steps.findIndex(s => s.clause === 1)
    for (let j = 0; j < k; j++) {
      answer(stepWords(x, steps[j]!.ko))
      next()!.click()
    }
    expect(label()).toContain('уже есть: ' + steps[k]!.prefix)
  })
})

describe('подсказка к лишней плитке', () => {
  it('у плитки с неверной частицей нет знака вопроса', () => {
    for (let t = 0; t < 8; t++) {
      start()
      const glosses = [...document.querySelectorAll('#tiles .tile .tg')].map(e => e.textContent)
      expect(glosses.filter(g => g === '?').length).toBe(0)
    }
  })
})
