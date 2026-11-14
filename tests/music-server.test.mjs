import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Подставной yt-dlp: на «--dump-single-json» отдаёт название, иначе пишет звук и обложку и печатает процент. */
async function stubYtdlp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'ytdlp-stub-'))
  const bin = path.join(dir, 'yt-dlp')
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs')
const a = process.argv.slice(2)
if (a.includes('--dump-single-json')) {
  if (a.at(-1).includes('private')) { console.error('ERROR: [youtube] x: Private video. Sign in if you\\'ve been granted access'); process.exit(1) }
  console.log(JSON.stringify({ title: 'Тестовая песня', duration: 183 })); process.exit(0)
}
const out = a[a.indexOf('-o') + 1].replace('%(ext)s', 'm4a')
setTimeout(() => {
  console.log('  10.0%'); console.log(' 100.0%') // настоящий yt-dlp печатает процент без слова download:
  fs.writeFileSync(out, Buffer.alloc(4096, 7))
  fs.writeFileSync(out.replace(/\\.m4a$/, '.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  process.exit(0)
}, 700)
`)
  await chmod(bin, 0o755)
  return bin
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

describe('сервер: музыкальный плеер', () => {
  let s
  before(async () => (s = await start({ env: { YTDLP_BIN: await stubYtdlp() } })))
  const get = async p => (await (await s.call('GET', p, OWNER)).json())
  const waitJob = async id => {
    for (let i = 0; i < 80; i++) {
      const job = (await get('/api/music')).jobs.find(j => j.id === id)
      if (job && (job.stage === 'done' || job.stage === 'error')) return job
      await sleep(150)
    }
    throw new Error('задание не закончилось')
  }
  const uploadFile = (name, bytes, title, category) => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    if (title) form.append('title', title)
    if (category) form.append('category', category)
    return fetch(s.base + '/api/music/upload', { method: 'POST', headers: { Authorization: `Bearer ${OWNER}` }, body: form })
  }

  test('без токена и гостю плеер закрыт', async () => {
    assert.equal((await s.call('GET', '/api/music')).status, 401)
    assert.equal((await s.call('POST', '/api/music/url', undefined, { url: 'https://example.com/v' })).status, 401)
  })

  test('сначала пусто; чужой формат и плохая ссылка отклоняются', async () => {
    assert.deepEqual(await get('/api/music'), { tracks: [], jobs: [] })
    assert.equal((await uploadFile('virus.exe', Buffer.alloc(100))).status, 400)
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'не ссылка', 'https://a.b/c d', '']) {
      assert.equal((await s.call('POST', '/api/music/url', OWNER, { url })).status, 400, url)
    }
  })

  test('файл с компьютера: задание доходит до «готово», песня в списке, играет по подписанной ссылке с перемоткой', async () => {
    const bytes = Buffer.alloc(10_000, 3)
    const res = await uploadFile('Моя_песня.mp3', bytes)
    assert.equal(res.status, 202)
    const job = await waitJob((await res.json()).job)
    assert.equal(job.stage, 'done', job.error)
    const { tracks } = await get('/api/music')
    assert.equal(tracks.length, 1)
    assert.equal(tracks[0].title, 'Моя песня')
    assert.equal(tracks[0].source, 'upload')
    assert.equal(tracks[0].size, 10_000)

    const { url } = await get(`/api/music/${tracks[0].id}/url`)
    const full = await fetch(s.base + url)
    assert.equal(full.status, 200)
    assert.equal(Buffer.from(await full.arrayBuffer()).length, 10_000)
    const part = await fetch(s.base + url, { headers: { Range: 'bytes=100-199' } })
    assert.equal(part.status, 206)
    assert.equal(Buffer.from(await part.arrayBuffer()).length, 100)

    const bad = url.replace(/s=[a-f0-9]{4}/, 's=0000')
    assert.equal((await fetch(s.base + bad)).status, 403, 'подделанная подпись')
    assert.equal((await fetch(s.base + url.replace(/e=\d+/, 'e=1'))).status, 403, 'срок вышел')
    assert.equal((await fetch(s.base + `/api/music/${tracks[0].id}/stream`)).status, 403, 'без подписи')
  })

  test('ссылка: yt-dlp скачивает, название и обложка из ссылки, второе задание одновременно получает 409', async () => {
    const first = await s.call('POST', '/api/music/url', OWNER, { url: 'https://example.com/watch?v=abc' })
    assert.equal(first.status, 202)
    const second = await s.call('POST', '/api/music/url', OWNER, { url: 'https://example.com/watch?v=def' })
    assert.equal(second.status, 409)
    const id = (await first.json()).job
    const job = await waitJob(id)
    assert.equal(job.stage, 'done', job.error)
    assert.equal(job.percent, 100)
    const { tracks } = await get('/api/music')
    const t = tracks.find(x => x.title === 'Тестовая песня')
    assert.ok(t, 'песня появилась')
    assert.equal(t.duration, 183)
    assert.equal(t.source, 'url')
    assert.ok(t.cover, 'обложка из ссылки')
    const cover = await fetch(s.base + t.cover)
    assert.equal(cover.status, 200)
    assert.equal(Buffer.from(await cover.arrayBuffer()).length, 4)
  })

  test('ошибка yt-dlp объясняется по-русски, а задание остаётся в списке с текстом ошибки', async () => {
    const res = await s.call('POST', '/api/music/url', OWNER, { url: 'https://example.com/private' })
    assert.equal(res.status, 202)
    const job = await waitJob((await res.json()).job)
    assert.equal(job.stage, 'error')
    assert.match(job.error, /недоступно/)
  })

  test('вкладки: по умолчанию «тихая музыка», можно указать Nightcore, перенести и отклонить чужую', async () => {
    const quiet = await uploadFile('а.mp3', Buffer.alloc(500, 1), 'Тихая')
    assert.equal(quiet.status, 202)
    const night = await uploadFile('б.mp3', Buffer.alloc(500, 2), 'Найткор', 'nightcore')
    assert.equal(night.status, 202)
    assert.equal((await uploadFile('в.mp3', Buffer.alloc(500, 3), 'Чужая', 'jazz')).status, 400)
    await waitJob((await quiet.json()).job)
    await waitJob((await night.json()).job)
    const cats = Object.fromEntries((await get('/api/music')).tracks.map(t => [t.title, t.category]))
    assert.equal(cats['Тихая'], 'quiet')
    assert.equal(cats['Найткор'], 'nightcore')

    const url = await s.call('POST', '/api/music/url', OWNER, { url: 'https://example.com/watch?v=nc', category: 'nightcore' })
    assert.equal(url.status, 202)
    assert.equal((await waitJob((await url.json()).job)).stage, 'done')
    assert.equal((await get('/api/music')).tracks.filter(t => t.source === 'url' && t.category === 'nightcore').length >= 1, true, 'ссылка с вкладкой nightcore')
    assert.equal((await s.call('POST', '/api/music/url', OWNER, { url: 'https://example.com/x', category: 'jazz' })).status, 400)

    const t = (await get('/api/music')).tracks.find(x => x.title === 'Тихая')
    const moved = await s.call('PATCH', `/api/music/${t.id}`, OWNER, { category: 'nightcore' })
    assert.equal((await moved.json()).category, 'nightcore')
    assert.equal((await s.call('PATCH', `/api/music/${t.id}`, OWNER, { category: 'jazz' })).status, 400)
    assert.equal((await s.call('PATCH', `/api/music/${t.id}`, OWNER, {})).status, 400, 'пустое изменение')
    assert.equal((await (await s.call('PATCH', `/api/music/${t.id}`, OWNER, { title: 'Новое' })).json()).category, 'nightcore', 'вкладка не слетает при смене названия')
  })

  test('переименовать и удалить; после удаления файл не открывается', async () => {
    const { tracks } = await get('/api/music')
    const t = tracks[0]
    const r = await s.call('PATCH', `/api/music/${t.id}`, OWNER, { title: '  Новое   имя ' })
    assert.equal((await r.json()).title, 'Новое имя')
    assert.equal((await s.call('PATCH', `/api/music/${t.id}`, OWNER, { title: '   ' })).status, 400)
    const { url } = await get(`/api/music/${t.id}/url`)
    assert.equal((await s.call('DELETE', `/api/music/${t.id}`, OWNER)).status, 200)
    assert.equal((await fetch(s.base + url)).status, 404)
    assert.equal((await get('/api/music')).tracks.some(x => x.id === t.id), false)
    assert.equal((await s.call('DELETE', `/api/music/${t.id}`, OWNER)).status, 404)
  })
})
