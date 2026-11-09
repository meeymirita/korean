import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { SITE, seoFor, indexablePaths, privatePaths } = await load('/src/data/seo.ts')
after(close)

const file = p => readFileSync(new URL(`../frontend/${p}`, import.meta.url), 'utf8')
// robots.txt, sitemap.xml и <head> каждой страницы теперь собирает Nuxt: они проверяются на живом сайте в nuxt-ssr.test.mjs

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

  test('закрытые токеном страницы помечены noindex', () => {
    assert.deepEqual(privatePaths().sort(), ['/game/home', '/korean/cabinet', '/korean/chat', '/korean/culture', '/korean/exam', '/korean/forms', '/korean/garden', '/korean/grammar', '/korean/know', '/korean/lab', '/korean/marks', '/korean/mistakes', '/korean/ref/alphabet', '/korean/ref/cheat', '/korean/ref/hangul', '/korean/ref/numbers', '/korean/ref/reading', '/korean/ref/sentences', '/korean/ref/talk', '/korean/review', '/korean/services', '/korean/shop', '/korean/sites', '/korean/today', '/korean/words', '/upload'])
    for (const p of privatePaths()) assert.equal(seoFor(p).noindex, true)
  })

  test('у каждой страницы из seo.ts есть файл в src/pages', () => {
    for (const p of [...indexablePaths(), ...privatePaths()]) {
      const f = p === '/' ? 'index' : p.slice(1)
      const at = x => existsSync(new URL(`../frontend/src/pages/${x}`, import.meta.url))
      assert.ok(at(`${f}.vue`) || at(`${f}/index.vue`), `нет src/pages/${f}.vue для ${p}`)
    }
  })

  test('страницы слов большого словаря открыты для поисковиков и названы по слову', () => {
    assert.equal(seoFor('/dict/가다').noindex, undefined)
    assert.ok(seoFor('/dict/가다').title.startsWith('가다'))
    assert.equal(seoFor('/dict').noindex, undefined)
  })

  test('неизвестный адрес и адрес со слешем на конце получают нормальные данные', () => {
    assert.equal(seoFor('/korean/words/').title, seoFor('/korean/words').title)
    assert.equal(seoFor('/нет-такой').noindex, true)
  })

  test('nuxt.config.ts: проверка Яндекса, язык, манифест и значки в <head> всех страниц', () => {
    const cfg = file('nuxt.config.ts')
    for (const must of ["content: '7e91f055e8c3fe9f'", "lang: 'ru'", "rel: 'manifest'", "name: 'theme-color'", "rel: 'icon'", "'@nuxtjs/robots'", "'@nuxtjs/sitemap'", "'nuxt-schema-org'"]) {
      assert.ok(cfg.includes(must), `в nuxt.config.ts нет ${must}`)
    }
  })

  test('файлы, на которые ссылаются метатеги, существуют', () => {
    for (const f of ['public/og-image.png', 'public/favicon.svg', 'public/favicon-32.png', 'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png', 'public/manifest.webmanifest']) {
      assert.ok(existsSync(new URL(`../frontend/${f}`, import.meta.url)), f)
    }
    const m = JSON.parse(file('public/manifest.webmanifest'))
    assert.equal(m.lang, 'ru')
    assert.ok(m.icons.length >= 2)
  })

  test('в public нет тяжёлых лишних файлов (всё из public попадает на сайт)', () => {
    for (const f of readdirSync(new URL('../frontend/public/', import.meta.url))) {
      if (f === 'demo.webm') continue // видео-обзор для окна на главной: грузится только по нажатию, поэтому может быть тяжёлым
      assert.ok(statSync(new URL(`../frontend/public/${f}`, import.meta.url)).size < 600 * 1024, `${f} слишком большой`)
    }
  })
})

