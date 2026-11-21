import { describe, expect, it } from 'vitest'
import { WATCHED_MAX, cleanWatched } from '../src/vlog/vlog.service.js'

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
