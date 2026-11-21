import { VLOGS, type Vlog } from './vlogs'

/**
 * Порядок просмотра всех влогов от самого лёгкого к самому сложному (вкладка «Порядок» на странице «Влог»).
 * Сложность = число разных слов в речи (чем их больше, тем больше незнакомого), умноженное на поправку за быструю речь:
 * каждое слово в минуту сверх 35 прибавляет 1,2 %. Равные по сложности идут в порядке `id`, чтобы порядок не прыгал.
 */
export interface VlogStage {
  n: number
  title: string
  hint: string
}

export const VLOG_STAGES: VlogStage[] = [
  { n: 1, title: 'Самые лёгкие', hint: 'короткие рассказы с повторами и очень простые фразы: начни здесь' },
  { n: 2, title: 'Лёгкие', hint: 'бытовые сценки, речь медленная, слов немного' },
  { n: 3, title: 'Средние', hint: 'длиннее, больше незнакомых слов; смотри уже со знакомыми темами' },
  { n: 4, title: 'Посложнее', hint: 'длинные влоги и подкасты с быстрой речью: возвращайся к ним позже' },
]

const WORDS = (ko: string) => ko.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)

/** Сложность одного влога (больше значит труднее). */
export function difficulty(v: Vlog): number {
  const words = v.lines.flatMap(l => WORDS(l.ko))
  const first = v.lines[0]?.s ?? 0
  const last = v.lines.at(-1)?.e ?? 0
  const minutes = Math.max((last - first) / 60, 0.5)
  const wpm = words.length / minutes
  return new Set(words).size * (1 + 0.012 * Math.max(0, wpm - 35))
}

/** Идентификаторы влогов от лёгкого к сложному. */
export function orderVlogs(vlogs: readonly Vlog[]): string[] {
  return vlogs
    .map(v => ({ id: v.id, d: difficulty(v) }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
    .map(x => x.id)
}

/** Порядок всех готовых влогов: нужен странице «Влог» и тесту. */
export const VLOG_ORDER_IDS = orderVlogs(VLOGS)

/** Номер этапа (1–4) для места `rank` (с единицы) среди `total` влогов: четыре примерно равные части. */
export function stageOf(rank: number, total: number): number {
  return Math.min(VLOG_STAGES.length, Math.floor(((rank - 1) * VLOG_STAGES.length) / Math.max(total, 1)) + 1)
}
