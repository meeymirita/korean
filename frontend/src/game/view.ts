// Что движок игры «Хлебушек» (`engine.ts`) показывает оболочке `components/game/GameShell.vue`: счёт, списки, блиц, окна, настройки.
// Движок только пишет сюда, оболочка только читает и вызывает `actions`. Сами карточки вопросов пока рисует движок.
import { reactive } from 'vue'
import type { HistItem, Miss } from './types'

export interface GameStatsView {
  ok: number; bad: number; acc: string; streak: number; best: number
  loaves: number; loafTxt: string; loafPct: number
  lvlN: number; lvlName: string; xpTxt: string; xpPct: number
  goalN: number; goalMax: number; goalTxt: string; goalPct: number
  allTime: string
}
export interface GameCatView { id: string; name: string; count: number; on: boolean }
export type GameTab = 'hist' | 'weak' | 'words' | 'records'

/** Действия, которые оболочка просит у движка. Движок подставляет их при запуске. */
export interface GameActions {
  refresh: () => void
  toggleBlitz: () => void
  toggleSurv: () => void
  openHelp: () => void
  closeHelp: () => void
  overAgain: () => void
  overClose: () => void
  resetStats: () => void
  setTab: (t: GameTab) => void
  toggleCat: (id: string, on: boolean) => void
  setReading: (on: boolean) => void
  setTense: (v: string) => void
  setFut: (v: string) => void
  setBlitzSecs: (n: number) => void
  setSurvLives: (n: number) => void
}

export interface GameView {
  stats: GameStatsView
  tab: GameTab
  /** поиск во вкладке «Слова» */
  wq: string
  hist: HistItem[]
  weak: Miss[]
  byMode: Record<string, { ok: number; bad: number; best: number }>
  cats: GameCatView[]
  reading: boolean
  tense: string
  fut: string
  blitzSecs: number
  survLives: number
  blitzOn: boolean
  survOn: boolean
  timer: { on: boolean; pct: number }
  lives: { on: boolean; text: string }
  over: { on: boolean; title: string; big: string; text: string }
  help: boolean
  toast: { on: boolean; text: string }
  actions: GameActions
}

const noop = () => {}

export function createGameView(): GameView {
  return reactive<GameView>({
    stats: { ok: 0, bad: 0, acc: '–', streak: 0, best: 0, loaves: 0, loafTxt: '0 / 10', loafPct: 0, lvlN: 1, lvlName: '', xpTxt: '', xpPct: 0, goalN: 0, goalMax: 20, goalTxt: '', goalPct: 0, allTime: '' },
    tab: 'hist',
    wq: '',
    hist: [],
    weak: [],
    byMode: {},
    cats: [],
    reading: false,
    tense: 'both',
    fut: 'on',
    blitzSecs: 60,
    survLives: 3,
    blitzOn: false,
    survOn: false,
    timer: { on: false, pct: 100 },
    lives: { on: false, text: '' },
    over: { on: false, title: '', big: '0', text: '' },
    help: false,
    toast: { on: false, text: '' },
    actions: {
      refresh: noop, toggleBlitz: noop, toggleSurv: noop, openHelp: noop, closeHelp: noop, overAgain: noop, overClose: noop, resetStats: noop,
      setTab: noop, toggleCat: noop, setReading: noop, setTense: noop, setFut: noop, setBlitzSecs: noop, setSurvLives: noop,
    },
  }) as GameView
}
