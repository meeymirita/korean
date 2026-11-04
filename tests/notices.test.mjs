import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { lastVisitOf, visit } = await load('/src/composables/useLastVisited.ts')
const { computeNotices, dismissNotice, SESSION_DAYS } = await load('/src/composables/useNotices.ts')
after(close)
beforeEach(() => ls.clear())

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 3, 12, 0, 0)
const owner = { unlocked: true, sessionCreatedAt: 0 }

describe('колокольчик уведомлений', () => {
  test('без входа напоминаний нет, даже если условия верны', () => {
    assert.deepEqual(computeNotices({ unlocked: false, sessionCreatedAt: 0 }, now), [])
  })

  test('садик: не предупреждает, пока заходили недавно, предупреждает после недели', () => {
    visit('/korean/garden')
    assert.ok(lastVisitOf('garden') > 0 && lastVisitOf('garden') <= Date.now())
    assert.deepEqual(computeNotices(owner, Date.now() + 6 * DAY), [])
    const list = computeNotices(owner, Date.now() + 8 * DAY)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'garden')
    assert.equal(list[0].to, '/korean/garden')
  })

  test('садик: ни разу не заходил — тоже предупреждает (lastVisitOf даёт 0)', () => {
    assert.equal(lastVisitOf('garden'), 0)
    const list = computeNotices(owner, now)
    assert.equal(list.some(n => n.id === 'garden'), true)
  })

  test('сеанс: тихо, пока далеко от истечения, предупреждает в последние три дня', () => {
    visit('/korean/garden') // садик только что открыли — его напоминание не мешает проверке сеанса
    const created = now - (SESSION_DAYS - 10) * DAY // десятый день — ещё не близко
    assert.deepEqual(computeNotices({ unlocked: true, sessionCreatedAt: created }, now), [])
    const soon = { unlocked: true, sessionCreatedAt: now - (SESSION_DAYS - 2) * DAY } // до истечения два дня
    const list = computeNotices(soon, now)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'session')
    assert.match(list[0].text, /2 дн\./)
  })

  test('сеанс: уже истёк — не предупреждает (двухфакторная защита сама попросит код заново)', () => {
    visit('/korean/garden')
    const expired = { unlocked: true, sessionCreatedAt: now - (SESSION_DAYS + 1) * DAY }
    assert.deepEqual(computeNotices(expired, now), [])
  })

  test('скрытое напоминание не возвращается несколько дней, потом появляется снова', () => {
    const base = Date.now() // dismissNotice запоминает настоящее время, поэтому и отсчёт от него
    assert.equal(computeNotices(owner, base).length, 1, 'ни разу не заходил в сад — напоминает')
    dismissNotice('garden')
    assert.deepEqual(computeNotices(owner, base + DAY), [])
    assert.equal(computeNotices(owner, base + 4 * DAY).length, 1, 'через несколько дней снова напоминает')
  })
})
