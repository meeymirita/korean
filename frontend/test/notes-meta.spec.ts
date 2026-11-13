import { describe, expect, it } from 'vitest'
import { TRASH_DAYS, cleanRemind, daysLeftLabel, formatRemind, sortNotes, trashDaysLeft } from '../src/lib/notesMeta'
import { normalizeNotes } from '../src/stores/notes'

const DAY = 24 * 3600 * 1000

describe('закрепление: порядок списка', () => {
  const n = (id: string, created: number, pinned?: boolean) => ({ id, created, pinned })

  it('закреплённые первыми, внутри групп новые сверху', () => {
    const ids = sortNotes([n('a', 1), n('b', 5), n('c', 3, true), n('d', 2, true)]).map(x => x.id)
    expect(ids).toEqual(['c', 'd', 'b', 'a'])
  })

  it('без закреплённых прежний порядок, исходный массив не меняется', () => {
    const src = [n('a', 1), n('b', 3), n('c', 2)]
    expect(sortNotes(src).map(x => x.id)).toEqual(['b', 'c', 'a'])
    expect(src.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('корзина: срок', () => {
  it('30 дней, остаток считается сутками вверх и не уходит в минус', () => {
    const now = 100 * DAY
    expect(TRASH_DAYS).toBe(30)
    expect(trashDaysLeft(now, now)).toBe(30)
    expect(trashDaysLeft(now - 29 * DAY - 1, now)).toBe(1)
    expect(trashDaysLeft(now - 30 * DAY, now)).toBe(0)
    expect(trashDaysLeft(now - 99 * DAY, now)).toBe(0)
  })

  it('подпись с верным склонением', () => {
    expect(daysLeftLabel(1)).toBe('осталось 1 день')
    expect(daysLeftLabel(3)).toBe('осталось 3 дня')
    expect(daysLeftLabel(5)).toBe('осталось 5 дней')
    expect(daysLeftLabel(21)).toBe('осталось 21 день')
    expect(daysLeftLabel(12)).toBe('осталось 12 дней')
    expect(daysLeftLabel(0)).toBe('сегодня будет удалено')
  })
})

describe('«Напомнить в»', () => {
  it('принимается только формат поля datetime-local', () => {
    expect(cleanRemind('2031-05-04T09:30')).toBe('2031-05-04T09:30')
    for (const bad of ['', 'завтра', '2031-05-04 09:30', '2031-13-04T09:30', null, 5]) expect(cleanRemind(bad)).toBeNull()
  })

  it('время на карточке показывается как записано, без пересчёта поясов', () => {
    expect(formatRemind('2031-05-04T09:05')).toMatch(/09:05$/)
    expect(formatRemind(null)).toBe('')
    expect(formatRemind('мусор')).toBe('')
  })
})

describe('заметки из браузера и с сервера', () => {
  it('pinned и remindAt нормализуются; у старых заметок без полей закрепления нет', () => {
    const d = normalizeNotes({ notes: [{ id: 'a', title: 'T', text: '', created: 1, updated: 1 }, { id: 'b', title: 'T', text: '', created: 1, updated: 1, pinned: true, remindAt: '2031-05-04T09:30' }, { id: 'c', title: 'T', text: '', created: 1, updated: 1, pinned: 'да', remindAt: 'xx' }] })
    expect(d.notes.map(n => [n.pinned, n.remindAt])).toEqual([[false, null], [true, '2031-05-04T09:30'], [false, null]])
  })
})
