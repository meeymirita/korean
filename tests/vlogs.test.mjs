import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { VLOGS, lineAt, checkVlog, YT_ID } = await load('/src/data/korean/vlogs.ts')

after(close)

const lines = [
  { s: 1, e: 3, ko: '안녕하세요', ru: 'Здравствуйте' },
  { s: 3, e: 6, ko: '저는 학생이에요', ru: 'Я студент' },
  { s: 8, e: 9, ko: '감사합니다', ru: 'Спасибо' },
]

test('lineAt: идущая фраза по времени', () => {
  assert.equal(lineAt(lines, 0), -1)
  assert.equal(lineAt(lines, 1), 0)
  assert.equal(lineAt(lines, 5.9), 1)
  assert.equal(lineAt(lines, 7), 1)
  assert.equal(lineAt(lines, 100), 2)
  assert.equal(lineAt([], 5), -1)
})

test('checkVlog находит ошибки данных', () => {
  const ok = { id: 'a', yt: 'dQw4w9WgXcQ', title: 't', channel: 'c', note: 'n', lines }
  assert.deepEqual(checkVlog(ok), [])
  assert.ok(checkVlog({ ...ok, yt: 'короткий' }).length)
  assert.ok(checkVlog({ ...ok, lines: [{ s: 2, e: 2, ko: '가', ru: 'идти' }] }).length)
  assert.ok(checkVlog({ ...ok, lines: [lines[1], lines[0]] }).length)
  assert.ok(checkVlog({ ...ok, lines: [{ s: 0, e: 1, ko: '', ru: 'x' }] }).length)
})

test('все влоги на сайте без ошибок, id уникальны', () => {
  const ids = new Set()
  for (const v of VLOGS) {
    assert.deepEqual(checkVlog(v), [], v.id)
    assert.ok(YT_ID.test(v.yt))
    assert.ok(!ids.has(v.id))
    ids.add(v.id)
  }
})
