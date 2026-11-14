import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { boot, closeHelp, records } from './game-helpers'

// Блиц на 30 / 60 / 120 секунд и выживание на 3 / 5 жизней или без ограничения (отдельный файл: общий `game.spec.ts` уже занимает много памяти).
function start(mode: string, save?: object) {
  boot({ mode: () => mode }, false, save)
  closeHelp()
}
afterEach(() => vi.useRealTimers())

const $ = (s: string) => document.querySelector(s) as HTMLElement
const answer = () => { ($('#opts .opt') as HTMLButtonElement)?.click(); ($('#nextBtn') as HTMLButtonElement)?.click() }
const overOn = () => $('#over').classList.contains('on')
/** Оболочка игры обновляется на следующем такте Vue: перед чтением из неё ждём его. */
const flush = () => nextTick()

describe('блиц: 30, 60 и 120 секунд', () => {
  for (const secs of [30, 60, 120]) {
    it(`${secs} секунд: кнопка называется верно, время выходит ровно через ${secs} с, рекорд хранится отдельно`, async () => {
      vi.useFakeTimers()
      start('word', { blitzSecs: secs })
      await flush()
      expect($('#blitzBtn').textContent).toContain(`Блиц ${secs} секунд`)
      ;($('#blitzSecs') as HTMLSelectElement).value
      expect(($('#blitzSecs') as HTMLSelectElement).value).toBe(String(secs))
      $('#blitzBtn').click()
      for (let i = 0; i < 5; i++) answer()
      for (let i = 0; i < secs - 1; i++) vi.advanceTimersByTime(1000)
      await flush()
      expect(overOn(), 'за секунду до конца ещё идёт').toBe(false)
      vi.advanceTimersByTime(1000)
      await flush()
      expect(overOn(), 'время вышло').toBe(true)
      expect($('#overTxt').textContent).toContain(`за ${secs} секунд`)
      const saved = JSON.parse(localStorage.getItem('hleb_game_v1')!)
      if (secs === 60) expect(saved.all.bestBlitz).toBeGreaterThanOrEqual(0)
      else expect(saved.all.bestBlitzBy ?? {}).toBeTypeOf('object')
    })
  }

  it('выбор в настройках запоминается и меняет подпись кнопки', async () => {
    start('word')
    await flush()
    expect($('#blitzBtn').textContent).toContain('Блиц 60 секунд')
    const sel = $('#blitzSecs') as HTMLSelectElement
    sel.value = '120'
    sel.dispatchEvent(new Event('change'))
    await flush()
    expect($('#blitzBtn').textContent).toContain('Блиц 120 секунд')
    expect(JSON.parse(localStorage.getItem('hleb_game_v1')!).blitzSecs).toBe(120)
  })

  it('чужое значение в сохранении игнорируется', async () => {
    start('word', { blitzSecs: 7, survLives: 9 })
    await flush()
    expect($('#blitzBtn').textContent).toContain('Блиц 60 секунд')
    expect(($('#survLives') as HTMLSelectElement).value).toBe('3')
  })
})

describe('выживание: 3, 5 жизней и без ограничения', () => {
  for (const lives of [3, 5]) {
    it(`${lives} жизней: игра кончается ровно на ${lives}-й ошибке`, async () => {
      vi.useFakeTimers()
      start('word', { survLives: lives })
      $('#survBtn').click()
      await flush()
      expect($('#lives').textContent!.match(/❤️/g)!.length).toBe(lives)
      for (let i = 0; i < 400 && !overOn(); i++) {
        answer()
        vi.advanceTimersByTime(1400)
        await flush()
      }
      expect(overOn(), 'игра закончилась').toBe(true)
      expect(records.filter(r => !r.ok).length, 'ровно столько ошибок, сколько жизней').toBe(lives)
      expect($('#overT').textContent).toBe('Жизни закончились')
    })
  }

  it('без ограничения: ошибки жизни не отнимают, остановить можно кнопкой', async () => {
    vi.useFakeTimers()
    start('word', { survLives: 0 })
    $('#survBtn').click()
    for (let i = 0; i < 30; i++) { answer(); vi.advanceTimersByTime(1400) }
    await flush()
    expect(records.filter(r => !r.ok).length, 'ошибки были').toBeGreaterThan(3)
    expect(overOn(), 'игра идёт').toBe(false)
    expect($('#lives').textContent).toContain('♾️')
    $('#survBtn').click()
    await flush()
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
