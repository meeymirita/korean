import { describe, expect, it } from 'vitest'
import { REMIND_AT, nextRemindSent, remindState } from '../src/notes/remind.js'
import { noteRemindMail } from '../src/mail/templates.js'
import { wallClock } from '../src/notes/note-remind.service.js'

const base = { remindAt: '2031-05-04T09:30', remindSent: false, deletedAt: null }
const at = new Date(2031, 4, 4, 9, 30) // местное время, как у сервера

describe('напоминание по заметке: пора ли', () => {
  it('рано, пора, просрочено больше суток', () => {
    expect(remindState(base, new Date(2031, 4, 4, 9, 29, 59))).toBe('wait')
    expect(remindState(base, at)).toBe('due')
    expect(remindState(base, new Date(2031, 4, 4, 18, 0))).toBe('due')
    expect(remindState(base, new Date(at.getTime() + 24 * 3600 * 1000))).toBe('due')
    expect(remindState(base, new Date(at.getTime() + 24 * 3600 * 1000 + 1))).toBe('stale')
  })

  it('не напоминает: нет времени, уже отправлено, в корзине, кривой формат', () => {
    const late = new Date(2031, 4, 5, 0, 0)
    expect(remindState({ ...base, remindAt: null }, late)).toBe('none')
    expect(remindState({ ...base, remindSent: true }, late)).toBe('none')
    expect(remindState({ ...base, deletedAt: 123n }, late)).toBe('none')
    expect(remindState({ ...base, deletedAt: 0 }, late)).toBe('none')
    expect(remindState({ ...base, remindAt: 'завтра' }, late)).toBe('none')
  })

  it('формат времени и строка местного времени сервера сравниваются как строки', () => {
    expect(REMIND_AT.test('2031-05-04T09:30')).toBe(true)
    expect(REMIND_AT.test('2031-05-04T24:00')).toBe(false)
    expect(REMIND_AT.test('2031-05-04 09:30')).toBe(false)
    expect(wallClock(at)).toBe('2031-05-04T09:30')
    expect(wallClock(new Date(2031, 0, 2, 3, 4)) < '2031-05-04T09:30').toBe(true)
  })

  it('метка «отправлено» сбрасывается, только если время поменяли', () => {
    expect(nextRemindSent({ remindAt: '2031-05-04T09:30', remindSent: true }, '2031-05-04T09:30')).toBe(true)
    expect(nextRemindSent({ remindAt: '2031-05-04T09:30', remindSent: true }, '2031-05-05T09:30')).toBe(false)
    expect(nextRemindSent({ remindAt: '2031-05-04T09:30', remindSent: true }, null)).toBe(false)
    expect(nextRemindSent(undefined, '2031-05-04T09:30')).toBe(false)
    expect(nextRemindSent({ remindAt: '2031-05-04T09:30', remindSent: false }, '2031-05-04T09:30')).toBe(false)
  })
})

describe('текст напоминания', () => {
  it('заголовок, начало до 200 знаков, экранирование, кнопка на кабинет', () => {
    const m = noteRemindMail({ title: 'Купить <b>тетрадь</b>', text: 'я'.repeat(300), site: 'https://example.test/' })
    expect(m.topic).toBe('remind')
    expect(m.tg?.html).toContain('Купить &lt;b&gt;тетрадь&lt;/b&gt;')
    expect(m.tg?.html).not.toContain('<b>тетрадь')
    expect(m.tg?.html).toContain('я'.repeat(200) + '…')
    expect(m.tg?.html).not.toContain('я'.repeat(201))
    expect(JSON.stringify(m.tg?.button)).toContain('https://example.test/korean/cabinet?tab=notes')
  })
})
