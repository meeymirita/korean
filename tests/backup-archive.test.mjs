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

describe('сервер: тревога о ночной копии', () => {
  async function mails(file, n, tries = 60) {
    for (let i = 0; i < tries; i++) {
      const t = await readFile(file, 'utf8').catch(() => '')
      const rows = t.trim() ? t.trim().split('\n').map(l => JSON.parse(l)) : []
      if (rows.length >= n) return rows
      await new Promise(r => setTimeout(r, 100))
    }
    return []
  }

  test('скрипт сообщил об ошибке: одно письмо, повторов нет', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-alarm-'))
    await writeFile(path.join(dir, 'backup-status.json'), JSON.stringify({ ok: false, time: Date.now(), message: 'копия не удалась (код 3)' }))
    await start({ dir, env: { BACKUP_WATCH_MS: '100', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), BACKUP_MAIL_TO: 'me@example.org' } })
    const rows = await mails(path.join(dir, 'm.jsonl'), 1)
    assert.equal(rows.length, 1)
    assert.match(rows[0].subject, /ночная копия не удалась/)
    await new Promise(r => setTimeout(r, 500)) // ещё несколько проверок: письмо не повторяется
    assert.equal((await readFile(path.join(dir, 'm.jsonl'), 'utf8')).trim().split('\n').length, 1)
  })

  test('копии нет больше 36 часов: письмо; свежая копия и отсутствие скрипта молчат', async () => {
    const old = await mkdtemp(path.join(tmpdir(), 'bk-stale-'))
    await writeFile(path.join(old, 'backup-status.json'), JSON.stringify({ ok: true, time: Date.now() - 40 * 3600_000 }))
    await start({ dir: old, env: { BACKUP_WATCH_MS: '100', MAIL_DUMP_FILE: path.join(old, 'm.jsonl'), BACKUP_MAIL_TO: 'me@example.org' } })
    assert.match((await mails(path.join(old, 'm.jsonl'), 1))[0].subject, /давно не делалась/)

    for (const status of [{ ok: true, time: Date.now() }, null]) {
      const dir = await mkdtemp(path.join(tmpdir(), 'bk-quiet-'))
      if (status) await writeFile(path.join(dir, 'backup-status.json'), JSON.stringify(status))
      await start({ dir, env: { BACKUP_WATCH_MS: '100', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), BACKUP_MAIL_TO: 'me@example.org' } })
      assert.equal((await mails(path.join(dir, 'm.jsonl'), 1, 8)).length, 0)
    }
  })
})

describe('письмо с копией', async () => {
  test('шаги открытия, части и экранирование; пароля в письме нет', async () => {
    const { backupMail } = await import('../server/dist/mail/templates.js')
    const one = backupMail({ kind: 'archive', name: 'korean-1.tar.gz.enc', mb: '1.3' })
    assert.match(one.html, /openssl enc -d -aes-256-cbc/)
    assert.ok(!one.html.includes('-pass') && !one.text.includes('-pass'), 'пароль в командной строке не светим')
    assert.match(one.text, /1\. Расшифруйте/)
    const part = backupMail({ kind: 'archive', name: 'korean-1.tar.gz.enc', mb: '40', part: { i: 2, n: 3 } })
    assert.match(part.subject, /часть 2 из 3/)
    assert.match(part.html, /cat korean-1\.tar\.gz\.enc\.part\*/)
    assert.match(backupMail({ kind: 'archive', name: '<b>x</b>' }).html, /&lt;b&gt;x&lt;\/b&gt;/)
    assert.match(backupMail({ kind: 'big', mb: '200' }).text, /server\/data\/export/)
    assert.match(backupMail({ kind: 'test' }).subject, /проверка/)
  })
})
