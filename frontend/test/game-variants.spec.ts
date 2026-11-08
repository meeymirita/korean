import { afterEach, describe, expect, it, vi } from 'vitest'
import markupRaw from '@/game/markup.html?raw'
import { initGame } from '@/game/engine'
import { iconImg } from '@/game/icons'

// Блиц на 30 / 60 / 120 секунд и выживание на 3 / 5 жизней или без ограничения (отдельный файл: общий `game.spec.ts` уже занимает много памяти).
const markup = markupRaw.replace('CAT_SLEEP', '').replace(/ICON\((\w+)\)/g, (_, n: string) => iconImg(n))
let dispose: (() => void) | undefined
const records: { ok: boolean }[] = []

function start(mode: string, save?: object) {
  dispose?.()
  records.length = 0
  localStorage.clear()
  if (save) localStorage.setItem('hleb_game_v1', JSON.stringify(save))
  document.body.innerHTML = `<div id="root">${markup}</div>`
  dispose = initGame({
    record: (o: { ok: boolean }) => { records.push(o); return {} },
    importXp: () => {},
    state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }),
    cats: () => null,
    mode: () => mode,
    saveCats: () => {},
    grammar: () => {},
  })
  document.querySelector<HTMLButtonElement>('#helpOk')?.click()
}
afterEach(() => {
  vi.useRealTimers()
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
})

const $ = (s: string) => document.querySelector(s) as HTMLElement
const answer = () => { ($('#opts .opt') as HTMLButtonElement)?.click(); ($('#nextBtn') as HTMLButtonElement)?.click() }
const overOn = () => $('#over').classList.contains('on')

describe('блиц: 30, 60 и 120 секунд', () => {
  for (const secs of [30, 60, 120]) {
    it(`${secs} секунд: кнопка называется верно, время выходит ровно через ${secs} с, рекорд хранится отдельно`, () => {
      vi.useFakeTimers()
      start('word', { blitzSecs: secs })
      expect($('#blitzBtn').textContent).toContain(`Блиц ${secs} секунд`)
      ;($('#blitzSecs') as HTMLSelectElement).value
      expect(($('#blitzSecs') as HTMLSelectElement).value).toBe(String(secs))
      $('#blitzBtn').click()
      for (let i = 0; i < 5; i++) answer()
      for (let i = 0; i < secs - 1; i++) vi.advanceTimersByTime(1000)
      expect(overOn(), 'за секунду до конца ещё идёт').toBe(false)
      vi.advanceTimersByTime(1000)
      expect(overOn(), 'время вышло').toBe(true)
      expect($('#overTxt').textContent).toContain(`за ${secs} секунд`)
      const saved = JSON.parse(localStorage.getItem('hleb_game_v1')!)
      if (secs === 60) expect(saved.all.bestBlitz).toBeGreaterThanOrEqual(0)
      else expect(saved.all.bestBlitzBy ?? {}).toBeTypeOf('object')
    })
  }

  it('выбор в настройках запоминается и меняет подпись кнопки', () => {
    start('word')
    expect($('#blitzBtn').textContent).toContain('Блиц 60 секунд')
    const sel = $('#blitzSecs') as HTMLSelectElement
    sel.value = '120'
    sel.dispatchEvent(new Event('change'))
    expect($('#blitzBtn').textContent).toContain('Блиц 120 секунд')
    expect(JSON.parse(localStorage.getItem('hleb_game_v1')!).blitzSecs).toBe(120)
  })

  it('чужое значение в сохранении игнорируется', () => {
    start('word', { blitzSecs: 7, survLives: 9 })
    expect($('#blitzBtn').textContent).toContain('Блиц 60 секунд')
    expect(($('#survLives') as HTMLSelectElement).value).toBe('3')
  })
})

describe('выживание: 3, 5 жизней и без ограничения', () => {
  for (const lives of [3, 5]) {
    it(`${lives} жизней: игра кончается ровно на ${lives}-й ошибке`, () => {
      vi.useFakeTimers()
      start('word', { survLives: lives })
      $('#survBtn').click()
      expect($('#lives').textContent!.match(/❤️/g)!.length).toBe(lives)
      for (let i = 0; i < 400 && !overOn(); i++) {
        answer()
        vi.advanceTimersByTime(1400)
      }
      expect(overOn(), 'игра закончилась').toBe(true)
      expect(records.filter(r => !r.ok).length, 'ровно столько ошибок, сколько жизней').toBe(lives)
      expect($('#overT').textContent).toBe('Жизни закончились')
    })
  }

  it('без ограничения: ошибки жизни не отнимают, остановить можно кнопкой', () => {
    vi.useFakeTimers()
    start('word', { survLives: 0 })
    $('#survBtn').click()
    for (let i = 0; i < 30; i++) { answer(); vi.advanceTimersByTime(1400) }
    expect(records.filter(r => !r.ok).length, 'ошибки были').toBeGreaterThan(3)
    expect(overOn(), 'игра идёт').toBe(false)
    expect($('#lives').textContent).toContain('♾️')
    $('#survBtn').click()
    expect(overOn()).toBe(true)
    expect($('#overT').textContent).toBe('Выживание остановлено')
  })
})

describe('подсказка «?» в текстах', () => {
  it('у текста в подсказке есть строка про плитки и проверку в конце, у ввода про Enter', () => {
    start('place', { levels: { place: 'story' } })
    expect($('#card .mhelp').textContent).toMatch(/нажми плитку, потом пропуск/)
    start('type', { levels: { type: 'story' } })
    expect($('#card .mhelp').textContent).toMatch(/впиши форму в каждое поле/)
  })
})
