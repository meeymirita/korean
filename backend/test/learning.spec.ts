import { describe, expect, it } from 'vitest'
import { dayKey, grammarList, mistakesSummary, notYetList, streakOf, weakModes, wordsSummary } from '../src/learning/learning.summary.js'

const DAY = 86_400_000
const NOW = new Date('2026-11-17T12:00:00').getTime()

describe('сводка об обучении', () => {
  it('темы из «пройдено» и «впереди» разбираются в списки', () => {
    expect(grammarList('- 은 / 는 — частица темы\n- 이 / 가 — частица подлежащего\n')).toEqual(['은 / 는 — частица темы', '이 / 가 — частица подлежащего'])
    expect(notYetList('-고 싶다 («хочу»); -(으)ㄹ 수 있다 («могу»);  ')).toEqual(['-고 싶다 («хочу»)', '-(으)ㄹ 수 있다 («могу»)'])
  })

  it('серия дней: считается подряд до сегодня, без сегодняшнего занятия от вчера, пропуск обрывает', () => {
    const d = (n: number) => dayKey(NOW - n * DAY)
    expect(streakOf([d(0), d(1), d(2)], NOW)).toBe(3)
    expect(streakOf([d(1), d(2)], NOW)).toBe(2)
    expect(streakOf([d(0), d(2)], NOW)).toBe(1)
    expect(streakOf([d(3)], NOW)).toBe(0)
    expect(streakOf([], NOW)).toBe(0)
  })

  it('слова: выучено, в работе, выученные за неделю и слабые', () => {
    const row = (word: string, ok: number, bad: number, kd: number | null) => ({ word, ok, bad, streak: 0, last: NOW, kd })
    const s = wordsSummary([row('가다', 9, 1, NOW - DAY), row('먹다', 8, 0, NOW - 30 * DAY), row('듣다', 1, 4, null), row('보다', 3, 1, null), row('쉬다', 0, 0, null)], NOW)
    expect(s.learned).toBe(2)
    expect(s.inProgress).toBe(2)
    expect(s.learnedThisWeek).toEqual(['가다'])
    expect(s.weak).toEqual([{ word: '듣다', ok: 1, bad: 4 }])
  })

  it('ошибки из проверок: всего, по темам (сначала частые) и последние', () => {
    const m = (topic: string, mine = 'a') => ({ type: 'mistake', mine, right: 'b', why: 'c', topic })
    const s = mistakesSummary([
      { created: 1, items: [m('만'), m('만'), { type: 'note', text: 'x' }, m('과거')] },
      { created: 2, items: [m('만', 'новая'), m('')] },
    ])
    expect(s.total).toBe(5)
    // при равенстве раньше та тема, что свежее
    expect(s.byTopic).toEqual([{ topic: '만', count: 3 }, { topic: 'без темы', count: 1 }, { topic: '과거', count: 1 }])
    expect(s.recent[0]).toMatchObject({ mine: 'новая', topic: '만' })
    expect(mistakesSummary([])).toEqual({ total: 0, byTopic: [], recent: [] })
  })

  it('слабые режимы: меньше 90% и не меньше 20 ответов, сначала самые слабые', () => {
    const rows = [
      { source: 'game', mode: 'a', ok: 10, bad: 10 },
      { source: 'game', mode: 'b', ok: 19, bad: 1 },
      { source: 'game', mode: 'c', ok: 3, bad: 3 },
      { source: 'trainer', mode: 'd', ok: 16, bad: 8 },
    ]
    expect(weakModes(rows)).toEqual([
      { source: 'game', mode: 'a', answers: 20, accuracy: 50 },
      { source: 'trainer', mode: 'd', answers: 24, accuracy: 67 },
    ])
  })
})
