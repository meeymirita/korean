import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельный WebDAV Яндекс Диска: помнит, что в него положили. */
async function fakeDisk() {
  const files = new Map()
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization ?? ''}`)
    if (req.method === 'MKCOL') return res.writeHead(201).end()
    if (req.method === 'PUT') {
      const chunks = []
      req.on('data', c => chunks.push(c))
      return req.on('end', () => {
        files.set(decodeURIComponent(req.url), Buffer.concat(chunks))
        res.writeHead(201).end()
      })
    }
    if (req.method === 'PROPFIND') return res.writeHead(207).end([...files.keys()].map(k => `<d:href>${k}</d:href>`).join(''))
    if (req.method === 'DELETE') {
      files.delete(decodeURIComponent(req.url))
      return res.writeHead(204).end()
    }
    res.writeHead(404).end()
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { files, seen, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

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

  test('архив шифруется, уходит на Диск и на почту, расшифровывается паролем и содержит базу и картинки', async () => {
    const disk = await fakeDisk()
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-arch-'))
    const mailFile = path.join(dir, 'mail.jsonl')
    await mkdir(path.join(dir, 'uploads'))
    await writeFile(path.join(dir, 'uploads', 'cat.png'), 'не-совсем-картинка')
    const s = await start({
      dir,
      env: { BACKUP_AUTO: '0', BACKUP_PASSPHRASE: 'секретная фраза 123', YADISK_LOGIN: 'me@yandex.ru', YADISK_PASSWORD: 'app-pass', YADISK_URL: disk.url, YADISK_DIR: 'bk', MAIL_DUMP_FILE: mailFile, BACKUP_MAIL_TO: 'me@example.org' },
    })
    try {
      await s.call('PUT', '/api/progress', OWNER, { words: {} }).catch(() => undefined)
      const r = await s.call('POST', '/api/backup/run', OWNER)
      assert.equal(r.status, 202)
      assert.equal((await r.json()).started, true)
      const a = await wait(s)
      assert.equal(a.last.ok, true, a.last.message)
      assert.equal(a.last.disk, 'ok')
      assert.equal(a.last.mail, 'ok')
      assert.equal(a.last.parts, 1)

      // на Диске лежит один файл, логин и пароль ушли только заголовком Basic
      const [[key, bytes]] = [...disk.files]
      assert.match(key, /^\/bk\/korean-.*\.tar\.gz\.enc$/)
      assert.ok(disk.seen.every(l => l.includes('Basic ' + Buffer.from('me@yandex.ru:app-pass').toString('base64'))))

      // без пароля содержимое не прочитать, с паролем распаковывается
      const out = path.join(dir, 'restore')
      await mkdir(out)
      await writeFile(path.join(out, 'a.enc'), bytes)
      assert.ok(!bytes.includes(Buffer.from('не-совсем-картинка')), 'внутри архива открытого текста нет')
      assert.throws(() => execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', path.join(out, 'a.enc'), '-out', path.join(out, 'x.tar.gz'), '-pass', 'pass:не тот'], { stdio: 'pipe' }))
      execFileSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', path.join(out, 'a.enc'), '-out', path.join(out, 'ok.tar.gz'), '-pass', 'pass:секретная фраза 123'])
      const list = execFileSync('tar', ['-tzf', path.join(out, 'ok.tar.gz')]).toString()
      assert.match(list, /app\.db/)
      assert.match(list, /uploads\/cat\.png/)

      // письмо ушло получателю с вложением, пароль в письме не упоминается
      const mails = (await readFile(mailFile, 'utf8')).trim().split('\n').map(l => JSON.parse(l))
      assert.equal(mails.length, 1)
      assert.equal(mails[0].to, 'me@example.org')
      assert.match(mails[0].files[0], /\.tar\.gz\.enc$/)
      assert.ok(!JSON.stringify(mails).includes('секретная фраза'))
    } finally {
      disk.close()
    }
  })

  test('неверный пароль приложения Диска: ошибка видна, почта всё равно уходит', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-arch-'))
    const bad = http.createServer((_, res) => res.writeHead(401).end())
    await new Promise(r => bad.listen(0, '127.0.0.1', r))
    const s = await start({
      dir,
      env: { BACKUP_AUTO: '0', BACKUP_PASSPHRASE: 'p', YADISK_LOGIN: 'a', YADISK_PASSWORD: 'b', YADISK_URL: `http://127.0.0.1:${bad.address().port}`, MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), BACKUP_MAIL_TO: 'x@example.org' },
    })
    try {
      await s.call('POST', '/api/backup/run', OWNER)
      const a = await wait(s)
      assert.equal(a.last.disk, 'fail')
      assert.equal(a.last.mail, 'ok')
      assert.equal(a.last.ok, true)
      assert.match(a.last.message, /логин или пароль/)
    } finally {
      bad.close()
    }
  })
})

describe('сервер: проверка отправки', () => {
  test('кладёт проверочный файл в папку backup_korean и шлёт письмо; без настроек говорит об этом', async () => {
    const none = await start({ env: { BACKUP_AUTO: '0' } })
    assert.equal((await none.call('POST', '/api/backup/test')).status, 401)
    assert.match((await (await none.call('POST', '/api/backup/test', OWNER)).json()).message, /некуда/)

    const disk = await fakeDisk()
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-chk-'))
    const s = await start({ dir, env: { BACKUP_AUTO: '0', YADISK_LOGIN: 'a', YADISK_PASSWORD: 'b', YADISK_URL: disk.url, MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), BACKUP_MAIL_TO: 'x@example.org' } })
    try {
      const r = await (await s.call('POST', '/api/backup/test', OWNER)).json()
      assert.deepEqual([r.disk, r.mail, r.message], ['ok', 'ok', ''])
      assert.ok([...disk.files.keys()].some(k => k.startsWith('/backup_korean/')))
    } finally {
      disk.close()
    }
  })
})
