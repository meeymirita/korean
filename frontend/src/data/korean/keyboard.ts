import { isTypable, jamoOf } from '@/lib/hangulKeys'
import type { ProgressData } from '@/stores/progress'
import { mistakeWords } from '../mistakes'
import { dueWords } from '../review'
import { shuffle, short } from './tasks'
import { STUDY } from './study'
import { TRANSLATIONS } from './translations'
import { D, parseQuery, score, type Word } from './words'

export type KbLevel = 'letters' | 'syllables' | 'words' | 'sentences' | 'dictation'

export const KB_LEVELS: { id: KbLevel; label: string; hint: string; count: number }[] = [
  { id: 'letters', label: 'Буквы', hint: 'По одной букве', count: 14 },
  { id: 'syllables', label: 'Слоги', hint: 'Согласная + гласная (+ 받침)', count: 12 },
  { id: 'words', label: 'Слова', hint: 'Слова из словаря', count: 8 },
  { id: 'sentences', label: 'Предложения', hint: 'Примеры из словаря, со знаками', count: 4 },
  { id: 'dictation', label: 'Диктовка', hint: 'Видишь перевод и печатаешь слово по-корейски: слово и подсветка клавиш скрыты', count: 6 },
]

const CONSONANTS = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅎㅋㅌㅊㅍ'.split('')
const VOWELS = 'ㅏㅓㅗㅜㅡㅣㅐㅔㅑㅕㅛㅠ'.split('')
const SYL_INIT = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅎ'
const SYL_MED = 'ㅏㅓㅗㅜㅡㅣ'
const SYL_FIN = ['', '', 'ㄴ', 'ㅁ', 'ㄹ', 'ㅇ']
/** Слог из индексов: начальная, гласная, конечная (в юникоде слог = 0xAC00 + (и * 21 + г) * 28 + к). */
const FIN_IDX: Record<string, number> = { '': 0, ㄴ: 4, ㄹ: 8, ㅁ: 16, ㅇ: 21 }
const INIT_IDX: Record<string, number> = { ㄱ: 0, ㄴ: 2, ㄷ: 3, ㄹ: 5, ㅁ: 6, ㅂ: 7, ㅅ: 9, ㅇ: 11, ㅈ: 12, ㅎ: 18 }
const MED_IDX: Record<string, number> = { ㅏ: 0, ㅓ: 4, ㅗ: 8, ㅜ: 13, ㅡ: 18, ㅣ: 20 }
const syl = (i: string, m: string, f: string) => String.fromCharCode(0xac00 + (INIT_IDX[i]! * 21 + MED_IDX[m]!) * 28 + FIN_IDX[f]!)

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!

/** Только слова и предложения, которые можно набрать этими клавишами. */
const WORDS = [...new Set(STUDY.map(w => w.k))].filter(k => /^[가-힣]{1,4}$/.test(k) && isTypable(k))
const SENTENCES = [...new Set(STUDY.map(w => w.s))].filter(s => s.length >= 6 && s.length <= 26 && isTypable(s))

/** Задания уровня: список строк, которые нужно набрать. */
export function kbItems(level: KbLevel): string[] {
  const n = KB_LEVELS.find(l => l.id === level)!.count
  switch (level) {
    case 'letters':
      return shuffle([...CONSONANTS, ...VOWELS]).slice(0, n)
    case 'syllables': {
      const out = new Set<string>()
      while (out.size < n) out.add(syl(pick([...SYL_INIT]), pick([...SYL_MED]), pick(SYL_FIN)))
      return [...out]
    }
    case 'words':
    case 'dictation':
      return shuffle(WORDS).slice(0, n)
    default:
      return shuffle(SENTENCES).slice(0, n)
  }
}

/** Сколько нажатий в тексте (для скорости). */
export const keyCount = (items: string[]) => items.reduce((n, t) => n + [...t].reduce((m, c) => m + jamoOf(c).length, 0), 0)

/* ---------- свои слова и предложения ---------- */

/** Пятая вкладка тренажёра: набор собирает сам владелец (из словаря, из ошибок, из «Повторить»). */
export const KB_CUSTOM = { id: 'custom', label: 'Свои слова и предложения', hint: 'Выбери сам, что печатать' } as const

export type CustomKind = 'words' | 'sentences'
export type CustomSource = 'dict' | 'mistakes' | 'due'

export const CUSTOM_KINDS: { id: CustomKind; label: string }[] = [
  { id: 'words', label: 'Слова' },
  { id: 'sentences', label: 'Предложения' },
]
export const CUSTOM_SOURCES: { id: CustomSource; label: string }[] = [
  { id: 'dict', label: 'Весь словарь' },
  { id: 'mistakes', label: 'Мои ошибки' },
  { id: 'due', label: 'Повторить' },
]

export interface CustomItem {
  /** что печатать: слово или предложение */
  text: string
  /** перевод (для предложения его перевод из `translations.ts`, иначе перевод слова) */
  ru: string
  /** чтение слова: по нему тоже работает поиск */
  r: string
  word: Word
}

const itemOf = (w: Word, kind: CustomKind): CustomItem => {
  const text = kind === 'words' ? w.k : w.s
  return { text, ru: kind === 'words' ? short(w.t) : (TRANSLATIONS[w.s] ?? short(w.t)), r: w.r, word: w }
}

/** Слова, из которых выбирают: весь словарь, слова с ошибками или слова «Повторить» (те же, что в кабинете). */
export function customWords(source: CustomSource, p: ProgressData, now = Date.now()): Word[] {
  if (source === 'mistakes') return mistakeWords(p).map(m => m.word)
  if (source === 'due') return dueWords(p, now).map(d => d.word)
  return STUDY
}

/** Что можно предложить на выбор: только то, что набирается этими клавишами; без повторов. */
export function customPool(kind: CustomKind, source: CustomSource, p: ProgressData, now = Date.now()): CustomItem[] {
  const seen = new Set<string>()
  const out: CustomItem[] = []
  for (const w of customWords(source, p, now)) {
    const it = itemOf(w, kind)
    if (!it.text || it.text.length > 80 || seen.has(it.text) || !isTypable(it.text)) continue
    seen.add(it.text)
    out.push(it)
  }
  return out
}

/** Поиск по корейскому, чтению, переводу и формам («ем» найдёт «есть»); пустой запрос отдаёт начало списка. */
export function searchCustom(pool: CustomItem[], q: string, limit = 30): CustomItem[] {
  const qs = parseQuery(q)
  if (!qs.length) return pool.slice(0, limit)
  return pool.filter(it => score(it.word, qs) > 0).slice(0, limit)
}

/** Случайный элемент, которого ещё нет среди выбранных; null, если выбрано всё. */
export function randomCustom(pool: CustomItem[], taken: string[]): CustomItem | null {
  const free = pool.filter(it => !taken.includes(it.text))
  return free.length ? free[Math.floor(Math.random() * free.length)]! : null
}

/** Подпись выбранного по тексту: слово или предложение из словаря; null, если такого в словаре нет (устаревший выбор). */
export function customLabel(text: string): CustomItem | null {
  for (const w of D) {
    if (w.k === text) return itemOf(w, 'words')
    if (w.s === text) return itemOf(w, 'sentences')
  }
  return null
}
