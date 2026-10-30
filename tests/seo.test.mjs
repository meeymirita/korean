import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { SITE, seoFor, indexablePaths, privatePaths } = await load('/src/data/seo.ts')
after(close)

const file = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sitemap = file('public/sitemap.xml')
const robots = file('public/robots.txt')
const html = file('index.html')

describe('SEO', () => {
  test('у каждой открытой страницы свой заголовок и описание нужной длины', () => {
    const titles = new Set()
    for (const p of indexablePaths()) {
      const s = seoFor(p)
      assert.ok(s.title.length >= 20 && s.title.length <= 75, `заголовок ${p}: ${s.title.length} символов`)
      assert.ok(s.description.length >= 60 && s.description.length <= 190, `описание ${p}: ${s.description.length} символов`)
      assert.ok(!titles.has(s.title), `повтор заголовка ${p}`)
      titles.add(s.title)
      assert.ok(s.title.includes('우리말'), `в заголовке ${p} нет названия платформы`)
    }
  })

  test('закрытые токеном страницы не индексируются, а в карту сайта и robots они не попадают как разрешённые', () => {
    assert.deepEqual(privatePaths().sort(), ['/game', '/korean/cabinet', '/korean/garden', '/korean/mistakes', '/korean/quick', '/korean/review', '/korean/today', '/korean/trainers'])
    for (const p of privatePaths()) {
      assert.equal(seoFor(p).noindex, true)
      assert.ok(!sitemap.includes(`${SITE}${p}<`), `${p} в карте сайта`)
      assert.ok(robots.includes(`Disallow: ${p}`), `${p} не закрыт в robots.txt`)
    }
    assert.ok(robots.includes('Disallow: /api/'))
  })

  test('карта сайта: все открытые страницы есть, адреса полные и без повторов', () => {
    const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1])
    assert.equal(new Set(locs).size, locs.length)
    for (const p of indexablePaths()) assert.ok(locs.includes(p === '/' ? `${SITE}/` : `${SITE}${p}`), `${p} нет в sitemap.xml`)
    assert.equal(locs.length, indexablePaths().length, 'в карте нет лишнего')
    assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`))
  })

  test('неизвестный адрес и адрес со слешем на конце получают нормальные данные', () => {
    assert.equal(seoFor('/korean/words/').title, seoFor('/korean/words').title)
    assert.equal(seoFor('/нет-такой').noindex, true)
  })

  test('index.html: описание, canonical, Open Graph, Twitter, манифест, JSON-LD и запасной текст без JS', () => {
    for (const must of ['name="description"', 'rel="canonical"', 'property="og:title"', 'property="og:image"', 'name="twitter:card"', 'rel="manifest"', 'application/ld+json', '<noscript>', '<html lang="ru">', 'name="theme-color"', 'name="yandex-verification" content="7e91f055e8c3fe9f"']) {
      assert.ok(html.includes(must), `в index.html нет ${must}`)
    }
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
    assert.ok(ld['@graph'].some(n => n['@type'] === 'WebSite'))
  })

  test('файлы, на которые ссылаются метатеги, существуют', () => {
    for (const f of ['public/og-image.png', 'public/favicon.svg', 'public/favicon-32.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png', 'public/manifest.webmanifest']) {
      assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f)
    }
    const m = JSON.parse(file('public/manifest.webmanifest'))
    assert.equal(m.lang, 'ru')
    assert.ok(m.icons.length >= 2)
  })

  test('в public нет тяжёлых лишних файлов (всё из public попадает на сайт)', () => {
    for (const f of readdirSync(new URL('../public/', import.meta.url))) {
      assert.ok(statSync(new URL(`../public/${f}`, import.meta.url)).size < 600 * 1024, `${f} слишком большой`)
    }
  })
})

