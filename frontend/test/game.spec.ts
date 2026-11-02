import { afterEach, describe, expect, it } from 'vitest'
import markupRaw from '@/game/markup.html?raw'
import { initGame } from '@/game/engine'
import { iconImg } from '@/game/icons'
import { GAME_GROUPS } from '@/data/games'

/** Разметка игры так, как её собирает страница `/game/home` (иконки подставлены, фон кота не нужен). */
const markup = markupRaw.replace('CAT_SLEEP', '').replace(/ICON\((\w+)\)/g, (_, n: string) => iconImg(n))

const ENGINE_MODES = GAME_GROUPS.flatMap(g => g.games.map(x => x.id)).filter(id => !['match', 'pairs', 'particles', 'translate', 'syllables', 'typewords', 'quick'].includes(id))
const NEW_MODES = ['days', 'when', 'too', 'num', 'price', 'count']

let dispose: (() => void) | undefined
const records: { word: string | null; ok: boolean; mode?: string }[] = []

function start(mode: string) {
  records.length = 0
  localStorage.clear()
  document.body.innerHTML = `<div id="root">${markup}</div>`
  dispose = initGame({
    record: (o: { word: string | null; ok: boolean; mode?: string }) => {
      records.push(o)
      return {}
    },
    importXp: () => {},
    state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }),
    cats: () => null,
    mode: () => mode,
    saveCats: () => {},
  })
}
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
})

const opts = () => [...document.querySelectorAll<HTMLButtonElement>('#opts .opt')]
/** Текст варианта без номера клавиши и подписи чтения */
const optText = (b: Element) => (b.querySelector('.t')?.textContent ?? '').trim()

/** Вопрос без вариантов: «собери предложение» (плитки) или «напиши» (поле): отвечаем «не знаю» и идём дальше. */
function skipOpen(mode: string, i: number) {
  const tinp = document.querySelector('#tinp')
  if (tinp) {
    ;[...document.querySelectorAll<HTMLButtonElement>('.acts button')].find(b => b.textContent?.includes('Не знаю'))!.click()
  } else {
    document.querySelector<HTMLButtonElement>('#tiles .tile')?.click()
    const chk = document.querySelector<HTMLButtonElement>('#chk')
    expect(chk, `${mode}: вопрос ${i} с плитками или полем ввода`).not.toBeNull()
    chk!.click()
  }
  expect(document.querySelector('#fb')!.classList.contains('show'), `${mode}: после ответа показан разбор`).toBe(true)
  ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
}

/** Проходит `n` вопросов режима: каждый раз нажимает случайный вариант, проверяет разбор и идёт дальше. */
function play(mode: string, n: number) {
  start(mode)
  let right = 0
  for (let i = 0; i < n; i++) {
    const options = opts()
    if (!options.length) {
      skipOpen(mode, i)
      continue
    }
    expect(options.length, `${mode}: у вопроса ${i} есть варианты`).toBeGreaterThanOrEqual(2)
    const texts = options.map(optText)
    expect(new Set(texts).size, `${mode}: варианты не повторяются (${texts.join(' | ')})`).toBe(texts.length)
    options[Math.floor(Math.random() * options.length)]!.click()
    const fb = document.querySelector('#fb')!
    expect(fb.classList.contains('show'), `${mode}: после ответа показан разбор`).toBe(true)
    const correct = document.querySelectorAll('#opts .opt.ok')
    expect(correct.length, `${mode}: верный вариант подсвечен ровно один`).toBe(1)
    const head = fb.querySelector('.fbh')!.textContent ?? ''
    if (head.startsWith('Верно')) right++
    else expect(head, `${mode}: «Правильно: …» совпадает с подсвеченным вариантом`).toContain('Правильно: ')
    ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
  }
  return right
}

describe('игра «Хлебушек»: прохождение режимов', () => {
  it('все новые режимы есть среди режимов каталога', () => {
    for (const m of NEW_MODES) expect(ENGINE_MODES).toContain(m)
  })

  for (const mode of ENGINE_MODES) {
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
      dispose?.()
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

  it('правило 에: «Когда?» не требует частицу у 오늘, 내일, 지금, 언제 и требует у остальных', () => {
    start('when')
    let off = 0
    let on = 0
    for (let i = 0; i < 200; i++) {
      const sentence = document.querySelector('.sentence')!.textContent ?? ''
      opts()[0]!.click()
      const right = optText(document.querySelector('#opts .opt.ok')!)
      const free = /^(오늘|내일|지금|언제)\s/.test(sentence.trim())
      expect(right === '에', sentence).toBe(!free)
      if (free) off++
      else on++
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
    }
    expect(off).toBeGreaterThan(5)
    expect(on).toBeGreaterThan(50)
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
