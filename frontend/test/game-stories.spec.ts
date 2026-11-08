import { afterEach, describe, expect, it } from 'vitest'
import markupRaw from '@/game/markup.html?raw'
import { initGame } from '@/game/engine'
import { iconImg } from '@/game/icons'
import { D as DICT } from '@/data/korean/words'
import { D as GD } from '@/game/words'
import { EXCHANGES } from '@/game/dialogs'
import { STORIES } from '@/game/stories'

// Тексты «Рассказ» и «Длинный» в режимах, добавленных позже (отдельный файл: общий `game.spec.ts` уже занимает много памяти).
const markup = markupRaw.replace('CAT_SLEEP', '').replace(/ICON\((\w+)\)/g, (_, n: string) => iconImg(n))
let dispose: (() => void) | undefined
const records: { word: string | null; ok: boolean; mode?: string }[] = []

function start(mode: string) {
  dispose?.()
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
    grammar: () => {},
  })
}
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
})

describe('тексты: «Слово → перевод» и «Перевод → слово»', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileText = (b: Element) => (b.textContent ?? '').replace(/^\d/, '').trim()
  const rows = () => [...document.querySelectorAll('.story .story-row')]
  const firstRu = (s: string) => s.split(/[;,(]/)[0]!.trim()
  /** Предложение строки без пропусков и стрелки: «저는 [학생]이에요.» */
  const flat = (r: Element, gap: string) => [...r.querySelector('.story-s')!.childNodes].map(n => ((n as Element).classList?.contains('gap') ? gap : n.textContent)).join('').replace('  →  ' + gap, '').replace(/\s+/g, ' ').trim()

  for (const [mode, level, min, max] of [['word', 'Рассказ', 2, 4], ['word', 'Длинный', 5, 10], ['rev', 'Рассказ', 2, 4], ['rev', 'Длинный', 5, 10]] as const) {
    it(`«${mode}», «${level}»: ${min}–${max} предложений, верный ответ каждого пропуска есть в банке, в банке нет повторов`, () => {
      for (let round = 0; round < 4; round++) {
        start(mode)
        document.querySelector<HTMLButtonElement>('#helpOk')?.click()
        chip(level).click()
        const n = rows().length
        expect(n).toBeGreaterThanOrEqual(min)
        expect(n).toBeLessThanOrEqual(max)
        const bank = tiles().map(tileText)
        expect(new Set(bank).size, 'без повторов в банке').toBe(bank.length)
        expect(bank.length, 'в банке есть ловушки').toBeGreaterThan(n > 5 ? n - 1 : 3)
        for (const r of rows()) {
          if (mode === 'rev') {
            const ko = flat(r, '___')
            const pre = ko.split('___')[0]!, post = ko.split('___')[1] ?? ''
            const ds = DICT.filter(x => x.s === pre + x.k + post)
            expect(ds.length, 'предложение «' + ko + '» есть в словаре сайта').toBeGreaterThan(0)
            expect(ds.some(d => bank.includes(d.k)), 'верное слово (одно из ' + ds.map(d => d.k).join(', ') + ') в банке; предложение «' + ko + '»').toBe(true)
          } else {
            const ds = DICT.filter(x => x.s === flat(r, ''))
            expect(ds.length, 'предложение «' + flat(r, '') + '» есть в словаре сайта').toBeGreaterThan(0)
            expect(ds.some(d => bank.includes(firstRu(d.t))), 'верный перевод (один из ' + ds.map(d => firstRu(d.t)).join(', ') + ') в банке').toBe(true)
          }
        }
      }
    })
  }

  it('«Слово → перевод»: перевод предложения скрыт (он выдал бы ответ), слово подсвечено; в разборе после проверки перевод есть', () => {
    start('word')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    chip('Рассказ').click()
    expect(rows().length).toBeGreaterThan(0)
    for (const r of rows()) {
      expect(r.querySelector('.story-tr.off'), 'иконка выключена').not.toBeNull()
      expect(r.querySelector('.story-tip'), 'перевода в разметке нет').toBeNull()
      expect(r.querySelector('mark.story-mark'), 'слово подсвечено').not.toBeNull()
    }
    tiles()[0]!.click()
    for (const g of document.querySelectorAll<HTMLButtonElement>('.story .gap')) g.click()
    document.querySelector<HTMLButtonElement>('#schk')!.click()
    document.querySelector<HTMLButtonElement>('.story-info')!.click()
    expect(document.querySelector('.story-win')?.textContent, 'в окне разбора виден перевод предложения').toMatch(/[а-яё]{3}/i)
  })

  it('«Перевод → слово»: у каждого предложения иконка с переводом, банк из корейских слов', () => {
    start('rev')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    chip('Рассказ').click()
    for (const r of rows()) expect(r.querySelector('.story-tr:not(.off) .story-tip')?.textContent, 'перевод предложения').toBeTruthy()
    for (const t of tiles()) expect(tileText(t)).toMatch(/[가-힣]/)
  })

  it('каждый уровень проходится до конца: ответы засчитаны, «Дальше» создаёт новый текст', () => {
    for (const mode of ['word', 'rev']) for (const level of ['Рассказ', 'Длинный']) {
      start(mode)
      document.querySelector<HTMLButtonElement>('#helpOk')?.click()
      chip(level).click()
      const total = document.querySelectorAll('.story .gap').length
      tiles()[0]!.click()
      for (const g of document.querySelectorAll<HTMLButtonElement>('.story .gap')) g.click()
      document.querySelector<HTMLButtonElement>('#schk')!.click()
      expect(records.length, mode + ' ' + level).toBe(total)
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
      expect(rows().length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('тексты: «Вопросы», «Частицы и счёт», «Выбери форму»', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileText = (b: Element) => (b.textContent ?? '').replace(/^\d/, '').trim()
  const rows = () => [...document.querySelectorAll('.story .story-row')]
  const flat = (r: Element) => [...r.querySelector('.story-s')!.childNodes].map(n => ((n as Element).classList?.contains('gap') ? '___' : (n as Element).classList?.contains('story-cue') ? '' : n.textContent)).join('')
  const jungOf = (ch: string) => Math.floor(((ch.charCodeAt(0) - 0xac00) % 588) / 28)

  /** Верный ответ строки (так, как его знает тест, независимо от движка). */
  function expected(mode: string, r: Element): string {
    const text = flat(r)
    if (mode === 'qw') {
      const ans = text.split('→')[1]!.trim()
      const [pre, post] = text.split('→')[0]!.trim().split('___')
      const words = ['어디', '누구', '뭐', '얼마', '몇', '어느', '무슨']
      // одному ответу («네. 있어요.») подходят несколько вопросов: берём тот, что совпадает с текстом строки
      for (const e of EXCHANGES.filter(x => x[2] === ans)) {
        const w = words.find(q => e[0] === pre + q + (post ?? ''))
        if (w) return w
      }
      return ''
    }
    if (mode === 'part') {
      const [pre, post] = text.split('___')
      return GD.PB.find((p: string[]) => p[0] === pre + '___' + post)![2]
    }
    const pre = text.split('___')[0]!
    const harmony = [0, 8].includes(jungOf(pre[pre.length - 1]!))
    const past = !!r.querySelector('.story-cue')
    return harmony ? (past ? '았어요' : '아요') : past ? '었어요' : '어요'
  }

  for (const mode of ['qw', 'part', 'form']) for (const [level, min, max] of [['Рассказ', 2, 4], ['Длинный', 5, 10]] as const) {
    it(`«${mode}», «${level}»: ${min}–${max} предложений; если ставить верные плитки, все пропуски верны и бонус +5; без повторов в банке`, () => {
      for (let round = 0; round < 3; round++) {
        start(mode)
        document.querySelector<HTMLButtonElement>('#helpOk')?.click()
        chip(level).click()
        const n = rows().length
        expect(n).toBeGreaterThanOrEqual(mode === 'qw' ? Math.min(min, 2) : min)
        expect(n).toBeLessThanOrEqual(max)
        const bank = tiles().map(tileText)
        expect(new Set(bank).size, 'без повторов в банке').toBe(bank.length)
        expect(bank.length, 'есть из чего выбирать').toBeGreaterThanOrEqual(mode === 'form' ? 4 : 3)
        const gaps = [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]
        rows().forEach((r, i) => {
          const right = expected(mode, r)
          expect(bank, 'верный ответ «' + right + '» в банке; строка «' + flat(r) + '»').toContain(right)
          const ti = bank.indexOf(right)
          tiles()[ti]!.click()
          gaps[i]!.click()
          tiles()[ti]!.click()
        })
        document.querySelector<HTMLButtonElement>('#schk')!.click()
        expect(document.querySelector('#fb .fbh')!.textContent, mode + ' ' + level).toContain('бонус +5')
        expect(records.every(x => x.ok), 'все ответы верны').toBe(true)
        expect(records.length).toBe(gaps.length)
      }
    })
  }

  it('«Вопросы»: подсказка в иконке — перевод ответа, а не вопроса', () => {
    start('qw')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    chip('Рассказ').click()
    for (const r of rows()) expect(r.querySelector('.story-tip')?.textContent).toMatch(/^Ответ: «/)
  })

  it('«Выбери форму»: четыре плитки окончаний, у прошедшего времени пометка «в прошлом»', () => {
    start('form')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    chip('Длинный').click()
    expect(tiles().map(tileText).sort()).toEqual(['아요', '어요', '았어요', '었어요'].sort())
  })
})

describe('тексты: «Дни недели», «Числа», «Сколько стоит?», «Счётные слова», «Уровень вежливости»', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileText = (b: Element) => (b.textContent ?? '').replace(/^\d/, '').trim()
  const rows = () => [...document.querySelectorAll('.story .story-row')]
  const tip = (r: Element) => r.querySelector('.story-tip')?.textContent ?? ''
  const DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
  const ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье']
  const RU_DAY = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
  const NATF = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열']
  const SINO = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십']
  const ITEM_COUNTER: Record<string, string> = { 사과: '개', 물: '병', 커피: '잔', 비빔밥: '그릇', 학생: '명', 고양이: '마리', 책: '권', 빵: '개', 친구: '명', 우유: '병' }
  const SD = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const part = (x: number) => { let o = ''; const th = Math.floor(x / 1000), h = Math.floor(x % 1000 / 100), tn = Math.floor(x % 100 / 10), u = x % 10; if (th) o += (th > 1 ? SD[th] : '') + '천'; if (h) o += (h > 1 ? SD[h] : '') + '백'; if (tn) o += (tn > 1 ? SD[tn] : '') + '십'; if (u) o += SD[u]; return o }
  const sino = (n: number) => { const man = Math.floor(n / 10000), r = n % 10000; return (man ? (man > 1 ? part(man) : '') + '만' : '') + part(r) }
  const rowText = (r: Element) => [...r.querySelector('.story-s')!.childNodes].map(n => ((n as Element).classList?.contains('gap') ? '___' : (n as Element).classList?.contains('story-cue') ? '' : n.textContent)).join('')

  /** Верный ответ каждой строки так, как его знает тест (из подсказки и самого предложения), независимо от движка. */
  function expected(mode: string, r: Element, soFar: number[]): string {
    const text = rowText(r), tp = tip(r)
    if (mode === 'days') {
      const m = tp.match(/^Сегодня ([а-яё]+)\. Какой день завтра/)
      if (m) return DAYS[(RU_DAY.indexOf(m[1]!) + 1) % 7]!
      const i = ACC.findIndex(a => tp.toLowerCase().startsWith(a))
      return DAYS[i]!
    }
    if (mode === 'price') {
      const m = tp.match(/: ([\d ]+) вон/)
      if (m) { const v = Number(m[1]!.replace(/ /g, '')); soFar.push(v); return sino(v) }
      return sino(soFar.reduce((a, b) => a + b, 0))
    }
    if (mode === 'polite') return ['고마워요', '고마워', '감사해요', '감사합니다'].find(f => text.includes(f + '.') && text.indexOf('___') === text.indexOf(f) || false) ?? ''
    // count / num
    const floor = tp.match(/на (\d)-м этаже/)
    if (floor) return SINO[Number(floor[1]) - 1]!
    const k = Number(tp.match(/: (\d)\./)![1])
    const item = Object.keys(ITEM_COUNTER).find(w => text.startsWith(w))!
    return text.includes('___ ' + ITEM_COUNTER[item]) || text.match(/___ [가-힣]+ 있어요/) && !text.includes(' ' + NATF[k - 1] + ' ___') ? NATF[k - 1]! : ITEM_COUNTER[item]!
  }

  for (const mode of ['days', 'num', 'price', 'count']) for (const [level, min, max] of [['Рассказ', 2, 4], ['Длинный', 5, 11]] as const) {
    it(`«${mode}», «${level}»: ${min}–${max} строк; верные плитки дают все пропуски верными, бонус +5; без повторов в банке`, () => {
      for (let round = 0; round < 3; round++) {
        start(mode)
        document.querySelector<HTMLButtonElement>('#helpOk')?.click()
        chip(level).click()
        const n = rows().length
        expect(n).toBeGreaterThanOrEqual(min)
        expect(n).toBeLessThanOrEqual(max)
        const bank = tiles().map(tileText)
        expect(new Set(bank).size, 'без повторов в банке').toBe(bank.length)
        const gaps = [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]
        const sum: number[] = []
        rows().forEach((r, i) => {
          const right = expected(mode, r, sum)
          expect(bank, 'верный ответ «' + right + '» в банке; строка «' + rowText(r) + '», подсказка «' + tip(r) + '»').toContain(right)
          const ti = bank.indexOf(right)
          tiles()[ti]!.click()
          gaps[i]!.click()
          tiles()[ti]!.click()
        })
        document.querySelector<HTMLButtonElement>('#schk')!.click()
        expect(document.querySelector('#fb .fbh')!.textContent, mode + ' ' + level).toContain('бонус +5')
        expect(records.every(x => x.ok)).toBe(true)
      }
    })
  }

  for (const level of ['Рассказ', 'Длинный']) {
    it(`«polite», «${level}»: в банке четыре формы «спасибо», у каждой строки пометка, кому говоришь`, () => {
      start('polite')
      document.querySelector<HTMLButtonElement>('#helpOk')?.click()
      chip(level).click()
      expect(tiles().map(tileText).sort()).toEqual(['고마워', '고마워요', '감사해요', '감사합니다'].sort())
      for (const r of rows()) expect(r.querySelector('.story-cue')?.textContent).toMatch(/говоришь/)
      // каждый адресат закреплён за одной формой: ставим по пометке и получаем бонус
      const FORM: Record<string, string> = { 'другу': '고마워', 'младшему брату или сестре': '고마워', 'однокласснику': '고마워', 'знакомому старше тебя': '고마워요', 'старшему брату': '고마워요', 'соседке': '고마워요', 'коллеге': '감사해요', 'товарищу по работе': '감사해요', 'соседу по офису': '감사해요', 'начальнику': '감사합니다', 'учителю': '감사합니다', 'незнакомому взрослому': '감사합니다' }
      const gaps = [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]
      rows().forEach((r, i) => {
        const who = (r.querySelector('.story-cue')!.textContent ?? '').replace(/^\(говоришь /, '').replace(/\) ?$/, '').trim()
        const right = FORM[who]!
        expect(right, 'адресат «' + who + '» известен').toBeTruthy()
        const ti = tiles().map(tileText).indexOf(right)
        tiles()[ti]!.click(); gaps[i]!.click(); tiles()[ti]!.click()
      })
      document.querySelector<HTMLButtonElement>('#schk')!.click()
      expect(document.querySelector('#fb .fbh')!.textContent).toContain('бонус +5')
    })
  }

  it('«Сколько стоит?»: последняя строка «всего» — сумма цен выше; цифры лежат в иконке', () => {
    start('price')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    chip('Рассказ').click()
    const rs = rows()
    expect(tip(rs[rs.length - 1]!)).toMatch(/Сложи все цены/)
    for (const r of rs.slice(0, -1)) expect(tip(r)).toMatch(/\d+ вон/)
  })
})

describe('уровни: «Диалог», «Найди ошибку», «Найди верное», «Хангыль-блиц»', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileText = (b: Element) => (b.textContent ?? '').replace(/^\d/, '').trim()
  const rows = () => [...document.querySelectorAll('.story .story-row')]
  const rowText = (r: Element) => [...r.querySelector('.story-s')!.childNodes].map(n => ((n as Element).classList?.contains('gap') ? '___' : n.textContent)).join('')
  const open = (mode: string, level: string) => { start(mode); document.querySelector<HTMLButtonElement>('#helpOk')?.click(); chip(level).click() }

  function playRight(mode: string, right: (r: Element) => string) {
    const bank = tiles().map(tileText)
    const gaps = [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]
    rows().forEach((r, i) => {
      const want = right(r)
      expect(bank, 'верный ответ «' + want + '» в банке; строка «' + rowText(r) + '»').toContain(want)
      const ti = bank.indexOf(want)
      tiles()[ti]!.click(); gaps[i]!.click(); tiles()[ti]!.click()
    })
    document.querySelector<HTMLButtonElement>('#schk')!.click()
    expect(document.querySelector('#fb .fbh')!.textContent, mode).toContain('бонус +5')
    expect(records.every(x => x.ok)).toBe(true)
  }

  for (const [level, min, max] of [['Рассказ', 2, 4], ['Длинный', 5, 10]] as const) {
    it(`«dlg», «${level}»: на каждый вопрос в банке есть свой ответ; верные ответы дают бонус +5`, () => {
      for (let round = 0; round < 3; round++) {
        open('dlg', level)
        expect(rows().length).toBeGreaterThanOrEqual(min)
        expect(rows().length).toBeLessThanOrEqual(max)
        const tags = rows().map(r => EXCHANGES.find(e => rowText(r).startsWith(e[0]))![4])
        expect(new Set(tags).size, 'у вопросов в тексте разные теги: ответы одного тега друг другу подходят').toBe(tags.length)
        playRight('dlg', r => EXCHANGES.find(e => rowText(r).startsWith(e[0]))![2])
      }
    })
  }

  for (const [level, min, max] of [['Рассказ', 3, 4], ['Длинный', 5, 10]] as const) {
    it(`«err», «${level}»: ${min}–${max} предложений, есть и верные, и с ошибкой; отметки по данным дают бонус +5`, () => {
      for (let round = 0; round < 3; round++) {
        open('err', level)
        expect(rows().length).toBeGreaterThanOrEqual(min)
        expect(rows().length).toBeLessThanOrEqual(max)
        expect([...document.querySelectorAll('#bank .tile')].map(tileText).sort()).toEqual(['верно', 'ошибка'])
        let bad = 0
        playRight('err', r => {
          const text = rowText(r).replace('___', '').trim()
          const verdict = GD.PB.some((p: string[]) => { const [pre, post] = p[0].split('___'); return text === pre + p[2] + (post ?? '') }) ? 'верно' : 'ошибка'
          if (verdict === 'ошибка') bad++
          return verdict
        })
        expect(bad, 'есть хотя бы одно предложение с ошибкой').toBeGreaterThan(0)
        expect(bad, 'и хотя бы одно верное').toBeLessThan(rows().length)
      }
    })
  }

  it('«spot»: уровни «Текст 2–3» и «Длинный 4–5»: три текста, ровно один без ошибок', () => {
    for (const [level, lo, hi] of [['Текст', 2, 3], ['Длинный', 4, 5]] as const) {
      for (let round = 0; round < 4; round++) {
        open('spot', level)
        const opts = [...document.querySelectorAll('#opts .opt')].map(o => (o.textContent ?? '').trim())
        expect(opts.length).toBe(3)
        const bads = GD.PB.flatMap((p: string[]) => { const [pre, post] = p[0].split('___'); return p[3].filter((w: string) => w !== p[2]).map((w: string) => pre + w + (post ?? '')) })
        const clean = opts.filter(o => !bads.some((b: string) => o.includes(b)))
        expect(clean.length, 'один текст без ошибок среди ' + JSON.stringify(opts)).toBe(1)
        const sentences = (clean[0]!.match(/[.?!]/g) ?? []).length
        expect(sentences).toBeGreaterThanOrEqual(lo)
        expect(sentences).toBeLessThanOrEqual(hi)
        ;(document.querySelectorAll('#opts .opt')[0] as HTMLButtonElement).click()
        expect(document.querySelectorAll('#opts .opt.ok').length).toBe(1)
      }
    }
  })

  it('«han»: «Слова» и «Строки»: верное чтение среди вариантов', () => {
    for (const level of ['Слова', 'Строки']) {
      for (let round = 0; round < 6; round++) {
        open('han', level)
        const prompt = (document.querySelector('#card .prompt, #card .q-prompt, #prompt')?.textContent ?? '').trim()
        const opts = [...document.querySelectorAll('#opts .opt')].map(o => (o.textContent ?? '').replace(/^\d/, '').trim())
        expect(opts.length).toBe(4)
        expect(new Set(opts).size, 'варианты разные').toBe(4)
        if (prompt) {
          const reading = prompt.split(' ').map(w => DICT.find(d => d.k === w)?.r)
          if (reading.every(Boolean)) expect(opts, 'чтение «' + prompt + '»').toContain(reading.join(' '))
        }
      }
    }
  })

  it('уровни запоминаются по режимам, «Слоги» у хангыль-блица остаётся прежним заданием', () => {
    start('han')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    expect(chip('Слоги').classList.contains('on')).toBe(true)
    expect(document.querySelector('.story')).toBeNull()
  })
})

describe('«Напиши форму»: тексты с вводом с клавиатуры', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const inputs = () => [...document.querySelectorAll<HTMLInputElement>('.story input.gap-in')]
  const type = (i: HTMLInputElement, v: string) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })) }
  const jungOf = (ch: string) => Math.floor(((ch.charCodeAt(0) - 0xac00) % 588) / 28)
  const open = (level: string) => { start('type'); document.querySelector<HTMLButtonElement>('#helpOk')?.click(); chip(level).click() }
  /** Верная форма: основа из подсказки «먹다» + окончание по гласному (и по пометке «в прошлом»). */
  const right = (inp: HTMLInputElement) => {
    const cue = inp.closest('.story-row')!.querySelector('.story-cue')!.textContent!
    const stem = cue.replace(/^\(/, '').split(/[,)]/)[0]!.slice(0, -1)
    const harmony = [0, 8].includes(jungOf(stem[stem.length - 1]!))
    const past = /в прошлом/.test(cue)
    return stem + (harmony ? (past ? '았어요' : '아요') : past ? '었어요' : '어요')
  }

  for (const [level, min, max] of [['Рассказ', 3, 4], ['Длинный', 5, 8]] as const) {
    it(`«type», «${level}»: ${min}–${max} полей ввода, банка нет, верные формы дают бонус +5`, () => {
      for (let round = 0; round < 3; round++) {
        open(level)
        expect(inputs().length).toBeGreaterThanOrEqual(min)
        expect(inputs().length).toBeLessThanOrEqual(max)
        expect(document.querySelector('#bank'), 'банка плиток нет').toBeNull()
        const chk = document.querySelector<HTMLButtonElement>('#schk')!
        expect(chk.disabled, 'пока поля пусты, проверять нечего').toBe(true)
        for (const i of inputs()) type(i, right(i))
        expect(chk.disabled).toBe(false)
        chk.click()
        expect(document.querySelector('#fb .fbh')!.textContent).toContain('бонус +5')
        expect(records.every(x => x.ok)).toBe(true)
        expect(inputs().every(i => i.classList.contains('ok'))).toBe(true)
      }
    })
  }

  it('неверная форма красится как ошибка, Очистить пустит поля, пробелы не мешают', () => {
    open('Рассказ')
    for (const i of inputs()) type(i, 'ㅁ')
    document.querySelector<HTMLButtonElement>('#sclr')!.click()
    expect(inputs().every(i => i.value === '')).toBe(true)
    const first = inputs()[0]!
    type(first, right(first).split('').join(' '))
    for (const i of inputs().slice(1)) type(i, 'ㅁ')
    document.querySelector<HTMLButtonElement>('#schk')!.click()
    expect(first.classList.contains('ok'), 'с пробелами всё равно верно').toBe(true)
    expect(inputs().slice(1).every(i => i.classList.contains('bad'))).toBe(true)
  })
})

