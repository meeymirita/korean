import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { GROWTH } = await load('/src/data/growth.ts')
const { HISTORY } = await load('/src/data/history.ts')
after(close)

describe('данные страницы «Рост платформы» (growth.ts)', () => {
  test('дни по порядку, накопленное число коммитов сходится', () => {
    assert.ok(GROWTH.days.length > 10)
    let sum = 0
    let prev = ''
    for (const d of GROWTH.days) {
      assert.ok(d.d > prev, `дни не по порядку: ${d.d}`)
      prev = d.d
      sum += d.n
      assert.equal(d.cum, sum, d.d)
      assert.ok(d.n > 0 && d.add >= 0 && d.del >= 0, d.d)
    }
    assert.equal(GROWTH.commits, sum)
    assert.equal(GROWTH.first.d, GROWTH.days[0].d)
  })

  test('график роста не отстаёт от «Истории»: свежая запись не новее последнего дня графика больше чем на день (npm run growth)', () => {
    const newest = HISTORY.map(h => h.date).sort().at(-1)
    const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86_400_000
    assert.ok(days(newest, GROWTH.generated) <= 1, `в «Истории» есть запись от ${newest}, а график роста собран ${GROWTH.generated}: запусти npm run growth`)
  })

  test('ключевые события взяты из «Истории» и лежат на днях с коммитами', () => {
    assert.ok(GROWTH.marks.length >= 20 && GROWTH.marks.length <= 80, `событий ${GROWTH.marks.length}`)
    const days = new Set(GROWTH.days.map(d => d.d))
    for (const m of GROWTH.marks) {
      assert.ok(HISTORY.some(h => h.date === m.d && h.title === m.title), `нет в «Истории»: ${m.title}`)
      assert.ok(days.has(m.d) || GROWTH.days.some(d => d.d <= m.d), m.d)
      assert.ok(m.title && m.summary && m.cum >= 1 && m.cum <= GROWTH.commits, m.title)
    }
    const order = GROWTH.marks.map(m => m.d)
    assert.deepEqual(order, [...order].sort(), 'события не по порядку дат')
  })
})
