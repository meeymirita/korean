import { CATN, D, type Word } from '@/data/korean/words'
import { intervalDays } from '@/data/review'
import { KNOWN_STREAK, type ProgressData, type WordStat } from '@/stores/progress'

const DAY = 86_400_000

export type Stage = 'seed' | 'sprout' | 'bud' | 'bloom' | 'thirsty' | 'wilted'

export interface Plant {
  word: Word
  stat: WordStat
  stage: Stage
  /** поворот цвета цветка в градусах */
  flower: number
  /** слово отвечали за последние сутки — «полито» */
  watered: boolean
}

/** Поворот цвета цветка по теме слов (сакура-иконка перекрашивается, у каждой из 11 тем свой оттенок). */
const FLOWER_HUES = [0, 40, 95, 150, 195, 240, 285, 320, 20, 130, 215]
const catIds = Object.keys(CATN)

/** Цветок слова: у каждой темы словаря свой, у слов без темы — по номеру. */
export function flowerOf(w: Word): number {
  const c = catIds.indexOf(w.c[0] ?? '')
  return FLOWER_HUES[c >= 0 ? c : w.n % FLOWER_HUES.length]!
}

export function stageOf(stat: WordStat, now = Date.now()): Stage {
  if (stat.streak >= KNOWN_STREAK) {
    const wait = intervalDays(stat.streak) * DAY
    const age = now - stat.last
    if (age >= wait * 3) return 'wilted'
    if (age >= wait) return 'thirsty'
    return 'bloom'
  }
  return stat.streak >= 3 ? 'bud' : stat.streak >= 1 ? 'sprout' : 'seed'
}

/** Все посаженные слова (те, на которые хоть раз отвечали). */
export function plants(p: ProgressData, now = Date.now()): Plant[] {
  const out: Plant[] = []
  for (const word of D) {
    const stat = p.words[word.k]
    if (!stat || stat.ok + stat.bad === 0) continue
    out.push({ word, stat, stage: stageOf(stat, now), flower: flowerOf(word), watered: now - stat.last < DAY })
  }
  return out
}

export const STAGE_NAME: Record<Stage, string> = {
  seed: 'семечко',
  sprout: 'росток',
  bud: 'бутон',
  bloom: 'цветёт',
  thirsty: 'хочет пить',
  wilted: 'завяло',
}

/* ---------- коллекция ---------- */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legend'

export const RARITY: { id: Rarity; name: string; from: number; hint: string }[] = [
  { id: 'common', name: 'Обычная', from: 0, hint: 'без ошибок или почти' },
  { id: 'uncommon', name: 'Необычная', from: 1, hint: '1–2 ошибки' },
  { id: 'rare', name: 'Редкая', from: 3, hint: '3–5 ошибок' },
  { id: 'legend', name: 'Легендарная', from: 6, hint: '6 и больше ошибок — слово, которое ты победил' },
]

export const rarityOf = (bad: number): Rarity => [...RARITY].reverse().find(r => bad >= r.from)!.id

export type CardState = 'locked' | 'learning' | 'open'

export interface Card {
  word: Word
  state: CardState
  stat?: WordStat
  rarity?: Rarity
}

export function cards(p: ProgressData): Card[] {
  return D.map(word => {
    const stat = p.words[word.k]
    if (!stat || stat.ok + stat.bad === 0) return { word, state: 'locked' }
    if (stat.streak >= KNOWN_STREAK || stat.kd) return { word, state: 'open', stat, rarity: rarityOf(stat.bad) }
    return { word, state: 'learning', stat }
  })
}
