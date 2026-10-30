import { G } from './grammar'
import type { Task } from './tasks'

export interface Explanation {
  text: string
  /** карточка грамматики, которую стоит открыть */
  gram?: { id: string; title: string }
}

const PAST = 'Прошедшее время вежливо: основа + 았어요 / 었어요, у 하다 получается 했어요.'
const PRESENT = 'Вежливое настоящее: основа + 아요 / 어요, у 하다 получается 해요.'

/**
 * Короткий разбор ошибки: что выбрано, как правильно и почему, со ссылкой на карточку грамматики, если у задания она есть.
 * Объяснения общие и основаны на задании: новых правил здесь не придумывается.
 */
export function explain(t: Task, picked: string): Explanation {
  const card = t.gram ? G.find(g => g.id === t.gram) : undefined
  const gram = card ? { id: card.id, title: card.ko } : undefined
  const head = `Ты выбрал «${picked}», а верно «${t.answer}».`
  let why: string
  if (t.kind === 'rule' && card) why = `Здесь работает правило «${card.ko}»: ${card.d}.`
  else if (t.kind === 'form') why = t.title.includes('прошедшее') ? PAST : PRESENT
  else if (t.kind === 'blank') why = `В примере пропущено слово «${t.answer}»${t.hint ? ` (${t.hint})` : ''}.`
  else if (t.kind === 'back') why = `По-корейски «${t.prompt}» это ${t.answer}.`
  else if (t.kind === 'read') why = `${t.prompt} читается «${t.answer}»${t.hint ? ` и значит «${t.hint}»` : ''}.`
  else why = `${t.prompt} значит «${t.answer}».`
  return { text: `${head} ${why}`, gram }
}
