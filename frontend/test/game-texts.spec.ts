import { describe, expect, it } from 'vitest'
import { records, start, stop } from './game-helpers'

// Тексты «Рассказ» и «Длинный» (вынесено из game.spec.ts: тот не помещался в память на CI).
describe('тексты: «Рассказ» и «Длинный» в «Паре или нет», «Куда, где» и «Тоже»', () => {
  const MODES = ['pair', 'place', 'too', 'neg', 'when', 'dem']
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const gapEls = () => [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const sentences = () => document.querySelectorAll('.story .story-row').length
  const checkBtn = () => document.querySelector<HTMLButtonElement>('#schk')!
  const tileText = (t: Element) => (t.textContent ?? '').replace(/^\d/, '').trim()
  const closeHelp = () => document.querySelector<HTMLButtonElement>('#helpOk')?.click() // при первом запуске окно «Как играть» открыто и клавиши не принимаются

  /** Нажал плитку, нажал каждый пропуск: все пропуски заполнены одной плиткой. */
  function fillAll(tileIdx = 0) {
    tiles()[tileIdx]!.click()
    for (const g of gapEls()) g.click()
  }
  function playStory(tileIdx = 0) {
    fillAll(tileIdx)
    expect(checkBtn().disabled, 'пропуски заполнены: «Проверить» активна').toBe(false)
    checkBtn().click()
  }
  function open(mode: string, level: string) {
    start(mode)
    chip(level).click()
  }

  it('по умолчанию уровень «Простой»: одно предложение, как раньше', () => {
    for (const m of MODES) {
      start(m)
      expect(chip('Простой').classList.contains('on'), m).toBe(true)
      expect(document.querySelector('.story'), m).toBeNull()
    }
  })

  for (const mode of MODES) {
    it(`«${mode}», «Рассказ 2–4»: от 2 до 4 предложений, у каждого иконка перевода, проверка в конце`, () => {
      for (let round = 0; round < 6; round++) {
        open(mode, 'Рассказ')
        const n = sentences()
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(4)
        const total = gapEls().length
        expect(total).toBeGreaterThanOrEqual(n)
        expect(tiles().length, 'в банке есть из чего выбирать').toBeGreaterThanOrEqual(2)
        for (const tip of document.querySelectorAll('.story-tr .story-tip')) expect((tip.textContent ?? '').length, 'перевод есть у каждого предложения').toBeGreaterThan(3)
        expect(document.querySelectorAll('.story-tr').length).toBe(n)
        expect(checkBtn().disabled, 'пока пропуски пусты, проверять нечего').toBe(true)
        expect(document.querySelector('#fb')!.classList.contains('show')).toBe(false)
        playStory(round % tiles().length)
        expect(records.length, 'каждый пропуск засчитан отдельным ответом').toBe(total)
        expect(records.every(r => r.mode === mode)).toBe(true)
        expect(document.querySelector('#fb .fbh')!.textContent).toContain('Рассказ пройден: верно')
        expect(document.querySelector('#fb .bd-card'), 'разбор не лежит текстом внизу').toBeNull()
        expect(document.querySelectorAll('.story-info:not(:disabled)').length, 'у каждого предложения кнопка «Разбор»').toBe(n)
        ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
        expect(sentences()).toBeGreaterThanOrEqual(2)
      }
    })

    it(`«${mode}», «Длинный 5–10»: от 5 до 10 предложений`, () => {
      for (let round = 0; round < 4; round++) {
        open(mode, 'Длинный')
        const n = sentences()
        expect(n).toBeGreaterThanOrEqual(5)
        expect(n).toBeLessThanOrEqual(10)
        playStory()
        expect(records.length).toBe(gapEls().length)
      }
    })
  }

  it('выбор можно отменить: нажатие на заполненный пропуск убирает ответ, потом выбираешь другой', () => {
    open('place', 'Рассказ')
    const [t0, t1] = tiles()
    t0!.click()
    gapEls()[0]!.click()
    expect(gapEls()[0]!.textContent).toBe(tileText(t0!))
    t0!.click() // снять выбор плитки
    gapEls()[0]!.click() // нажатие без выбранной плитки убирает ответ
    expect(gapEls()[0]!.textContent).toBe('___')
    t1!.click()
    gapEls()[0]!.click()
    expect(gapEls()[0]!.textContent).toBe(tileText(t1!))
    expect(checkBtn().disabled).toBe(true)
    document.querySelector<HTMLButtonElement>('#sclr')!.click()
    expect(gapEls().every(g => g.textContent === '___')).toBe(true)
  })

  it('кнопка «Разбор» справа от предложения: до проверки неактивна, после открывает окно с разбором', () => {
    open('too', 'Рассказ')
    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.story-row .story-info')]
    expect(buttons().every(b => b.disabled)).toBe(true)
    playStory()
    expect(buttons().every(b => !b.disabled)).toBe(true)
    for (const b of buttons()) expect(b.classList.contains('ok') || b.classList.contains('bad')).toBe(true)
    buttons()[0]!.click()
    const win = document.querySelector('.story-win')!
    expect(win).not.toBeNull()
    expect(win.querySelectorAll('.story-win-gap').length).toBeGreaterThanOrEqual(1)
    expect(win.querySelector('.bd-card')).not.toBeNull()
    expect(win.querySelector('.bd-rule')).not.toBeNull()
    win.querySelector<HTMLButtonElement>('.story-win-x')!.click()
    expect(document.querySelector('.story-win')).toBeNull()
  })

  it('окно разбора закрывается по Esc, по клику рядом и при переходе к следующему заданию', () => {
    open('place', 'Рассказ')
    playStory()
    const openWin = () => document.querySelector<HTMLButtonElement>('.story-row .story-info')!.click()
    openWin()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('.story-win')).toBeNull()
    openWin()
    document.querySelector<HTMLElement>('.story-win')!.click()
    expect(document.querySelector('.story-win')).toBeNull()
    openWin()
    ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
    expect(document.querySelector('.story-win')).toBeNull()
  })

  it('«Этот, тот»: у каждого предложения пометка, где предмет; в банке указатели одного семейства', () => {
    for (let round = 0; round < 6; round++) {
      open('dem', 'Рассказ')
      const cues = [...document.querySelectorAll('.story-cue')].map(c => (c.textContent ?? '').replace(/[()\s]+/g, ' ').trim())
      expect(cues.length).toBe(sentences())
      for (const c of cues) expect(['рядом со мной', 'рядом с тобой', 'далеко от обоих']).toContain(c)
      const texts = tiles().map(tileText)
      expect(texts.length % 3).toBe(0) // указатели идут тройками (этот, тот, вон тот)
    }
  })

  it('«Когда? (에)»: в банке есть плитка «—» (частица не нужна), у 오늘, 내일, 지금 верный ответ «—»', () => {
    let sawNone = false
    for (let round = 0; round < 12 && !sawNone; round++) {
      open('when', 'Длинный')
      expect(tiles().map(tileText)).toContain('—')
      sawNone = [...document.querySelectorAll('.story .story-s')].some(p => /^\s*(\(.*\))?\s*(오늘|내일|지금)/.test(p.textContent ?? ''))
    }
    expect(sawNone, 'в длинных текстах встречаются слова без 에').toBe(true)
  })

  it('иконка перевода слева: по нажатию (на телефоне) показывает или прячет перевод', () => {
    open('pair', 'Рассказ')
    const tr = document.querySelector<HTMLButtonElement>('.story-tr')!
    expect(tr.classList.contains('open')).toBe(false)
    tr.click()
    expect(tr.classList.contains('open')).toBe(true)
    tr.click()
    expect(tr.classList.contains('open')).toBe(false)
  })

  it('клавиши: цифра ставит плитку в первый пустой пропуск, Backspace убирает, Enter проверяет', () => {
    open('too', 'Рассказ')
    closeHelp()
    const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    const total = gapEls().length
    key('1')
    expect(gapEls()[0]!.textContent).not.toBe('___')
    key('Backspace')
    expect(gapEls()[0]!.textContent).toBe('___')
    for (let i = 0; i < total; i++) key('1')
    expect(checkBtn().disabled).toBe(false)
    key('Enter')
    expect(document.querySelector('#fb')!.classList.contains('show')).toBe(true)
    expect(records.length).toBe(total)
  })

  it('бонус за итог: все верно даёт первому верному ответу +5 к опыту; без ошибок серия идёт подряд', () => {
    open('place', 'Рассказ')
    // «Куда, где»: 에 после «가요 / 있어요» (куда идёшь, где находишься), 에서 после действия
    const right = (sentence: string) => (/(가요|있어요)\.$/.test(sentence.trim()) ? '에' : '에서')
    const sentenceTexts = [...document.querySelectorAll('.story .story-s')].map(p => (p.textContent ?? '').replace(/___/g, '').replace(/\s+/g, ' '))
    // порядок пропусков совпадает с порядком предложений (в «Куда, где» по пропуску на предложение)
    const bankIdx = (t: string) => tiles().findIndex(b => tileText(b) === t)
    sentenceTexts.forEach((txt, i) => {
      tiles()[bankIdx(right(txt))]!.click()
      gapEls()[i]!.click()
      tiles()[bankIdx(right(txt))]!.click() // снять выбор, чтобы следующий клик был «плитка, пропуск»
    })
    checkBtn().click()
    expect(document.querySelector('#fb .fbh')!.textContent).toContain('бонус +5')
    const xps = (records as { xp?: number }[]).map(r => r.xp)
    expect(xps[0]).toBe(15)
    expect(xps.slice(1).every(x => x === 10)).toBe(true)
  })

  it('выбранный уровень запоминается по режимам, в других режимах текстов нет', () => {
    open('place', 'Рассказ')
    expect(JSON.parse(localStorage.getItem('hleb_game_v1')!).levels.place).toBe('story')
    start('place', true)
    expect(chip('Рассказ').classList.contains('on')).toBe(true)
    for (const other of ['pair', 'too', 'ord', 'spot']) {
      localStorage.setItem('hleb_game_v1', JSON.stringify({ levels: { place: 'story' } }))
      start(other)
      localStorage.setItem('hleb_game_v1', JSON.stringify({ levels: { place: 'story' } }))
      expect(document.querySelector('.story'), 'у «' + other + '» свой уровень, рассказа нет').toBeNull()
    }
  })

  it('старое сохранение с одним уровнем «Пары или нет» подхватывается', () => {
    stop()
    localStorage.clear()
    localStorage.setItem('hleb_game_v1', JSON.stringify({ pairLevel: 'long' }))
    start('pair', true)
    expect(chip('Длинный').classList.contains('on')).toBe(true)
  })
})
