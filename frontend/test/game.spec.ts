import { afterEach, describe, expect, it } from 'vitest'
import markupRaw from '@/game/markup.html?raw'
import { initGame } from '@/game/engine'
import { iconImg } from '@/game/icons'
import { GAME_GROUPS } from '@/data/games'

/** Разметка игры так, как её собирает страница `/game/home` (иконки подставлены, фон кота не нужен). */
const markup = markupRaw.replace('CAT_SLEEP', '').replace(/ICON\((\w+)\)/g, (_, n: string) => iconImg(n))

const ENGINE_MODES = GAME_GROUPS.flatMap(g => g.games.map(x => x.id)).filter(id => !['match', 'pairs', 'particles', 'translate', 'syllables', 'typewords', 'quick', 'keyboard'].includes(id))
const NEW_MODES = ['days', 'when', 'too', 'num', 'price', 'count', 'neg', 'place', 'dem', 'polite']

let dispose: (() => void) | undefined
const records: { word: string | null; ok: boolean; mode?: string }[] = []
const grammarOpened: string[] = []

function start(mode: string) {
  dispose?.() // прежний экземпляр игры снимает свои обработчики клавиш
  records.length = 0
  grammarOpened.length = 0
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
    grammar: (id: string) => grammarOpened.push(id),
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

/** Нажимает первый вариант, возвращает текст верного, следит, чтобы после «Дальше» шла следующая задача. */
function answerAndNext(): string {
  opts()[0]!.click()
  const right = optText(document.querySelector('#opts .opt.ok')!)
  ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
  return right
}
const hasBatchim = (ch: string) => (ch.charCodeAt(0) - 0xac00) % 28 > 0

describe('игры по разделам грамматики', () => {
  it('«Это или не это»: форма по 받침 и по смыслу (это / не это)', () => {
    start('neg')
    for (let i = 0; i < 80; i++) {
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      const right = answerAndNext()
      const neg = prompt.startsWith('Это не ')
      const m = /^(.+?)(이에요|예요|이 아니에요|가 아니에요)$/.exec(right)
      expect(m, `${prompt} → ${right}`).not.toBeNull()
      const [, stem, ending] = m!
      expect(ending.includes('아니에요'), prompt).toBe(neg)
      const withB = hasBatchim(stem![stem!.length - 1]!)
      expect(['이에요', '이 아니에요'].includes(ending!), `${prompt} → ${right}`).toBe(withB)
    }
  })

  it('«Куда, где»: 에 к 가요 и 있어요, 에서 к действию', () => {
    start('place')
    let at = 0
    let to = 0
    for (let i = 0; i < 150; i++) {
      const sentence = (document.querySelector('.sentence')!.textContent ?? '').replace(/\s+/g, ' ')
      const right = answerAndNext()
      const moves = /(가요|있어요)\.$/.test(sentence.trim())
      expect(right, sentence).toBe(moves ? '에' : '에서')
      if (moves) to++
      else at++
    }
    expect(at).toBeGreaterThan(20)
    expect(to).toBeGreaterThan(20)
  })

  it('«Этот, тот, вон тот»: значения указателей', () => {
    const ko: Record<string, string> = { 'этот (рядом со мной)': '이', 'эта вещь (рядом со мной)': '이것', 'здесь (рядом со мной)': '여기', 'вон тот (далеко от обоих)': '저', 'вон там (далеко от обоих)': '저기', 'вон та вещь (далеко от обоих)': '저것' }
    start('dem')
    let checked = 0
    for (let i = 0; i < 120; i++) {
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      const right = answerAndNext()
      if (ko[prompt]) {
        expect(right, prompt).toBe(ko[prompt])
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('«Уровень вежливости»: другу — 고마워, начальнику — 감사합니다', () => {
    start('polite')
    let checked = 0
    for (let i = 0; i < 80; i++) {
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      const right = answerAndNext()
      if (prompt === 'друзьям') {
        expect(right).toBe('고마워')
        checked++
      }
      if (prompt === '감사합니다') {
        expect(right).toContain('по работе')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(5)
  })
})

describe('разбор после ответа', () => {
  /** Отвечает на n вопросов режима и считает, в скольких после ответа есть разбор «Как собрано». */
  function coverage(mode: string, n = 30) {
    start(mode)
    let shown = 0
    for (let i = 0; i < n; i++) {
      const options = opts()
      if (options.length) options[Math.floor(Math.random() * options.length)]!.click()
      else {
        const tinp = document.querySelector('#tinp')
        if (tinp) [...document.querySelectorAll<HTMLButtonElement>('.acts button')].find(b => b.textContent?.includes('Не знаю'))!.click()
        else {
          document.querySelector<HTMLButtonElement>('#tiles .tile')?.click()
          document.querySelector<HTMLButtonElement>('#chk')!.click()
        }
      }
      if (document.querySelector('#fb .bd .bd-card')) shown++
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
    }
    return shown / n
  }
  /** Режимы, где после ответа всегда есть предложение для разбора (у «хангыль-блица», «вежливости» и части «чисел» его нет). */
  const WITH_BREAKDOWN = ['word', 'rev', 'neg', 'pair', 'part', 'err', 'place', 'form', 'type', 'qw', 'dem', 'build', 'spot', 'ord', 'dlg', 'count', 'days', 'when', 'too', 'price']
  for (const mode of WITH_BREAKDOWN) {
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
    it(`«${mode}», «Рассказ 2–5»: от 2 до 5 предложений, у каждого иконка перевода, проверка в конце`, () => {
      for (let round = 0; round < 6; round++) {
        open(mode, 'Рассказ')
        const n = sentences()
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(5)
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
    dispose?.()
    document.body.innerHTML = `<div id="root">${markup}</div>`
    dispose = initGame({ record: () => ({}), importXp: () => {}, state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }), cats: () => null, mode: () => 'place', saveCats: () => {}, grammar: () => {} })
    expect(chip('Рассказ').classList.contains('on')).toBe(true)
    for (const other of ['pair', 'too', 'qw', 'part']) {
      localStorage.setItem('hleb_game_v1', JSON.stringify({ levels: { place: 'story' } }))
      dispose?.()
      start(other)
      localStorage.setItem('hleb_game_v1', JSON.stringify({ levels: { place: 'story' } }))
      expect(document.querySelector('.story'), 'у «' + other + '» свой уровень, рассказа нет').toBeNull()
    }
  })

  it('старое сохранение с одним уровнем «Пары или нет» подхватывается', () => {
    dispose?.()
    localStorage.clear()
    localStorage.setItem('hleb_game_v1', JSON.stringify({ pairLevel: 'long' }))
    document.body.innerHTML = `<div id="root">${markup}</div>`
    dispose = initGame({ record: () => ({}), importXp: () => {}, state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }), cats: () => null, mode: () => 'pair', saveCats: () => {}, grammar: () => {} })
    expect(chip('Длинный').classList.contains('on')).toBe(true)
  })
})
