import { shuffle } from '@/game/util'

/**
 * Тренажёр «Три формы вежливости» на эмоциях Sonya (страница «Разбор» влога `sony-emotions`): одно и то же чувство говорят тремя способами.
 * Формы взяты из самого влога (`vlog-sony-emotions.ts`). Только справка и тренировка: ничего не записывается и не засчитывается.
 * `합니다체` и `반말` ещё не пройдены, это исключение для влогов (решение владельца 2026-11-22).
 */
export type Style = 'casual' | 'polite' | 'formal'
export const STYLES: { id: Style; ko: string; ru: string; who: string }[] = [
  { id: 'casual', ko: '반말', ru: 'неформально', who: 'другу, близкому человеку, младшему' },
  { id: 'polite', ko: '해요체', ru: 'вежливо', who: 'учителю, знакомому, продавцу' },
  { id: 'formal', ko: '합니다체', ru: 'официально', who: 'на собрании, в новостях, начальству' },
]
export const STYLE_BY_ID = Object.fromEntries(STYLES.map(s => [s.id, s])) as Record<Style, (typeof STYLES)[number]>

export interface Emotion { ko: string; ru: string; casual: string; polite: string; formal: string }
export const EMOTIONS: Emotion[] = [
  { ko: '기쁘다', ru: 'радоваться', casual: '나는 기뻐', polite: '저는 기뻐요', formal: '저는 기쁩니다' },
  { ko: '슬프다', ru: 'грустить', casual: '나는 슬퍼', polite: '저는 슬퍼요', formal: '저는 슬픕니다' },
  { ko: '화가 나다', ru: 'злиться', casual: '나는 화가 나', polite: '저는 화가 나요', formal: '저는 화가 납니다' },
  { ko: '무섭다', ru: 'бояться', casual: '나는 무서워', polite: '저는 무서워요', formal: '저는 무섭습니다' },
  { ko: '신나다', ru: 'радоваться, быть в восторге', casual: '나는 신나', polite: '저는 신나요', formal: '저는 신납니다' },
]

/** Ситуации: с кем говоришь. У каждой формы несколько, чтобы не повторялись. */
export const SITUATIONS: Record<Style, string[]> = {
  casual: ['Ты говоришь с лучшим другом', 'Ты пишешь младшему брату', 'Ты говоришь с одногруппником, с которым давно дружишь'],
  polite: ['Ты говоришь с учителем на уроке', 'Ты говоришь с соседкой, которую знаешь не очень хорошо', 'Ты рассказываешь продавцу в магазине'],
  formal: ['Ты выступаешь на собрании', 'Ты говоришь с начальником на совещании', 'Ты читаешь заявление в новостях'],
}

export interface Option { key: string; label: string; sub?: string }
export interface PoliteTask {
  kind: 'who' | 'style'
  /** вопрос по-русски */
  prompt: string
  /** корейская фраза, о которой вопрос (у задания «какая форма») */
  ko?: string
  options: Option[]
  correct: string
  /** объяснение после ответа */
  why: string
}

/** Задание «Какую форму сказать»: ситуация, нужно выбрать из трёх форм одного чувства. */
export function whoTask(e: Emotion, style: Style): PoliteTask {
  const sit = SITUATIONS[style][Math.floor(Math.random() * SITUATIONS[style].length)]!
  return {
    kind: 'who',
    prompt: `${sit}. Как сказать «${e.ru}»?`,
    options: shuffle(STYLES).map(s => ({ key: s.id, label: e[s.id] })),
    correct: style,
    why: `${STYLE_BY_ID[style].ko} (${STYLE_BY_ID[style].ru}) говорят ${STYLE_BY_ID[style].who}: ${e[style]}.`,
  }
}

/** Задание «Что это за форма»: корейская фраза, нужно назвать стиль. */
export function styleTask(e: Emotion, style: Style): PoliteTask {
  return {
    kind: 'style',
    prompt: 'Что это за форма?',
    ko: e[style],
    options: shuffle(STYLES).map(s => ({ key: s.id, label: s.ko, sub: s.ru })),
    correct: style,
    why: `${e[style]}: ${STYLE_BY_ID[style].ko} (${STYLE_BY_ID[style].ru}), так говорят ${STYLE_BY_ID[style].who}.`,
  }
}

/** Раунд из `n` заданий: все чувства и все формы вперемешку, задания двух видов по очереди. */
export function politeRound(n = 10): PoliteTask[] {
  const pairs = shuffle(EMOTIONS.flatMap(e => STYLES.map(s => ({ e, s: s.id }))))
  return pairs.slice(0, n).map((p, i) => (i % 2 ? styleTask(p.e, p.s) : whoTask(p.e, p.s)))
}
