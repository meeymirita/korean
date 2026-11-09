// Сайт на Nuxt: собирается (nuxt build), запускается настоящий сервер Nuxt вместе с сервером API, и проверяется то,
// что видят поисковик и браузер: готовый HTML открытых страниц, SEO, robots.txt, sitemap.xml, 404, перенаправления, заголовки.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { close, load } from './_load.mjs'
import { OWNER, cleanup, start } from './_server.mjs'

const root = fileURLToPath(new URL('../frontend/', import.meta.url))
const { SITE, seoFor, indexablePaths, privatePaths } = await load('/src/data/seo.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)
after(cleanup)

const freePort = () =>
  new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

let base, web, api
before(async () => {
  api = await start()
  execFileSync(process.execPath, [fileURLToPath(new URL('../frontend/node_modules/nuxt/bin/nuxt.mjs', import.meta.url)), 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, API_PORT: new URL(api.base).port } })
  const port = await freePort()
  web = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NUXT_API_BASE: api.base }, stdio: 'ignore' })
  base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/about')).ok) return
    } catch {
      /* ещё запускается */
    }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('сервер Nuxt не запустился')
}, { timeout: 240_000 })
after(() => web?.kill())

const get = p => fetch(base + p, { redirect: 'manual' })
const page = async p => (await get(p)).text()
/** Содержимое <meta name="robots"> (слово noindex встречается и в служебных данных страницы, поэтому смотрим только тег). */
const robotsMeta = html => html.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? ''

describe('Nuxt: готовый HTML открытых страниц', () => {
  test('у каждой открытой страницы свой title, description, canonical, og:url и проверка Яндекса', async () => {
    for (const p of indexablePaths()) {
      const res = await get(p)
      assert.equal(res.status, 200, p)
      const html = await res.text()
      const s = seoFor(p)
      const url = SITE + (p === '/' ? '/' : p)
      assert.ok(html.includes(`<title>${s.title.replace(/&/g, '&amp;')}</title>`), `title ${p}`)
      assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `canonical ${p}`)
      assert.ok(html.includes(`<meta property="og:url" content="${url}">`), `og:url ${p}`)
      assert.ok(html.includes(`content="${s.description.replace(/&/g, '&amp;')}"`), `description ${p}`)
      assert.ok(html.includes('name="yandex-verification" content="7e91f055e8c3fe9f"'), `проверка Яндекса ${p}`)
      assert.ok(html.includes('name="google-site-verification" content="gmPNUAXLfo28woGDW-c9NAMEAXEOm15RIeGPajRfETA"'), `проверка Google ${p}`)
      assert.ok(html.includes('name="msvalidate.01" content="40B2022D5821E649AD18F1A4AA804AE7"'), `проверка Bing ${p}`)
      assert.match(html, /<html\s+lang="ru"/, `язык ${p}`)
      assert.ok(html.includes('application/ld+json'), `schema.org ${p}`)
      assert.equal((html.match(/<title>/g) ?? []).length, 1, `один title ${p}`)
      assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, `один canonical ${p}`)
      assert.ok(!/>undefined<|\[object Object\]/.test(html), `мусор в ${p}`)
    }
  })

  test('в HTML настоящее содержимое: «О платформе» и большой словарь (слова, грамматика и справочник теперь по токену и на сервере не рисуются)', async () => {
    assert.ok((await page('/about')).includes('Личный кабинет'), 'слайды «О платформе»')
    const dict = await page('/dict')
    assert.ok(dict.includes('Большой корейско-русский словарь') && dict.includes('name="robots" content="index, follow'), '/dict открыт и индексируется')
    for (const p of ['/korean/words', '/korean/grammar', '/korean/ref/cheat']) assert.ok((await page(p)).includes('<div id="__nuxt"></div>'), `${p} только оболочка приложения`)
  })

  test('главная рисуется на каждый запрос: фраза и слово дня меняются, а прошлая фраза помнится в cookie', async () => {
    const first = await get('/')
    assert.match(first.headers.get('set-cookie') ?? '', /ui_phrase_last=\d+/)
    // фраза, слово и правило дня (блоки .val на главной): за 6 обновлений хотя бы раз другие
    const picks = new Set()
    for (let i = 0; i < 6; i++) picks.add([...(await page('/')).matchAll(/class="val ko"[^>]*>([^<]+)</g)].map(m => m[1]).join(' | '))
    assert.ok(picks.size > 1, 'фраза и слово дня не меняются от запроса к запросу')
  })
})

