import { describe, expect, it } from 'vitest'
import { WATCHED_MAX, cleanAttempt, cleanWatched } from '../src/vlog/vlog.service.js'

// Отметки «просмотрено» во «Влоге»: проверка присланного списка (база не нужна).
describe('отметки просмотренных влогов', () => {
  it('принимает номера видео ютуба и убирает повторы', () => {
    expect(cleanWatched({ watched: ['SEywQdBW8W4', 'EU-bWknoYc8', 'SEywQdBW8W4'] })).toEqual(['SEywQdBW8W4', 'EU-bWknoYc8'])
    expect(cleanWatched({ watched: [] })).toEqual([])
  })

  it('отклоняет чужое: не список, не номер, слишком много', () => {
    for (const bad of [null, {}, { watched: 'x' }, { watched: ['короткий'] }, { watched: [1] }, { watched: ['../etc/passwd'] }, { watched: Array(WATCHED_MAX + 1).fill('SEywQdBW8W4') }]) expect(() => cleanWatched(bad)).toThrow()
  })
})

// Попытки теста по влогу: проверка присланного, «сдано» считает сервер.
describe('попытки теста по влогу', () => {
  const ok = { yt: 'SEywQdBW8W4', score: 24, total: 30, blocks: [{ id: 'quiz', score: 8, total: 8 }, { id: 'order', score: 4, total: 6 }] }

  it('принимает попытку, ставит время и считает «сдано» сам', () => {
    const a = cleanAttempt({ ...ok, passed: false, at: 1 }, 1000)
    expect(a).toMatchObject({ yt: 'SEywQdBW8W4', at: 1000, score: 24, total: 30, passed: true })
    expect(cleanAttempt({ ...ok, score: 23 }).passed).toBe(false)
  })

  it('отклоняет чужое: плохой номер, балл больше максимума, пустые блоки, лишние символы', () => {
    for (const bad of [null, {}, { ...ok, yt: 'x' }, { ...ok, score: 31 }, { ...ok, total: 0, score: 0 }, { ...ok, blocks: [] }, { ...ok, blocks: [{ id: 'Quiz!', score: 1, total: 2 }] }, { ...ok, score: 1.5 }, { ...ok, blocks: [{ id: 'quiz', score: 3, total: 2 }] }]) expect(() => cleanAttempt(bad)).toThrow()
  })
})
