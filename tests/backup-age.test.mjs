import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { archiveReminder, ARCHIVE_STALE_MS } = await load('/src/lib/backupAge.ts')
after(close)

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 30, 12)

describe('напоминание про архив', () => {
  test('свежий архив: тихо', () => {
    assert.equal(archiveReminder({ ok: true, time: now - 3 * DAY }, [], now), '')
    assert.equal(archiveReminder({ ok: true, time: now - ARCHIVE_STALE_MS }, [], now), '', 'ровно 8 дней ещё можно')
  })

  test('больше 8 дней: говорит, сколько дней', () => {
    assert.match(archiveReminder({ ok: true, time: now - 9 * DAY }, [], now), /9 дн/)
  })

  test('архива не было вовсе или последний не удался: подсказка', () => {
    assert.match(archiveReminder(null, [], now), /ещё ни разу/)
    assert.match(archiveReminder({ ok: false, time: now - DAY }, [], now), /не удалось отправить/)
  })

  test('не настроены пароль или почта: про архив не напоминает (там своя подсказка)', () => {
    assert.equal(archiveReminder(null, ['нет пароля'], now), '')
  })
})
