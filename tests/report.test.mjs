import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'
import { load } from './_load.mjs'

after(cleanup)
const { groupReport, modeName, percent, spent } = await load('/src/data/report.ts')

describe('сервер: отчёт по режимам', () => {
  let s
  before(async () => (s = await start()))
  const now = Date.now()
  const day = new Date(now).toLocaleDateString('sv-SE')
  const a = (o = {}) => ({ type: 'answer', t: now, day, word: '사람', ok: true, source: 'game', mode: 'build', xp: 10, ...o })

  test('считает ответы по разделу и режиму, время по промежуткам, гостю закрыто', async () => {
    const ops = [a({ t: now - 60_000 }), a({ t: now - 30_000, ok: false }), a({ t: now - 10_000, source: 'trainer', mode: 'match' }), a({ t: now, source: 'trainer', mode: 'match', ok: false })]
    assert.equal((await s.call('POST', '/api/ops', OWNER, { ops })).status, 200)
    assert.equal((await s.call('POST', '/api/ops', OWNER, { ops: [{ type: 'time', day, seconds: 600 }] })).status, 200)
    const r = await (await s.call('GET', '/api/report?days=7', OWNER)).json()
    assert.deepEqual([r.totals.ok, r.totals.bad, r.totals.activeDays, r.totals.seconds], [2, 2, 1, 600])
    const build = r.rows.find(x => x.mode === 'build')
    assert.deepEqual([build.ok, build.bad, build.days, build.seconds], [1, 1, 1, 45])
    const match = r.rows.find(x => x.mode === 'match')
    assert.deepEqual([match.ok, match.bad], [1, 1])
    const ser = await (await s.call('GET', '/api/report/series?source=game&mode=build&days=7', OWNER)).json()
    assert.equal(ser.days.length, 7)
    assert.deepEqual([ser.days.at(-1).ok, ser.days.at(-1).bad], [1, 1])
    assert.equal(ser.days[0].ok + ser.days[0].bad, 0)
    const whole = await (await s.call('GET', '/api/report/series?source=trainer&days=7', OWNER)).json()
    assert.equal(whole.mode, null)
    assert.equal(whole.days.at(-1).ok + whole.days.at(-1).bad, 2)
    const bad = await (await s.call('GET', '/api/report/answers?source=game&mode=build&days=7&only=bad', OWNER)).json()
    assert.deepEqual([bad.items.length, bad.ok, bad.bad, bad.items[0].ok], [1, 1, 1, false])
    const every = await (await s.call('GET', '/api/report/answers?source=trainer', OWNER)).json()
    assert.equal(every.items.length, 2)
    assert.ok(every.items[0].t >= every.items[1].t, 'новые сверху')
    const all = await (await s.call('GET', '/api/report', OWNER)).json()
    assert.equal(all.days, 0)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/report', g.token)).status, 403)
    assert.equal((await s.call('GET', '/api/report')).status, 401)
  })
})

describe('сайт: данные отчёта', () => {
  test('режимы получают названия, разделы группируются, проценты и время читаются', () => {
    assert.equal(modeName('build'), 'Собери предложение')
    assert.equal(modeName('syllables'), 'Собери по слогам')
    assert.equal(modeName(''), 'без режима')
    assert.equal(modeName('неизвестный'), 'неизвестный')
    const rows = [
      { source: 'game', mode: 'build', ok: 3, bad: 1, days: 1, first: 1, last: 2, seconds: 120 },
      { source: 'game', mode: 'word', ok: 10, bad: 0, days: 2, first: 1, last: 2, seconds: 60 },
      { source: 'today', mode: '', ok: 1, bad: 0, days: 1, first: 1, last: 2, seconds: 5 },
    ]
    const g = groupReport(rows)
    assert.deepEqual(g.map(x => x.source), ['game', 'today'])
    assert.deepEqual(g[0].rows.map(x => x.mode), ['word', 'build'])
    assert.equal(g[0].ok, 13)
    assert.equal(percent(3, 1), 75)
    assert.equal(percent(0, 0), 0)
    assert.equal(spent(0), '—')
    assert.equal(spent(20), 'меньше минуты')
    assert.equal(spent(125), '2 мин')
    assert.equal(spent(3900), '1 ч 05 мин')
  })
})