describe('«Порядок слов»: рассказы из учебника', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileText = (b: Element) => (b.textContent ?? '').replace(/^\d/, '').trim()
  const rows = () => [...document.querySelectorAll('.story .story-row')]
  const rowText = (r: Element) => [...r.querySelector('.story-s')!.childNodes].map(n => ((n as Element).classList?.contains('gap') ? '' : n.textContent)).join('').trim()
  const open = (level: string) => { start('ord'); document.querySelector<HTMLButtonElement>('#helpOk')?.click(); chip(level).click() }

  it('рассказы: у каждого предложения есть перевод, нет повторов, предложения идут в порядке учебника', () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(8)
    for (const st of STORIES) {
      expect(st.sents.length, st.id).toBeGreaterThanOrEqual(2)
      expect(new Set(st.sents.map(s => s.ko)).size, st.id + ' без повторов').toBe(st.sents.length)
      for (const s of st.sents) { expect(s.ko).toMatch(/[가-힣]/); expect(s.ru).toMatch(/[а-яё]/i) }
    }
    expect(STORIES.filter(s => s.sents.length >= 5).length, 'для «Длинного» нужно несколько рассказов от 5 предложений').toBeGreaterThanOrEqual(3)
  })

  for (const [level, min, max] of [['Рассказ', 2, 4], ['Длинный', 5, 10]] as const) {
    it(`«ord», «${level}»: ${min}–${max} предложений, они перемешаны, верные номера дают бонус +5`, () => {
      for (let round = 0; round < 8; round++) {
        open(level)
        const n = rows().length
        expect(n).toBeGreaterThanOrEqual(min)
        expect(n).toBeLessThanOrEqual(max)
        expect(tiles().map(tileText)).toEqual([...Array(n).keys()].map(i => String(i + 1)))
        // два рассказа могут делить предложение («이 방은 제 방이에요.»), поэтому ищем тот, где подходят все строки
        const st = STORIES.find(x => x.sents.length === n && rows().every(r => x.sents.some(s => rowText(r).includes(s.ko))))!
        expect(st, 'рассказ найден').toBeTruthy()
        const order = rows().map(r => st.sents.findIndex(s => rowText(r).includes(s.ko)) + 1)
        expect(order.every(k => k > 0), 'все предложения из одного рассказа').toBe(true)
        expect(order.every((k, i) => k === i + 1), 'предложения перемешаны').toBe(false)
        const gaps = [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]
        order.forEach((k, i) => { tiles()[k - 1]!.click(); gaps[i]!.click(); tiles()[k - 1]!.click() })
        document.querySelector<HTMLButtonElement>('#schk')!.click()
        expect(document.querySelector('#fb .fbh')!.textContent).toContain('бонус +5')
        expect(records.every(x => x.ok)).toBe(true)
      }
    })
  }

  it('простой «Порядок слов» остаётся прежним заданием', () => {
    start('ord')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    expect(chip('Простой').classList.contains('on')).toBe(true)
    expect(document.querySelector('.story')).toBeNull()
  })
})

