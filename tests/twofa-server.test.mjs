import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

let mailFile
/** Последний код из «отправленных» писем (письма пишутся в файл вместо SMTP). */
const lastCode = async () => {
  const lines = (await readFile(mailFile, 'utf8')).trim().split('\n')
  return JSON.parse(lines.at(-1)).text.match(/: (\d{4})\b/)[1]
}
const mails = async () => (await readFile(mailFile, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).length

describe('сервер: двухфакторная защита (код на почту)', () => {
  let s, session
  before(async () => {
    mailFile = path.join(await mkdtemp(path.join(tmpdir(), 'mail-')), 'out.jsonl')
    await writeFile(mailFile, '')
    s = await start({ env: { MAIL_DUMP_FILE: mailFile } })
  })

  test('по умолчанию выключена: токен работает как раньше', async () => {
    assert.equal((await s.call('GET', '/api/progress', OWNER)).status, 200)
    const st = await (await s.call('GET', '/api/2fa/status', OWNER)).json()
    assert.deepEqual([st.enabled, st.mailConfigured], [false, true])
  })

  test('включение: неверный адрес — 400, письмо приходит, неверный код — 401, защита включается только за верный', async () => {
    assert.equal((await s.call('POST', '/api/2fa/enable/start', OWNER, { email: 'не-адрес' })).status, 400)
    assert.equal((await s.call('POST', '/api/2fa/enable/start', OWNER, { email: 'mira@example.com' })).status, 200)
    assert.equal(await mails(), 1)
    const code = await lastCode()
    assert.equal((await s.call('POST', '/api/2fa/enable/confirm', OWNER, { code: code === '0000' ? '0001' : '0000' })).status, 401)
    assert.equal((await s.call('GET', '/api/progress', OWNER)).status, 200) // ещё не включена
    const ok = await s.call('POST', '/api/2fa/enable/confirm', OWNER, { code })
    assert.equal(ok.status, 200)
    session = (await ok.json()).session
    assert.match(session, /^[a-f0-9]{32}$/)
  })

  test('после включения голый токен закрыт (401, error 2fa), токен с сеансом открыт', async () => {
    const bare = await s.call('GET', '/api/progress', OWNER)
    assert.equal(bare.status, 401)
    assert.equal((await bare.json()).error, '2fa')
    assert.equal((await s.call('GET', '/api/progress', `${OWNER} ${session}`)).status, 200)
    assert.equal((await s.call('GET', '/api/progress', `${OWNER} ${'0'.repeat(32)}`)).status, 401)
    assert.equal((await s.call('GET', '/api/notes', OWNER)).status, 401)
    assert.equal((await s.call('GET', '/api/health')).status, 200)
  })

  test('вход: статус с маской почты, код на почту, неверный код — 401, верный выдаёт сеанс, повтор слишком быстро — 429', async () => {
    const st = await (await s.call('GET', '/api/2fa/status', OWNER)).json()
    assert.deepEqual([st.enabled, st.email], [true, 'm***@example.com'])
    assert.equal((await s.call('POST', '/api/2fa/send', OWNER)).status, 200)
    assert.equal(await mails(), 2)
    assert.equal((await s.call('POST', '/api/2fa/send', OWNER)).status, 429)
    const code = await lastCode()
    assert.equal((await s.call('POST', '/api/2fa/verify', OWNER, { code: 'abcd' })).status, 401)
    const ok = await s.call('POST', '/api/2fa/verify', OWNER, { code })
    assert.equal(ok.status, 200)
    const s2 = (await ok.json()).session
    assert.equal((await s.call('GET', '/api/progress', `${OWNER} ${s2}`)).status, 200)
    assert.equal((await s.call('POST', '/api/2fa/verify', OWNER, { code })).status, 401) // код одноразовый
  })

  test('после пяти неверных попыток код сгорает, даже верный уже не подходит', async () => {
    const f = path.join(await mkdtemp(path.join(tmpdir(), 'mail-')), 'o.jsonl')
    await writeFile(f, '')
    const t = await start({ env: { MAIL_DUMP_FILE: f, RATE_BAD_LIMIT: '1000' } })
    mailFile = f
    await t.call('POST', '/api/2fa/enable/start', OWNER, { email: 'a@example.com' })
    const code = await lastCode()
    const wrong = code === '1234' ? '4321' : '1234'
    for (let i = 0; i < 5; i++) assert.equal((await t.call('POST', '/api/2fa/enable/confirm', OWNER, { code: wrong })).status, 401)
    assert.equal((await t.call('POST', '/api/2fa/enable/confirm', OWNER, { code })).status, 401)
    assert.equal((await t.call('GET', '/api/progress', OWNER)).status, 200) // защита так и не включилась
  })

  test('гостевой токен двухфакторной защитой не затронут', async () => {
    const g = await (await s.call('POST', '/api/guests', `${OWNER} ${session}`, { hours: 1 }, { 'X-Confirm-Token': OWNER })).json()
    assert.equal((await s.call('GET', '/api/progress', g.token)).status, 200)
  })

  test('выключение просит токен ещё раз; после него голый токен снова работает', async () => {
    assert.equal((await s.call('DELETE', '/api/2fa', `${OWNER} ${session}`)).status, 403)
    assert.equal((await s.call('DELETE', '/api/2fa', `${OWNER} ${session}`, undefined, { 'X-Confirm-Token': OWNER })).status, 200)
    assert.equal((await s.call('GET', '/api/progress', OWNER)).status, 200)
  })

  test('аварийный выключатель DISABLE_2FA=1 пускает по одному токену, данные защиты остаются', async () => {
    mailFile = path.join(await mkdtemp(path.join(tmpdir(), 'mail-')), 'x.jsonl')
    await writeFile(mailFile, '')
    const a = await start({ env: { MAIL_DUMP_FILE: mailFile } })
    await a.call('POST', '/api/2fa/enable/start', OWNER, { email: 'b@example.com' })
    assert.equal((await a.call('POST', '/api/2fa/enable/confirm', OWNER, { code: await lastCode() })).status, 200)
    assert.equal((await a.call('GET', '/api/progress', OWNER)).status, 401)
    await a.stop?.()
    const b = await start({ dir: a.dir, env: { MAIL_DUMP_FILE: mailFile, DISABLE_2FA: '1' } })
    assert.equal((await b.call('GET', '/api/progress', OWNER)).status, 200)
    const st = await (await b.call('GET', '/api/2fa/status', OWNER)).json()
    assert.deepEqual([st.enabled, st.bypassed], [true, true])
  })

  test('без настроенной почты включить нельзя (иначе не войти)', async () => {
    const t = await start({ env: { MAIL_DUMP_FILE: '' } })
    assert.equal((await t.call('POST', '/api/2fa/enable/start', OWNER, { email: 'c@example.com' })).status, 503)
  })
})
