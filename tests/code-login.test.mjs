import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const lines = async f => (await readFile(f, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
/** Последний код из «отправленных» сообщений Telegram (сообщения пишутся в файл) или писем. */
const tgCode = async f => (await lines(f)).at(-1).text.match(/<code>(\d{6})<\/code>/)[1]
const mailCode = async f => (await lines(f)).at(-1).subject.match(/(\d{6})$/)[1]
const wrong = code => (code === '000000' ? '000001' : '000000')
const post = (s, p, body) => s.call('POST', `/api/login/code/${p}`, undefined, body)

describe('сервер: вход по коду без токена (Telegram и почта)', () => {
  let s, tg, mail
  before(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'code-login-'))
    tg = path.join(dir, 'tg.jsonl')
    mail = path.join(dir, 'mail.jsonl')
    await writeFile(tg, '')
    await writeFile(mail, '')
    s = await start({ env: { TELEGRAM_DUMP_FILE: tg, TELEGRAM_CHAT_ID: '1', MAIL_DUMP_FILE: mail, REMINDER_MAIL_TO: 'me@example.org' } })
  })

  test('способы входа видны без токена: Telegram и почта настроены', async () => {
    const r = await s.call('GET', '/api/login/code/channels')
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { enabled: true, telegram: true, mail: true })
  })

  test('чужой канал и пустой запрос отклоняются, а в Telegram при этом ничего не уходит', async () => {
    for (const bad of [{ channel: 'sms' }, { channel: '' }, {}, { channel: 5 }]) assert.equal((await post(s, 'send', bad)).status, 400, JSON.stringify(bad))
    assert.equal((await lines(tg)).length, 0)
  })

  test('Telegram: код из 6 цифр приходит туда, неверный код 401, верный даёт сеанс; код одноразовый', async () => {
    const r = await post(s, 'send', { channel: 'telegram' })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: true, channel: 'telegram' })
    assert.equal((await lines(mail)).length, 0, 'в почту ничего не ушло: код только в выбранный канал')
    const code = await tgCode(tg)
    assert.equal((await post(s, 'verify', { code: wrong(code) })).status, 401)
    assert.equal((await post(s, 'verify', { code: '12345' })).status, 401, 'короткий код')
    const ok = await post(s, 'verify', { code })
    assert.equal(ok.status, 200)
    const { session } = await ok.json()
    assert.match(session, /^[a-f0-9]{32}$/)
    assert.equal((await post(s, 'verify', { code })).status, 401, 'тот же код второй раз')

    // сеанс без токена открывает сайт владельца, в том числе то, что только для владельца
    assert.equal((await s.call('GET', '/api/progress', `ses:${session}`)).status, 200)
    assert.equal((await s.call('GET', '/api/notes/trash', `ses:${session}`)).status, 200)
    assert.equal((await s.call('GET', '/api/progress', OWNER)).status, 200, 'вход по токену работает как раньше')
  })

  test('просроченный или выдуманный сеанс: 401 «session» и это не считается подбором токена (адрес не блокируется)', async () => {
    for (let i = 0; i < 14; i++) {
      const r = await s.call('GET', '/api/progress', 'ses:' + 'a'.repeat(32))
      assert.equal(r.status, 401, 'попытка ' + i)
      assert.equal((await r.json()).error, 'session')
    }
    assert.equal((await s.call('GET', '/api/progress', OWNER)).status, 200, 'адрес не заблокирован')
    assert.equal((await s.call('GET', '/api/progress', 'ses:xyz')).status, 401)
  })

  test('новый код раньше чем через 30 секунд не уходит (429 и сколько ждать)', async () => {
    assert.equal((await post(s, 'send', { channel: 'telegram' })).status, 200) // прежний код уже сгорел при входе
    const r = await post(s, 'send', { channel: 'telegram' })
    assert.equal(r.status, 429)
    const body = await r.json()
    assert.equal(body.error, 'too soon')
    assert.ok(body.wait > 0 && body.wait <= 30)
  })

  test('пять неверных кодов сжигают код: верный после них уже не подходит', async () => {
    // чужой канал-сервер: свежий экземпляр, чтобы не ждать паузу
    const dir = await mkdtemp(path.join(tmpdir(), 'code-burn-'))
    const f = path.join(dir, 'tg.jsonl')
    await writeFile(f, '')
    const s2 = await start({ env: { TELEGRAM_DUMP_FILE: f, TELEGRAM_CHAT_ID: '1' } })
    assert.deepEqual(await (await s2.call('GET', '/api/login/code/channels')).json(), { enabled: true, telegram: true, mail: false })
    assert.equal((await post(s2, 'send', { channel: 'telegram' })).status, 200)
    const code = await tgCode(f)
    for (let i = 0; i < 5; i++) assert.equal((await post(s2, 'verify', { code: wrong(code) })).status, 401)
    assert.equal((await post(s2, 'verify', { code })).status, 401, 'код сгорел')
    assert.equal((await post(s2, 'send', { channel: 'mail' })).status, 400, 'почта не настроена: отправить нельзя')
  })

  test('почта: код уходит только на адрес владельца и только письмом', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'code-mail-'))
    const [tf, mf] = [path.join(dir, 'tg.jsonl'), path.join(dir, 'mail.jsonl')]
    await writeFile(tf, '')
    await writeFile(mf, '')
    const s3 = await start({ env: { TELEGRAM_DUMP_FILE: tf, TELEGRAM_CHAT_ID: '1', MAIL_DUMP_FILE: mf, REMINDER_MAIL_TO: 'me@example.org' } })
    assert.equal((await post(s3, 'send', { channel: 'mail' })).status, 200)
    const [m] = await lines(mf)
    assert.equal(m.to, 'me@example.org')
    assert.match(m.subject, /^Код для входа: \d{6}$/)
    assert.match(m.text, /по коду, без токена/)
    assert.equal((await lines(tf)).length, 0, 'в Telegram ничего не ушло')
    const ok = await post(s3, 'verify', { code: await mailCode(mf) })
    assert.equal(ok.status, 200)
  })

  test('CODE_LOGIN=0 выключает способ: ни каналов, ни отправки', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'code-off-'))
    const f = path.join(dir, 'tg.jsonl')
    await writeFile(f, '')
    const s4 = await start({ env: { TELEGRAM_DUMP_FILE: f, TELEGRAM_CHAT_ID: '1', CODE_LOGIN: '0' } })
    assert.deepEqual(await (await s4.call('GET', '/api/login/code/channels')).json(), { enabled: false, telegram: false, mail: false })
    assert.equal((await post(s4, 'send', { channel: 'telegram' })).status, 400)
    assert.equal((await lines(f)).length, 0)
  })
})
