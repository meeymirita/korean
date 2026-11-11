import { TRANSLATIONS } from './translations'
import { D, type Word } from './words'

/**
 * «Дополнительные» слова: абстрактные существительные выше начального уровня (решение владельца, 2026-11-10: Gemini и Grok считают их выше A1).
 * Они остаются в словаре на странице «Слова» с пометкой «дополнительно», но не попадают в игры, тренажёры, «Сегодня» и экзамен.
 * Вернуть слово в задания: убрать его из этого списка.
 */
export const EXTRA: ReadonlySet<string> = new Set([
  '가능성', '감정', '거리감', '경력', '공감', '공공', '관계', '관람', '관리', '관심', '구성', '기관', '기념', '기억력', '기초', '기회', '노력', '능력', '만족감',
  '성격', '성공', '성장', '소속감', '실력', '안정', '안정감', '영향력', '예정', '완성', '용기', '우정', '인기', '자신감', '정리', '정보', '정상', '정직', '제공',
  '집중력', '책임감', '체력', '학력', '협력', '호감',
])

/** Слова для заданий: словарь без «дополнительных». */
export const STUDY: Word[] = D.filter(d => !EXTRA.has(d.k))

/** Примеры «дополнительных» слов (кроме тех, что служат примером и обычному слову): в задания с предложениями не идут. */
const usual = new Set(STUDY.map(d => d.s))
export const EXTRA_SENTENCES: ReadonlySet<string> = new Set(D.filter(d => EXTRA.has(d.k) && d.s && !usual.has(d.s)).map(d => d.s))

/** Предложения с переводом для заданий: без примеров «дополнительных» слов. */
export const STUDY_TRANSLATIONS: Record<string, string> = Object.fromEntries(Object.entries(TRANSLATIONS).filter(([ko]) => !EXTRA_SENTENCES.has(ko)))
