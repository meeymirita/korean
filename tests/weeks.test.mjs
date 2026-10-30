import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { weekArchive, studyTime, mondayOf } = await load('/src/data/weeks.ts')
after(close)

const base = { all: {}, days: {}, time: {}, words: {} }

describe('архив недель', () => {
  test('понедельник недели', () => {
    assert.equal(mondayOf(new Date('2026-11-05T12:00:00')).getDate(), 2) // четверг → понедельник 2 ноября
    assert.equal(mondayOf(new Date('2026-11-08T12:00:00')).getDate(), 2) // воскресенье той же недели
  })

  test('неделя считается по ответам, дням и выученным словам; пустые недели пропускаются', () => {
    const p = { ...base, all: { '2026-11-02': 10, '2026-11-04': 5 }, days: { '2026-11-02': 8, '2026-11-04': 2 }, time: { '2026-11-02': 600 }, words: { a: { kd: new Date('2026-11-03T12:00:00').getTime() }, b: {} } }
    const arc = weekArchive(p, 4, new Date('2026-11-12T12:00:00'))
    assert.equal(arc.length, 1)
    assert.deepEqual([arc[0].start, arc[0].end, arc[0].total, arc[0].ok, arc[0].accuracy, arc[0].activeDays, arc[0].seconds, arc[0].learned], ['2026-11-02', '2026-11-08', 15, 10, 67, 2, 600, 1])
  })

  test('новые недели сверху, время словами', () => {
    const p = { ...base, all: { '2026-10-27': 1, '2026-11-03': 1 } }
    assert.deepEqual(weekArchive(p, 4, new Date('2026-11-04T12:00:00')).map(w => w.start), ['2026-11-02', '2026-10-26'])
    assert.equal(studyTime(20), '–')
    assert.equal(studyTime(1500), '25 мин')
    assert.equal(studyTime(3900), '1 ч 05 мин')
  })
})
