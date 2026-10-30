import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { close, load } from './_load.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const { SITE, indexablePaths, privatePaths, seoFor } = await load('/src/data/seo.ts')
after(close)

let out
before(() => {
  out = mkdtempSync(path.join(tmpdir(), 'prerender-'))
  // шаблон — исходный index.html (в нём нет хэшированных скриптов, но метатеги и <div id="app"> те же)
  execFileSync(process.execPath, [path.join(root, 'scripts/prerender.mjs')], { env: { ...process.env, TEMPLATE: path.join(root, 'index.html'), OUT_DIR: out }, stdio: 'pipe' })
})
after(() => rmSync(out, { recursive: true, force: true }))

const page = p => readFileSync(p === '/' ? path.join(out, 'index.html') : path.join(out, p, 'index.html'), 'utf8')

describe('предварительная отрисовка для SEO', () => {
  test('для каждой открытой страницы создан файл, для закрытых токеном нет', () => {
    for (const p of indexablePaths()) assert.ok(existsSync(p === '/' ? path.join(out, 'index.html') : path.join(out, p, 'index.html')), p)
    for (const p of privatePaths()) assert.ok(!existsSync(path.join(out, p, 'index.html')), `${p} не должен быть отрисован`)
  })

  test('у каждой страницы свой title, description, canonical и Open Graph, а проверка Яндекса сохранена', () => {
    for (const p of indexablePaths()) {
      const html = page(p)
      const s = seoFor(p)
      const url = SITE + (p === '/' ? '/' : p)
      assert.ok(html.includes(`<title>${s.title.replace(/&/g, '&amp;')}</title>`), `title ${p}`)
      assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `canonical ${p}`)
      assert.ok(html.includes(`<meta property="og:url" content="${url}">`), `og:url ${p}`)
      assert.ok(html.includes('name="yandex-verification"'), `проверка Яндекса ${p}`)
      assert.equal((html.match(/<title>/g) ?? []).length, 1, `один title ${p}`)
      assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, `один canonical ${p}`)
    }
  })

  test('в заготовке настоящее содержимое: заголовок h1, ссылки на разделы, а нигде нет «undefined» и «[object»', () => {
    for (const p of indexablePaths()) {
      const html = page(p)
      assert.match(html, /<div id="app"><div class="seo-shell">/, `заготовка ${p}`)
      assert.match(html, /<h1>[^<]+<\/h1>/, `h1 ${p}`)
      assert.ok(html.includes('href="/korean/words"') && html.includes('href="/korean/grammar"'), `ссылки на разделы ${p}`)
      assert.ok(!/undefined|\[object/.test(html), `мусор в ${p}`)
    }
  })

  test('словарь, грамматика, алфавит, примеры и справочники содержат свои данные', () => {
    const words = page('/korean/words')
    assert.ok(words.includes('사람') && words.includes('чингу') && words.includes('друг'))
    assert.ok((words.match(/<tr>/g) ?? []).length > 500, 'в таблице весь словарь')
    const grammar = page('/korean/grammar')
    assert.ok(grammar.includes('이에요') && grammar.includes('Урок 1'))
    assert.ok((grammar.match(/<article /g) ?? []).length >= 20, 'все правила')
    assert.ok(page('/korean/ref/alphabet').includes('ㄱ'))
    assert.ok(page('/korean/ref/sentences').includes('<ol>'))
    for (const tab of ['cheat', 'talk', 'hangul', 'reading', 'numbers']) assert.ok(page(`/korean/ref/${tab}`).length > 6000, `справочник ${tab} не пустой`)
    assert.ok(page('/about').includes('Личный кабинет'), 'слайды «О платформе»')
  })
})
