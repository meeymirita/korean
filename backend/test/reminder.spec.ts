import { describe, expect, it, vi } from 'vitest'
import { ReminderService, dayOf } from '../src/reminders/reminder.service'

function setup({ enabled = true, time = '19:00', lastSent = '', days = [], answers = 0, ready = true, sendError = false } = {}) {
  let stored = JSON.stringify({ enabled, time, lastSent, days })
  const db = {
    getMeta: vi.fn(async () => stored),
    setMeta: vi.fn(async (_key: string, value: string) => { stored = value }),
    orm: vi.fn(async () => ({ day: { findUnique: vi.fn(async () => ({ total: answers, ok: 0 })) } })),
  }
  const notify = { ready: vi.fn(() => ready), label: vi.fn(() => 'm***@example.org'), send: vi.fn(async () => { if (sendError) throw new Error('mail down') }) }
  const twofa = { email: vi.fn(async () => 'me@example.org') }
  const jobs = { register: vi.fn() }
  const service = new ReminderService(db as never, notify as never, twofa as never, jobs as never)
  return { service, db, notify, getStored: () => JSON.parse(stored) }
}

describe('напоминания: проверка по заданному времени', () => {
  const date = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute)

  it('не отправляет при выключенном, раннем времени, выбранном выходном или уже выполненном занятии', async () => {
    expect(await setup({ enabled: false }).service.tick(date(9, 21))).toBe('off')
    expect(await setup({ time: '20:00' }).service.tick(date(9, 19))).toBe('early')
    const d = date(9, 19) // 9 ноября 2026 — понедельник
    expect(await setup({ days: [2] }).service.tick(d)).toBe('off')
    expect(await setup({ answers: 1 }).service.tick(d)).toBe('studied')
  })

  it('отправляет один раз на день и сохраняет дату до отправки', async () => {
    const { service, notify, getStored } = setup()
    const now = date(9, 19)
    expect(await service.tick(now)).toBe('sent')
    expect(notify.send).toHaveBeenCalledOnce()
    expect(getStored().lastSent).toBe(dayOf(now))
    expect(await service.tick(now)).toBe('already')
    expect(notify.send).toHaveBeenCalledOnce()
  })

  it('не помечает день отправленным, если почта не готова или отправка упала', async () => {
    const noMail = setup({ ready: false })
    expect(await noMail.service.tick(date(9, 19))).toBe('nomail')
    expect(noMail.getStored().lastSent).toBe('')

    const failed = setup({ sendError: true })
    expect(await failed.service.tick(date(9, 19))).toBe('failed')
    expect(failed.getStored().lastSent).toBe('')
  })
})
