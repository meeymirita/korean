import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'
import { DigestService, sample } from '../backend/dist/digest/digest.service.js'
import { digestMail } from '../backend/dist/mail/templates.js'

after(cleanup)

/** Сервис с поддельными базой и почтой: время подставляем сами, ждать полдень не нужно. */
function fake({ configured = true, to = 'me@example.org', fail = false } = {}) {
  const meta = new Map()
  const sent = []
  const db = { getMeta: k => meta.get(k) ?? null, setMeta: (k, v) => meta.set(k, v) }
  const mail = { configured: () => configured, send: async (...a) => { if (fail) throw new Error('smtp'); sent.push(a) } }
  const svc = new DigestService(db, mail, { email: async () => to }, { register() {} })
  return { svc, sent }
}
const at = (h, m) => new Date(2026, 10, 2, h, m)

describe('письмо-подборка: расписание', () => {
  test('выключено и рано — письма нет; в своё время — одно, второе в тот же день не уходит', async () => {
    const { svc, sent } = fake()
    assert.equal(await svc.tick(at(13, 0)), 'off')
    await svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    assert.equal(await svc.tick(at(11, 59)), 'early')
    assert.equal(await svc.tick(at(12, 0)), 'sent')
    assert.equal(await svc.tick(at(12, 1)), 'already')
    assert.equal(sent.length, 1)
    assert.equal(await svc.tick(new Date(2026, 10, 3, 12, 0)), 'sent', 'на следующий день снова')
  })

  test('включили после выбранного времени — первое письмо завтра, а не сразу', async () => {
    const { svc, sent } = fake()
    await svc.set({ enabled: true, time: '12:00' }, at(15, 0))
    assert.equal(await svc.tick(at(15, 1)), 'already')
    assert.equal(sent.length, 0)
    assert.equal(await svc.tick(new Date(2026, 10, 3, 12, 0)), 'sent')
  })

  test('письмо содержит 10 слов и 5 предложений по умолчанию, числа настраиваются', async () => {
    const { svc, sent } = fake()
    await svc.set({ enabled: true, time: '12:00', words: 3, sentences: 2 }, at(9, 0))
    await svc.tick(at(12, 0))
    const [to, subject, text, html] = sent[0]
    assert.equal(to, 'me@example.org')
    assert.equal(subject, 'Повторение: 12:00 · 3 слова и 2 предложения')
    assert.equal((html.match(/font-size:20px;font-weight:700/g) ?? []).length, 3)
    assert.equal((html.match(/font-size:17px;font-weight:700/g) ?? []).length, 2)
    assert.ok(text.includes('Слова:') && text.includes('Предложения:'))
    const def = fake()
    const defs = await def.svc.get()
    assert.deepEqual([defs.words, defs.sentences], [10, 5])
    assert.equal(digestMail({ words: [['a', 'б']], sentences: [], time: '12:00' }).subject, 'Повторение: 12:00 · 1 слово')
  })

  test('почты нет — письма нет; сбой отправки не съедает день', async () => {
    const none = fake({ configured: false })
    await none.svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    assert.equal(await none.svc.tick(at(12, 0)), 'nomail')
    const bad = fake({ fail: true })
    await bad.svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    const log = console.error
    console.error = () => {}
    assert.equal(await bad.svc.tick(at(12, 0)), 'failed')
    console.error = log
    assert.equal((await bad.svc.get()).lastSent, '', 'следующая проверка попробует снова')
  })

  test('sample берёт разные элементы и не больше, чем есть', () => {
    const a = [1, 2, 3, 4, 5]
    for (let i = 0; i < 20; i++) assert.equal(new Set(sample(a, 3)).size, 3)
    assert.equal(sample(a, 99).length, 5)
    assert.deepEqual(sample(a, 0), [])
  })
})

describe('сервер: подборка по времени', () => {
  test('только владельцу; проверка значений; пустую подборку включить нельзя', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dg-a-'))
    const s = await start({ dir, env: { BACKUP_AUTO: '0', REMINDER_TICK_MS: '100000', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), REMINDER_MAIL_TO: 'me@example.org' } })
    assert.equal((await s.call('GET', '/api/digest')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/digest', g.token)).status, 403)

    const st = await (await s.call('GET', '/api/digest', OWNER)).json()
    assert.deepEqual([st.enabled, st.time, st.words, st.sentences, st.mailReady], [false, '12:00', 10, 5, true])
    assert.ok(!JSON.stringify(st).includes('me@example.org'))
    for (const bad of [{ time: '25:00' }, { words: -1 }, { words: 31 }, { sentences: 16 }, { words: 2.5 }, { enabled: 'yes' }]) assert.equal((await s.call('PUT', '/api/digest', OWNER, bad)).status, 400, JSON.stringify(bad))
    assert.equal((await s.call('PUT', '/api/digest', OWNER, { enabled: true, words: 0, sentences: 0 })).status, 400)
    const ok = await (await s.call('PUT', '/api/digest', OWNER, { enabled: true, time: '08:30', words: 7, sentences: 3 })).json()
    assert.deepEqual([ok.enabled, ok.time, ok.words, ok.sentences], [true, '08:30', 7, 3])
  })

  test('пробное письмо по кнопке уходит сразу и содержит слова и предложения', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dg-b-'))
    const s = await start({ dir, env: { BACKUP_AUTO: '0', REMINDER_TICK_MS: '100000', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), REMINDER_MAIL_TO: 'me@example.org' } })
    assert.deepEqual(await (await s.call('POST', '/api/digest/test', OWNER)).json(), { ok: true, message: '' })
    let row
    for (let i = 0; i < 50 && !row; i++) {
      const t = await readFile(path.join(dir, 'm.jsonl'), 'utf8').catch(() => '')
      if (t.trim()) row = JSON.parse(t.trim().split('\n')[0])
      else await new Promise(r => setTimeout(r, 100))
    }
    assert.match(row.subject, /^Повторение: 12:00 · 10 слов и 5 предложений$/)
  })
})
