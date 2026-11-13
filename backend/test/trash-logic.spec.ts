import { describe, expect, it } from 'vitest'
import { TRASH_DAYS, TRASH_MS, isTrashExpired, splitNotesReplace, trashCutoff, trashDaysLeft, trashExpiresAt } from '../src/trash/trash.js'

const DAY = 24 * 3600 * 1000

describe('срок корзины', () => {
  it('30 суток', () => {
    expect(TRASH_DAYS).toBe(30)
    expect(TRASH_MS).toBe(30 * DAY)
  })

  it('просрочено ровно через 30 суток, раньше нет', () => {
    const now = 100 * DAY
    expect(isTrashExpired(now - 30 * DAY, now)).toBe(true)
    expect(isTrashExpired(now - 30 * DAY + 1, now)).toBe(false)
    expect(isTrashExpired(now - 31 * DAY, now)).toBe(true)
    expect(isTrashExpired(now, now)).toBe(false)
    expect(trashCutoff(now)).toBe(70 * DAY)
    expect(trashExpiresAt(5)).toBe(5 + 30 * DAY)
  })

  it('сколько суток осталось', () => {
    const now = 100 * DAY
    expect(trashDaysLeft(now, now)).toBe(30)
    expect(trashDaysLeft(now - DAY - 1, now)).toBe(29)
    expect(trashDaysLeft(now - 29 * DAY - DAY / 2, now)).toBe(1)
    expect(trashDaysLeft(now - 40 * DAY, now)).toBe(0)
  })
})

describe('замена списка заметок', () => {
  const ex = [{ id: 'a', deletedAt: null }, { id: 'b', deletedAt: null }, { id: 't', deletedAt: 5n }]

  it('пропавшая из списка живая заметка уходит в корзину', () => {
    expect(splitNotesReplace(ex, ['a'])).toEqual({ keep: ['a'], toTrash: ['b'] })
  })

  it('лежащая в корзине и не присланная остаётся там', () => {
    expect(splitNotesReplace(ex, ['a', 'b']).toTrash).toEqual([])
  })

  it('присланная заметка из корзины возвращается в живые', () => {
    expect(splitNotesReplace(ex, ['a', 'b', 't'])).toEqual({ keep: ['a', 'b', 't'], toTrash: [] })
  })

  it('пустой список отправляет в корзину все живые', () => {
    expect(splitNotesReplace(ex, []).toTrash).toEqual(['a', 'b'])
  })
})
