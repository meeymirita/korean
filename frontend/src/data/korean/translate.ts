import { TRANSLATIONS } from './translations'
import { shuffle, type Task } from './tasks'
import { STORIES } from '@/game/stories'

export type TranslateDir = 'ko-ru' | 'ru-ko' | 'mix'
export const TRANSLATE_DIRS: { id: TranslateDir; label: string }[] = [
  { id: 'ko-ru', label: 'Корейский → русский' },
  { id: 'ru-ko', label: 'Русский → корейский' },
  { id: 'mix', label: 'Вперемешку' },
]

/** Уровни по длине предложения (считаются слоги хангыля): до 6 (177 предложений), 7–8 (180), 9 и больше (197). */
export type TranslateLevel = 'any' | 'easy' | 'medium' | 'hard' | 'text'
export const TRANSLATE_LEVELS: { id: TranslateLevel; label: string; hint: string; min: number; max: number }[] = [
  { id: 'any', label: 'Любой', hint: 'Предложения любой длины', min: 0, max: Infinity },
  { id: 'easy', label: 'Простой', hint: 'Короткие: до 6 слогов', min: 0, max: 6 },
  { id: 'medium', label: 'Средний', hint: 'Средние: 7–8 слогов', min: 7, max: 8 },
  { id: 'hard', label: 'Сложный', hint: 'Длинные: от 9 слогов', min: 9, max: Infinity },
]
/** Уровень «Текст» (отдельно от уровней по длине): переводится целый короткий рассказ из учебника (2–7 предложений), варианты это другие рассказы. */
export const TEXT_LEVEL = { id: 'text' as const, label: 'Текст', hint: 'Короткий рассказ целиком: от 2 до 7 предложений' }
const syllablesIn = (ko: string) => ko.replace(/[^가-힣]/g, '').length
const inLevel = (ko: string, level: TranslateLevel) => {
  const l = TRANSLATE_LEVELS.find(x => x.id === level) ?? TRANSLATE_LEVELS[0]!
  const n = syllablesIn(ko)
  return n >= l.min && n <= l.max
}

const PAIRS = Object.entries(TRANSLATIONS).filter(([ko, ru]) => ko && ru)

/** Неверные варианты: предложения похожей длины (чтобы ответ не угадывался по размеру), без повторов и без самого ответа. */
function distractors(idx: number, side: 0 | 1, count = 3): string[] {
  const answer = PAIRS[idx]![side]
  const sample = shuffle(PAIRS.map((_, i) => i).filter(i => i !== idx)).slice(0, 40)
  const seen = new Set([answer])
  return sample
    .map(i => PAIRS[i]![side])
    .filter(s => !seen.has(s) && (seen.add(s), true))
    .sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length))
    .slice(0, count)
}

/** Набор «переведи предложение целиком» в одну или обе стороны, предложения выбранной длины. Номера заданий подряд. */
export function translateTasks(dir: TranslateDir = 'mix', n = 10, level: TranslateLevel = 'any'): Task[] {
  if (level === 'text') return textTasks(dir, n)
  const out: Task[] = []
  for (const idx of shuffle(PAIRS.map((_, i) => i).filter(i => inLevel(PAIRS[i]![0], level)))) {
    if (out.length >= n) break
    const toRu = dir === 'ko-ru' || (dir === 'mix' && Math.random() < 0.5)
    const [ko, ru] = PAIRS[idx]!
    const wrong = distractors(idx, toRu ? 1 : 0)
    if (wrong.length < 3) continue
    const answer = toRu ? ru : ko
    const other = (s: string) => PAIRS.find(p => p[toRu ? 1 : 0] === s)?.[toRu ? 0 : 1]
    const options = shuffle([answer, ...wrong])
    out.push({
      id: out.length,
      kind: toRu ? 'tr' : 'back',
      title: toRu ? 'Переведи на русский' : 'Переведи на корейский',
      prompt: toRu ? ko : ru,
      options,
      answer,
      sentence: ko,
      pairOf: Object.fromEntries(options.flatMap(o => { const v = other(o); return v ? [[o, v]] : [] })),
    })
  }
  return out
}

/** Рассказы из учебника целиком: подсказка не нужна, в разборе после ответа первое предложение рассказа. Неверные варианты: другие рассказы, по возможности такой же длины. */
function textTasks(dir: TranslateDir, n: number): Task[] {
  const joined = STORIES.map(st => ({ ko: st.sents.map(x => x.ko).join(' '), ru: st.sents.map(x => x.ru).join(' '), len: st.sents.length, first: st.sents[0]!.ko }))
  const out: Task[] = []
  for (const st of shuffle(joined)) {
    if (out.length >= n) break
    const toRu = dir === 'ko-ru' || (dir === 'mix' && Math.random() < 0.5)
    const side = toRu ? 'ru' : 'ko'
    const wrong = shuffle(joined.filter(o => o !== st && o[side] !== st[side]))
      .sort((a, b) => Math.abs(a.len - st.len) - Math.abs(b.len - st.len))
      .slice(0, 3)
    if (wrong.length < 3) continue
    const answer = st[side]
    const options = shuffle([answer, ...wrong.map(w => w[side])])
    const other = (text: string) => [st, ...wrong].find(x => x[side] === text)?.[toRu ? 'ko' : 'ru']
    out.push({
      id: out.length,
      kind: toRu ? 'tr' : 'back',
      title: toRu ? 'Переведи рассказ на русский' : 'Переведи рассказ на корейский',
      prompt: toRu ? st.ko : st.ru,
      options,
      answer,
      sentence: st.first,
      pairOf: Object.fromEntries(options.flatMap(o => { const v = other(o); return v ? [[o, v]] : [] })),
    })
  }
  return out
}
