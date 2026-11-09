import { dayKey, type ProgressData } from '@/stores/progress'
import { G } from '@/data/korean/grammar'
import { famOfCard } from '@/game/families'

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** Последние n дней по возрастанию (последний — сегодня). */
function lastDays(n: number, now: Date) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i))
    return { key: dayKey(d), label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`, wd: WD[d.getDay()]! }
  })
}

/** Ответы по дням: всего и верных. */
export function answersByDay(p: ProgressData, n = 30, now = new Date()) {
  return lastDays(n, now).map(d => ({ key: d.key, label: d.label, all: p.all[d.key] ?? 0, ok: p.days[d.key] ?? 0 }))
}

export interface WeakRule {
  id: string
  label: string
  ok: number
  bad: number
  accuracy: number
  family?: string
}

/** Accuracy by grammar rule from the same answer journal used by cabinet reports. */
export function weakRules(log: ProgressData['log'], days = 30, now = Date.now()): WeakRule[] {
  const since = now - days * 86_400_000
  const groups = new Map<string, WeakRule>()
  const categories: Record<string, { label: string; family?: string }> = {
    part: { label: 'Частицы', family: 'all' }, particles: { label: 'Частицы', family: 'all' },
    ptext: { label: 'Семейства частиц', family: 'all' }, form: { label: 'Формы' }, type: { label: 'Формы' },
    num: { label: 'Числа' }, count: { label: 'Числа' }, price: { label: 'Числа' },
    when: { label: 'Время' }, days: { label: 'Время' },
  }
  for (const answer of log) {
    if (answer.t < since || (answer.s !== 'trainer' && answer.s !== 'game')) continue
    const id = answer.d?.g
    let group: { id: string; label: string; family?: string } | undefined
    if (id) {
      const card = G.find(item => item.id === id)
      if (card) group = { id: `rule:${card.id}`, label: card.ru, family: famOfCard(card.id) }
      else if (categories[id]) group = { id: `mode:${id}`, ...categories[id]! }
    }
    if (!group) continue
    const stat = groups.get(group.id) ?? { ...group, ok: 0, bad: 0, accuracy: 0 }
    if (answer.ok) stat.ok++
    else stat.bad++
    groups.set(group.id, stat)
  }
  return [...groups.values()].map(row => ({ ...row, accuracy: Math.round(row.ok / (row.ok + row.bad) * 100) }))
    .filter(row => row.ok + row.bad >= 3)
    .sort((a, b) => a.accuracy - b.accuracy || b.bad - a.bad)
}