describe('«Тексты по правилу» (ptext)', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels:not(.fams) .chip')].find(b => b.textContent?.includes(text))!
  const fam = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.fams .chip')].find(b => b.textContent?.includes(text))!
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileText = (b: Element) => (b.textContent ?? '').replace(/^\d/, '').trim()
  const rows = () => [...document.querySelectorAll('.story .story-row')]
  const open = (famName: string, level: string) => { start('ptext'); document.querySelector<HTMLButtonElement>('#helpOk')?.click(); fam(famName).click(); chip(level).click() }
  const FAMS: [string, string[]][] = [['은 / 는', ['은', '는']], ['이 / 가', ['이', '가']], ['을 / 를', ['을', '를']], ['에 / 에서', ['에', '에서']], ['하고 / 와 / 과', ['하고', '와', '과']], ['Все вместе', ['은', '는', '이', '가', '을', '를', '에', '에서', '하고', '와', '과']]]
  /** Всё, что разбор называет нужным ответом (после проверки): окна «Разбор» по каждому предложению. */
  const needs = () => [...document.querySelectorAll<HTMLButtonElement>('.story-info')].flatMap(b => {
    b.click()
    const t = document.querySelector('.story-win')!.textContent ?? ''
    document.querySelector<HTMLButtonElement>('.story-win-x')!.click()
    return [...t.matchAll(/(?:нужно: |Верно: )([가-힣]+)/g)].map(m => m[1]!)
  })

  it('шесть чипов правил, у каждого свой набор плиток; по умолчанию «은 / 는»; выбор запоминается', () => {
    start('ptext')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    expect(document.querySelectorAll('.fams .chip').length).toBe(6)
    expect(fam('은 / 는').classList.contains('on')).toBe(true)
    for (const [name, marks] of FAMS) expect((fam(name).click(), tiles().map(tileText).sort()), name).toEqual([...marks].sort())
    fam('에 / 에서').click()
    expect(JSON.parse(localStorage.getItem('hleb_game_v1')!).pfam).toBe('place')
  })

  for (const [name, marks] of FAMS) for (const [level, min, max] of [['Простой', 1, 1], ['Рассказ', 2, 4], ['Длинный', 5, 10]] as const) {
    it(`«${name}», «${level}»: ${min}–${max} предложений; нужные частицы всегда из набора правила, повторов предложений нет`, () => {
      for (let round = 0; round < 3; round++) {
        open(name, level)
        const n = rows().length
        expect(n).toBeGreaterThanOrEqual(min)
        expect(n).toBeLessThanOrEqual(max)
        const texts = rows().map(r => r.querySelector('.story-s')!.textContent)
        expect(new Set(texts).size, 'без повторов').toBe(n)
        tiles()[0]!.click()
        for (const g of document.querySelectorAll<HTMLButtonElement>('.story .gap')) g.click()
        document.querySelector<HTMLButtonElement>('#schk')!.click()
        const right = needs()
        expect(right.length).toBeGreaterThanOrEqual(n)
        for (const w of right) expect(marks, 'нужное «' + w + '» входит в набор «' + name + '»').toContain(w)
      }
    })
  }

  it('«и»: если везде поставить 하고, все ответы верны (вместо 와 / 과 по 받침 принимается 하고), бонус +5', () => {
    for (let round = 0; round < 4; round++) {
      open('하고 / 와 / 과', 'Длинный')
      const t = tiles().find(x => tileText(x) === '하고')!
      t.click()
      for (const g of document.querySelectorAll<HTMLButtonElement>('.story .gap')) g.click()
      document.querySelector<HTMLButtonElement>('#schk')!.click()
      expect(records.every(r => r.ok), 'все ответы верны').toBe(true)
      expect(document.querySelector('#fb .fbh')!.textContent).toContain('бонус +5')
    }
  })

  it('открытие по ссылке: правило берётся из адреса (?fam=)', () => {
    dispose?.()
    records.length = 0
    localStorage.clear()
    document.body.innerHTML = `<div id="root">${markup}</div>`
    dispose = initGame({ record: () => ({}), importXp: () => {}, state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }), cats: () => null, mode: () => 'ptext', fam: () => 'object', saveCats: () => {}, grammar: () => {} })
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    expect(fam('을 / 를').classList.contains('on')).toBe(true)
  })
})

