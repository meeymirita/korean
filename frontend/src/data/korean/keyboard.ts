import { isTypable, jamoOf } from '@/lib/hangulKeys'
import { shuffle } from './tasks'
import { D } from './words'

export type KbLevel = 'letters' | 'syllables' | 'words' | 'sentences'

export const KB_LEVELS: { id: KbLevel; label: string; hint: string; count: number }[] = [
  { id: 'letters', label: 'Буквы', hint: 'По одной букве', count: 14 },
  { id: 'syllables', label: 'Слоги', hint: 'Согласная + гласная (+ 받침)', count: 12 },
  { id: 'words', label: 'Слова', hint: 'Слова из словаря', count: 8 },
  { id: 'sentences', label: 'Предложения', hint: 'Примеры из словаря, со знаками', count: 4 },
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
const WORDS = [...new Set(D.map(w => w.k))].filter(k => /^[가-힣]{1,4}$/.test(k) && isTypable(k))
const SENTENCES = [...new Set(D.map(w => w.s))].filter(s => s.length >= 6 && s.length <= 26 && isTypable(s))

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
      return shuffle(WORDS).slice(0, n)
    default:
      return shuffle(SENTENCES).slice(0, n)
  }
}

/** Сколько нажатий в тексте (для скорости). */
export const keyCount = (items: string[]) => items.reduce((n, t) => n + [...t].reduce((m, c) => m + jamoOf(c).length, 0), 0)
