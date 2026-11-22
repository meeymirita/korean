import { describe, expect, it } from 'vitest'
import { boot, closeHelp, records } from './game-helpers'

// «Собери число»: число, дата или цена крупно; ответ собирается слогами из плиток (нажатием), лишние слоги не нужны.
function start(asm: string) {
  boot({ mode: () => 'assemble', probe: true }, false, { asm })
  closeHelp()
}
const $ = (s: string) => document.querySelector(s) as HTMLElement
const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#tiles .tile')]
const probe = () => (window as unknown as { __gameProbe: { question: () => { right: string; asm: { kind: string; big: string; small: string }; hr: string } } }).__gameProbe.question()
/** Слово плитки без цифры-подсказки и подписи. */
const word = (b: HTMLElement) => b.firstChild!.textContent!

const SINO = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
/** Независимая запись китайского числа до 99 999 для сверки генератора. */
function sino(n: number): string {
  const part = (x: number) => {
    let o = ''
    const d = [Math.floor(x / 1000), Math.floor((x % 1000) / 100), Math.floor((x % 100) / 10), x % 10]
    if (d[0]) o += (d[0] > 1 ? SINO[d[0]] : '') + '천'
    if (d[1]) o += (d[1] > 1 ? SINO[d[1]] : '') + '백'
    if (d[2]) o += (d[2] > 1 ? SINO[d[2]] : '') + '십'
    if (d[3]) o += SINO[d[3]]
    return o
  }
  const man = Math.floor(n / 10000)
  return (man ? (man > 1 ? part(man) : '') + '만' : '') + part(n % 10000)
}
const MONTH_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

describe('Собери число', () => {
  for (const kind of ['num', 'date', 'price']) {
    it(`${kind}: чтение верное, верная сборка засчитывается, ошибка нет`, () => {
      start(kind)
      for (let i = 0; i < 24; i++) {
        const q = probe()
        expect(q.asm.kind).toBe(kind)
        expect($('.asm-big .asm-num').textContent).toBe(q.asm.big)
        expect(document.querySelectorAll('.levels .chip').length).toBe(4)
        // чтение сверено независимо от генератора
        const read = q.right.split(' ').join('')
        if (kind === 'num') expect(read).toBe(sino(Number(q.asm.big.replace(/ /g, ''))))
        if (kind === 'price') expect(read).toBe(sino(Number(q.asm.big.replace(/[,원]/g, ''))) + '원')
        if (kind === 'date') {
          const m = MONTH_RU.indexOf(q.asm.small) + 1
          const [mon, day] = read.split('월')
          expect(mon).toBe(m === 6 ? '유' : m === 10 ? '시' : sino(m))
          expect(day).toBe(sino(Number(q.asm.big)) + '일')
        }
        expect(tiles().length).toBeGreaterThan(q.right.split(' ').length - 1)
        const before = records.length
        if (i % 4 === 3) {
          tiles()[0]!.click()
          $('#chk').click()
          expect(records.at(-1)!.ok).toBe(false)
        } else {
          for (const w of q.right.split(' ')) {
            const t = tiles().find(b => word(b) === w && !b.classList.contains('used'))
            expect(t, `плитка «${w}»`).toBeTruthy()
            t!.click()
          }
          $('#chk').click()
          expect(records.at(-1)!.ok).toBe(true)
        }
        expect(records.length).toBe(before + 1)
        ;($('#nextBtn') as HTMLButtonElement).click()
      }
    })
  }

  it('«июнь» и «октябрь» читаются 유월 и 시월', () => {
    start('date')
    const seen = new Set<string>()
    for (let i = 0; i < 400 && seen.size < 2; i++) {
      const q = probe()
      if (q.asm.small === 'июня') { expect(q.right.startsWith('유 월')).toBe(true); seen.add('6') }
      if (q.asm.small === 'октября') { expect(q.right.startsWith('시 월')).toBe(true); seen.add('10') }
      tiles()[0]!.click()
      $('#chk').click()
      ;($('#nextBtn') as HTMLButtonElement).click()
    }
    expect(seen.size).toBe(2)
  })

  it('чип переключает вид, выбор запоминается в сохранении', () => {
    start('mix')
    ;[...document.querySelectorAll<HTMLButtonElement>('.levels .chip')].find(b => b.textContent === 'Даты')!.click()
    expect($('.asm-big').classList.contains('asm-date')).toBe(true)
    expect(JSON.parse(localStorage.getItem('hleb_game_v1')!).asm).toBe('date')
  })
})