describe('«Собери предложение»: рассказ из учебника', () => {
  const chip = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent?.includes(text))!
  const labelText = () => (document.querySelector('#card .label')?.textContent ?? '').trim()
  const buildTiles = () => [...document.querySelectorAll<HTMLButtonElement>('#tiles .tile')]
  /** Слово плитки «Собери предложение»: первый текст кнопки (дальше номер клавиши и перевод). */
  const tileWord = (b: Element) => (b.firstChild?.textContent ?? '').trim()
  const open = (level: string) => { start('build'); document.querySelector<HTMLButtonElement>('#helpOk')?.click(); chip(level).click() }

  /** Собирает текущее предложение рассказа правильно (слова берёт из самого рассказа) и возвращает номер предложения и их число. */
  function solve() {
    const m = labelText().match(/Рассказ «([^»]+)»: предложение (\d+) из (\d+)/)
    expect(m, 'подпись «Рассказ …: предложение N из M»: ' + labelText()).toBeTruthy()
    const st = STORIES.find(x => x.title === m![1])!
    const i = Number(m![2]) - 1, n = Number(m![3])
    expect(st.sents.length).toBe(n)
    const words = st.sents[i]!.ko.replace(/[.?!]$/, '').split(' ')
    const used = new Set<string>()
    for (const w of words) {
      const b = buildTiles().find(t => !used.has(t.dataset.i!) && tileWord(t) === w)
      expect(b, 'плитка «' + w + '» есть').toBeTruthy()
      used.add(b!.dataset.i!)
      b!.click()
    }
    document.querySelector<HTMLButtonElement>('#chk')!.click()
    expect(document.querySelector('#fb .fbh')!.textContent, 'предложение собрано верно').toMatch(/Верно/)
    expect(buildTiles().length, 'лишние плитки есть').toBeGreaterThan(words.length)
    return { i, n, title: st.title }
  }

  for (const [level, min, max] of [['Рассказ', 2, 4], ['Длинный', 5, 10]] as const) {
    it(`«build», «${level}»: предложения одного рассказа идут подряд по порядку (${min}–${max}), после последнего начинается новый рассказ`, () => {
      open(level)
      let first = solve()
      expect(first.i).toBe(0)
      expect(first.n).toBeGreaterThanOrEqual(min)
      expect(first.n).toBeLessThanOrEqual(max)
      for (let k = 1; k < first.n; k++) {
        ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
        const cur = solve()
        expect(cur.title, 'тот же рассказ').toBe(first.title)
        expect(cur.i, 'следующее по порядку').toBe(k)
      }
      ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
      first = solve()
      expect(first.i, 'новый рассказ с начала').toBe(0)
      expect(records.every(r => r.ok)).toBe(true)
    })
  }

  it('простой уровень остаётся прежним заданием, при смене уровня рассказ начинается заново', () => {
    start('build')
    document.querySelector<HTMLButtonElement>('#helpOk')?.click()
    expect(chip('Простой').classList.contains('on')).toBe(true)
    expect(labelText()).not.toMatch(/Рассказ «/)
    chip('Рассказ').click()
    expect(labelText()).toMatch(/предложение 1 из/)
    chip('Длинный').click()
    expect(labelText()).toMatch(/предложение 1 из/)
  })
})
