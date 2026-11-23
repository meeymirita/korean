import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TOKEN } from '../src/config'
import { ManhwaController, MANHWA_DIR } from '../src/manhwa/manhwa.controller'
import { signPath, verifySigned } from '../src/music/music.util'

const disk = { configured: () => false }
const res = () => {
  const r = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), sendFile: vi.fn(), redirect: vi.fn() }
  r.status.mockReturnValue(r)
  return r
}
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)])
const file = (buffer: Buffer) => ({ buffer, size: buffer.length }) as never
/** разбор подписанной ссылки `/api/manhwa/…?e=…&s=…` */
const parts = (url: string) => {
  const u = new URL(url, 'http://x')
  return { path: u.pathname, e: u.searchParams.get('e')!, s: u.searchParams.get('s')! }
}

function book(slug: string, chapters: unknown) {
  mkdirSync(path.join(MANHWA_DIR, slug, '1'), { recursive: true })
  writeFileSync(path.join(MANHWA_DIR, slug, 'index.json'), JSON.stringify({ title: 'Тест', chapters }))
  writeFileSync(path.join(MANHWA_DIR, slug, '1', '001.jpg'), JPG)
}

describe('манхва', () => {
  it('полка: обложка главы подписана, список глав отдаёт ссылки на страницы', async () => {
    book('shelf-a', [{ n: 1, cv: 'cover.jpg', pages: [{ f: '001.jpg', w: 10, h: 20 }] }])
    const c = new ManhwaController(disk as never)
    const { books } = await c.shelf()
    const b = books.find(x => x.slug === 'shelf-a')!
    expect([b.title, b.chapters, b.ownCover]).toEqual(['Тест', [1], false])
    const p = parts(b.cover!)
    expect(p.path).toBe('/api/manhwa/shelf-a/1/cover.jpg')
    expect(verifySigned(p.path, p.e, p.s, TOKEN)).toBe(true)
    const full = await c.book('shelf-a')
    expect(full.chapters[0]!.pages[0]).toMatchObject({ w: 10, h: 20 })
    await expect(c.book('Bad Name')).rejects.toThrow()
    await expect(c.book('no-such')).rejects.toThrow()
  })

  it('страница отдаётся только по верной подписи и только с допустимым именем', async () => {
    book('pages-a', [{ n: 1, pages: [{ f: '001.jpg', w: 1, h: 1 }] }])
    const c = new ManhwaController(disk as never)
    const { chapters } = await c.book('pages-a')
    const p = parts(chapters[0]!.pages[0]!.u)
    const ok = res()
    await c.page('pages-a', '1', '001.jpg', p.e, p.s, ok as never)
    expect(ok.sendFile).toHaveBeenCalledWith(path.join(MANHWA_DIR, 'pages-a', '1', '001.jpg'))
    const bad = res()
    await c.page('pages-a', '1', '001.jpg', p.e, 'x'.repeat(32), bad as never)
    expect(bad.status).toHaveBeenCalledWith(403)
    for (const f of ['../index.json', '1.jpg', 'cover.png']) await expect(c.page('pages-a', '1', f, p.e, p.s, res() as never)).rejects.toThrow()
  })

  it('своя обложка: принимает картинку, отклоняет не картинку, замена удаляет прежнюю и попадает на полку', async () => {
    book('cover-a', [{ n: 1, pages: [{ f: '001.jpg', w: 1, h: 1 }] }])
    const c = new ManhwaController(disk as never)
    await expect(c.setCover('cover-a', undefined)).rejects.toThrow()
    await expect(c.setCover('cover-a', file(Buffer.from('это не картинка')))).rejects.toThrow()
    const first = await c.setCover('cover-a', file(JPG))
    const dir = path.join(MANHWA_DIR, 'cover-a')
    const own = () => readdirSync(dir).filter(f => f.startsWith('cover-'))
    expect(own()).toHaveLength(1)
    expect(JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')).cover).toBe(own()[0])
    let b = (await c.shelf()).books.find(x => x.slug === 'cover-a')!
    expect(b.ownCover).toBe(true)
    expect(b.cover).toBe(first.cover)
    // замена: старый файл удалён, имя новое
    await new Promise(r => setTimeout(r, 5))
    const oldName = own()[0]
    await c.setCover('cover-a', file(JPG))
    expect(own()).toHaveLength(1)
    expect(own()[0]).not.toBe(oldName)
    b = (await c.shelf()).books.find(x => x.slug === 'cover-a')!
    // файл обложки отдаётся по подписи, с чужой подписью отказ
    const p = parts(b.cover!)
    const r = res()
    await c.coverFile('cover-a', path.basename(p.path), p.e, p.s, r as never)
    expect(r.sendFile).toHaveBeenCalled()
    const denied = res()
    await c.coverFile('cover-a', path.basename(p.path), p.e, 'x'.repeat(32), denied as never)
    expect(denied.status).toHaveBeenCalledWith(403)
    expect(existsSync(path.join(dir, own()[0]!))).toBe(true)
  })

  it('Диск занят (423): сохранение обложки повторяется, а при долгой блокировке отвечает понятным 503', async () => {
    book('busy-a', [{ n: 1, pages: [{ f: '001.jpg', w: 1, h: 1 }] }])
    vi.useFakeTimers()
    try {
      const busy = () => Promise.reject(new Error('yadisk 423: Ресурс заблокирован'))
      let calls = 0
      const flaky = { configured: () => true, put: vi.fn(() => (++calls <= 2 ? busy() : Promise.resolve())), remove: vi.fn(), forgetLink: vi.fn(), link: vi.fn() }
      const ok = new ManhwaController(flaky as never)
      const warm = (c: ManhwaController) => (c as unknown as { cache: Map<string, unknown> }).cache.set('busy-a', { until: Date.now() + 60_000, data: { chapters: [] } }) // индекс уже в памяти: не ходим на Диск за ним
      warm(ok)
      const done = ok.setCover('busy-a', file(JPG))
      await vi.advanceTimersByTimeAsync(20_000)
      expect((await done).cover).toContain('/api/manhwa/busy-a/cover-')
      expect(flaky.put).toHaveBeenCalledTimes(4) // две неудачи, картинка, index.json

      const stuck = new ManhwaController({ configured: () => true, put: () => busy(), remove: vi.fn(), forgetLink: vi.fn() } as never)
      warm(stuck)
      const failed = stuck.setCover('busy-a', file(JPG)).catch((e: Error) => e)
      await vi.advanceTimersByTimeAsync(60_000)
      const err = (await failed) as { getStatus(): number; getResponse(): { error: string } }
      expect(err.getStatus()).toBe(503)
      expect(err.getResponse().error).toContain('Диск сейчас занят')
    } finally {
      vi.useRealTimers()
    }
  })

  it('страница с Диска: при сбое Диска просим ссылку ещё раз, файл ложится в кэш и дальше отдаётся без Диска', async () => {
    vi.useFakeTimers()
    const realFetch = globalThis.fetch
    try {
      let calls = 0
      const disk2 = { configured: () => true, cachedLink: vi.fn(() => (++calls === 1 ? Promise.reject(new Error('yadisk 429: слишком много запросов')) : Promise.resolve('https://disk.example/p'))) }
      const download = vi.fn(async () => new Response(JPG, { status: 200 }))
      globalThis.fetch = download as never
      const c = new ManhwaController(disk2 as never)
      const s = signPath('/api/manhwa/disk-a/1/cover.jpg', TOKEN, 1795564800000 - 2 * 24 * 3600_000, 2 * 24 * 3600_000)
      const p = parts(s)
      const r = res()
      const done = c.page('disk-a', '1', 'cover.jpg', p.e, p.s, r as never)
      await vi.advanceTimersByTimeAsync(5_000)
      await done
      expect(disk2.cachedLink).toHaveBeenCalledTimes(2)
      expect(download).toHaveBeenCalledTimes(1)
      expect(r.sendFile).toHaveBeenCalledWith(expect.stringContaining('manhwa-cache'))
      // второй запрос: файл уже у нас, ни ссылки Диска, ни скачивания
      const r2 = res()
      await c.page('disk-a', '1', 'cover.jpg', p.e, p.s, r2 as never)
      expect(r2.sendFile).toHaveBeenCalledTimes(1)
      expect(disk2.cachedLink).toHaveBeenCalledTimes(2)
      expect(download).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = realFetch
      vi.useRealTimers()
    }
  })

  it('не вышло скачать в кэш: перенаправление на ссылку Диска', async () => {
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = (async () => new Response('нет', { status: 500 })) as never
      const disk3 = { configured: () => true, cachedLink: vi.fn().mockResolvedValue('https://disk.example/q') }
      const c = new ManhwaController(disk3 as never)
      const p = parts(signPath('/api/manhwa/disk-b/1/001.jpg', TOKEN, 1795564800000 - 2 * 24 * 3600_000, 2 * 24 * 3600_000))
      const r = res()
      await c.page('disk-b', '1', '001.jpg', p.e, p.s, r as never)
      expect(r.redirect).toHaveBeenCalledWith(302, 'https://disk.example/q')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