describe('Nuxt: закрытые страницы, ошибки, перенаправления', () => {
  test('закрытые токеном страницы не рисуются на сервере (только оболочка приложения) и закрыты от индексации', async () => {
    assert.deepEqual(privatePaths().sort(), ['/game/home', '/korean/cabinet', '/korean/chat', '/korean/culture', '/korean/exam', '/korean/forms', '/korean/garden', '/korean/grammar', '/korean/know', '/korean/lab', '/korean/marks', '/korean/mistakes', '/korean/ref/alphabet', '/korean/ref/cheat', '/korean/ref/hangul', '/korean/ref/numbers', '/korean/ref/reading', '/korean/ref/sentences', '/korean/ref/talk', '/korean/review', '/korean/services', '/korean/shop', '/korean/sites', '/korean/today', '/korean/words', '/upload'])
    for (const p of privatePaths()) {
      const res = await get(p)
      assert.equal(res.status, 200, p)
      const html = await res.text()
      assert.ok(html.includes('<div id="__nuxt"></div>'), `${p} рисуется только в браузере`)
      assert.equal(seoFor(p).noindex, true)
    }
  })

  test('неизвестный адрес: страница 404 с настоящим кодом и noindex', async () => {
    const res = await get('/нет-такой-страницы')
    assert.equal(res.status, 404)
    const html = await res.text()
    assert.ok(html.includes('Такой страницы нет'))
    assert.equal(robotsMeta(html), 'noindex, nofollow')
  })

  test('старые адреса ведут на новые', async () => {
    for (const [from, to] of [['/korean/cheat', '/korean/ref/cheat'], ['/korean/progress', '/korean/cabinet'], ['/korean/trainers', '/game/home?game=match'], ['/game/quick', '/game/home?game=quick'], ['/korean', '/korean/home']]) {
      const res = await get(from)
      assert.ok([301, 302].includes(res.status), `${from}: ${res.status}`)
      assert.ok(res.headers.get('location').endsWith(to), `${from} → ${res.headers.get('location')}`)
    }
  })

  test('заголовки безопасности у страниц сайта', async () => {
    const h = (await get('/korean/words')).headers
    assert.equal(h.get('x-content-type-options'), 'nosniff')
    assert.equal(h.get('x-frame-options'), 'DENY')
    assert.ok(h.get('referrer-policy'))
    assert.ok(h.get('permissions-policy')?.includes('camera=()'))
  })
})

describe('Nuxt: robots.txt, sitemap.xml, визитка', () => {
  test('robots.txt закрывает закрытые страницы и API, но открывает визитку', async () => {
    const robots = await page('/robots.txt')
    for (const p of privatePaths()) assert.ok(robots.includes(`Disallow: ${p}`), `${p} не закрыт в robots.txt`)
    assert.ok(robots.includes('Disallow: /api/'))
    assert.ok(robots.includes('Allow: /api/public/'))
    for (const rule of ['Allow: /dict', 'Allow: /korean/home', 'Disallow: /korean/', 'Disallow: /upload', 'Disallow: /game']) assert.ok(robots.includes(rule), `${rule} нет в robots.txt`)
    assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap_index.xml`))
  })

  test('карта сайта: sitemap.xml ведёт на индекс, в кусках все открытые страницы, без закрытых и без повторов', async () => {
    const old = await get('/sitemap.xml')
    assert.ok([301, 302, 307, 308].includes(old.status), `sitemap.xml: ${old.status}`)
    const index = await page('/sitemap_index.xml')
    const parts = [...index.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname)
    assert.ok(parts.length >= 1, 'в индексе нет ни одного куска')
    const locs = []
    for (const part of parts) locs.push(...[...(await page(part)).matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]))
    assert.equal(new Set(locs).size, locs.length)
    for (const p of indexablePaths()) assert.ok(locs.includes(p === '/' ? `${SITE}/` : `${SITE}${p}`), `${p} нет в карте сайта`)
    for (const p of privatePaths()) assert.ok(!locs.includes(`${SITE}${p}`), `${p} закрыт, но есть в карте сайта`)
    // кроме постоянных страниц в карте могут быть только слова большого словаря (их отдаёт API, в тесте индекса словаря нет)
    const extra = locs.filter(l => !indexablePaths().some(p => l === (p === '/' ? `${SITE}/` : `${SITE}${p}`)))
    assert.ok(extra.every(l => l.startsWith(`${SITE}/dict/`)), `в карте лишнее: ${extra.slice(0, 5).join(' ')}`)
  })

  test('визитка /me: закрытая не индексируется, открытая рисуется на сервере с данными из API', async () => {
    const closed = await page('/me')
    assert.ok(closed.includes('Эта страница закрыта'))
    assert.equal(robotsMeta(closed), 'noindex, nofollow')
    const card = { name: 'Тестовый ученик', avatar: '🌸', level: 3, title: 'Искра', streak: 2, learned: 5, answers: 9, days: 10 }
    const r = await api.call('PUT', '/api/public/settings', OWNER, { enabled: true, cover: '', card })
    assert.equal(r.status, 200)
    // визитка кэшируется на 60 с (swr): свежая версия приходит со следующим запросом после обновления в фоне
    let html = ''
    for (let i = 0; i < 30 && !html.includes('Тестовый ученик'); i++) {
      html = await page('/me?t=' + i) // другой адрес — мимо кэша
      await new Promise(r => setTimeout(r, 100))
    }
    assert.ok(html.includes('Тестовый ученик'), 'имя из визитки в готовом HTML')
    assert.match(robotsMeta(html), /^index, follow/, 'открытая визитка индексируется')
  })
})
