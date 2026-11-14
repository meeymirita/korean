// Общие помощники игровых тестов: запуск игры на разметке страницы, варианты ответа, прохождение вопросов.
// Игровые проверки разнесены по файлам (game-*.spec.ts): каждый вопрос оставляет в happy-dom около 2,5 МБ мусора, который сборщик не успевает убрать,
// поэтому один файл с тысячей вопросов занимал больше 3 ГБ и падал на CI (SIGABRT). Каждый файл идёт в своём процессе: держи в файле не больше ~500 вопросов.
import { afterEach, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import GameShell from '@/components/game/GameShell.vue'
import { initGame } from '@/game/engine'
import { createGameView } from '@/game/view'
import { GAME_GROUPS, TOOL_IDS } from '@/data/games'

/** Режимы движка: всё из каталога, кроме тренажёров со своим экраном (`TOOL_IDS`: новый тренажёр попадает сюда сам) и режимов, которые проверяются отдельно. */
const NOT_ENGINE: string[] = [...TOOL_IDS, 'typewords', 'ptext', 'fut', 'only']
export const ENGINE_MODES = GAME_GROUPS.flatMap(g => g.games.map(x => x.id)).filter(id => !NOT_ENGINE.includes(id))
export const NEW_MODES = ['days', 'when', 'too', 'num', 'price', 'count', 'neg', 'place', 'dem', 'polite']

type GameHooksItems = NonNullable<Parameters<typeof initGame>[0]['items']>
let dispose: (() => void) | undefined
let shell: VueWrapper | undefined
export const records: { word: string | null; ok: boolean; mode?: string; xp?: number }[] = []
export const grammarOpened: string[] = []

type GameHooks = Parameters<typeof initGame>[0]

/** Запускает игру на оболочке `GameShell`. `over` подменяет или дополняет хуки страницы, `save` кладёт сохранение игры до запуска, `keepSave: true` оставляет сохранение, что уже лежит. */
export function boot(over: Partial<GameHooks> = {}, keepSave = false, save?: object) {
  dispose?.() // прежний экземпляр игры снимает свои обработчики клавиш
  shell?.unmount()
  records.length = 0
  grammarOpened.length = 0
  if (!keepSave) localStorage.clear()
  if (save) localStorage.setItem('hleb_game_v1', JSON.stringify(save))
  document.body.innerHTML = '<div id="root"></div>'
  const view = createGameView()
  shell = mount(GameShell, { props: { view }, attachTo: document.getElementById('root')! })
  dispose = initGame({
    record: (o: { word: string | null; ok: boolean; mode?: string; xp?: number }) => {
      records.push(o)
      return {}
    },
    importXp: () => {},
    state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }),
    cats: () => null,
    saveCats: () => {},
    grammar: (id: string) => grammarOpened.push(id),
    ...over,
  }, view)
}

/** Запускает игру в режиме `mode`. `keepSave: true` оставляет сохранение в localStorage (проверка, что настройки подхватываются). */
export function start(mode: string, keepSave = false, items?: GameHooksItems) {
  boot({ mode: () => mode, ...(items ? { items } : {}) }, keepSave)
}
/** Закрывает окно «Как играть», которое игра открывает при первом запуске. */
export const closeHelp = () => document.querySelector<HTMLButtonElement>('#helpOk')?.click()
afterEach(() => {
  dispose?.()
  dispose = undefined
  shell?.unmount()
  shell = undefined
  document.body.innerHTML = ''
})

export const opts = () => [...document.querySelectorAll<HTMLButtonElement>('#opts .opt')]
/** Текст варианта без номера клавиши и подписи чтения */
export const optText = (b: Element) => (b.querySelector('.t')?.textContent ?? '').trim()

/** Вопрос без вариантов: «собери предложение» (плитки) или «напиши» (поле): отвечаем «не знаю» и идём дальше. */
export function skipOpen(mode: string, i: number) {
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
export function play(mode: string, n: number) {
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

/** Останавливает текущую игру (снимает её обработчики клавиш). */
export function stop() {
  dispose?.()
  dispose = undefined
}

/** Нажимает первый вариант, возвращает текст верного, следит, чтобы после «Дальше» шла следующая задача. */
export function answerAndNext(): string {
  opts()[0]!.click()
  const right = optText(document.querySelector('#opts .opt.ok')!)
  ;(document.querySelector('#nextBtn') as HTMLButtonElement).click()
  return right
}
export const hasBatchim = (ch: string) => (ch.charCodeAt(0) - 0xac00) % 28 > 0

/** Отвечает на n вопросов режима и считает, в скольких после ответа есть разбор «Как собрано». */
export function coverage(mode: string, n = 30) {
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
export const WITH_BREAKDOWN = ['word', 'rev', 'neg', 'pair', 'part', 'err', 'place', 'form', 'type', 'qw', 'dem', 'build', 'spot', 'ord', 'dlg', 'count', 'days', 'when', 'too', 'price']
