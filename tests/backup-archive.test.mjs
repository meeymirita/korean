import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

async function wait(s) {
  for (let i = 0; i < 100; i++) {
    const r = await (await s.call('GET', '/api/backup/status', OWNER)).json()
    if (!r.archive.job.running && r.archive.last) return r.archive
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('архив не собрался')
}

describe('сервер: полный архив по кнопке', () => {
  test('без пароля архива запуск не начинается и говорит почему; без токена 401, гостю 403', async () => {
    const s = await start({ env: { BACKUP_AUTO: '0' } })
    assert.equal((await s.call('POST', '/api/backup/run')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('POST', '/api/backup/run', g.token)).status, 403)
    const r = await (await s.call('POST', '/api/backup/run', OWNER)).json()
    assert.equal(r.started, false)
    assert.match(r.message, /BACKUP_PASSPHRASE/)
  })

  test('архив шифруется, уходит на почту, расшифровывается паролем и содержит базу и картинки', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-arch-'))
    const mailFile = path.join(dir, 'mail.jsonl')
    await mkdir(path.join(dir, 'uploads'))
    await writeFile(path.join(dir, 'uploads', 'cat.png'), 'не-совсем-картинка')
    const s = await start({ dir, env: { BACKUP_AUTO: '0', BACKUP_PASSPHRASE: 'секретная фраза 123', MAIL_DUMP_FILE: mailFile, BACKUP_MAIL_TO: 'me@example.org' } })
    const r = await s.call('POST', '/api/backup/run', OWNER)
    assert.equal(r.status, 202)
    assert.equal((await r.json()).started, true)
    const a = await wait(s)
    assert.equal(a.last.ok, true, a.last.message)
    assert.equal(a.last.mail, 'ok')
    assert.equal(a.last.parts, 1)

    // файл архива лежит на сервере: без пароля не читается, с паролем распаковывается
    const exp = path.join(dir, 'export')
    const name = (await readdir(exp)).find(f => f.endsWith('.tar.gz.enc'))
    const bytes = await readFile(path.join(exp, name))
    const out = path.join(dir, 'restore')
    await mkdir(out)
    assert.ok(!bytes.includes(Buffer.from('не-совсем-картинка')), 'внутри архива открытого текста нет')
    const dec = pw => ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', path.join(exp, name), '-out', path.join(out, 'ok.tar.gz'), '-pass', 'pass:' + pw]
    assert.throws(() => execFileSync('openssl', dec('не тот'), { stdio: 'pipe' }))
    execFileSync('openssl', dec('секретная фраза 123'))
    const list = execFileSync('tar', ['-tzf', path.join(out, 'ok.tar.gz')]).toString()
    assert.match(list, /app\.db/)
    assert.match(list, /uploads\/cat\.png/)

    // письмо ушло получателю с вложением, пароль в письме не упоминается
    const mails = (await readFile(mailFile, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
    assert.equal(mails.length, 1)
    assert.equal(mails[0].to, 'me@example.org')
    assert.match(mails[0].files[0], /\.tar\.gz\.enc$/)
    assert.ok(!JSON.stringify(mails).includes('секретная фраза'))
  })
})

describe('сервер: проверка отправки', () => {
  test('шлёт короткое письмо; без почты говорит, что отправлять некуда', async () => {
    const none = await start({ env: { BACKUP_AUTO: '0' } })
    assert.equal((await none.call('POST', '/api/backup/test')).status, 401)
    assert.match((await (await none.call('POST', '/api/backup/test', OWNER)).json()).message, /некуда/)

    const dir = await mkdtemp(path.join(tmpdir(), 'bk-chk-'))
    const s = await start({ dir, env: { BACKUP_AUTO: '0', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), BACKUP_MAIL_TO: 'x@example.org' } })
    assert.deepEqual(await (await s.call('POST', '/api/backup/test', OWNER)).json(), { mail: 'ok', message: '' })
    assert.match(await readFile(path.join(dir, 'm.jsonl'), 'utf8'), /x@example\.org/)
  })
})
