import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { close, load } from './_load.mjs'

const { ABOUT_SLIDES } = await load('/src/data/about.ts')
const { GAMES, PAGES, shotName } = await load('/src/data/guide.ts')
after(close)
const assets = new URL('../frontend/src/assets/about/', import.meta.url)
// страницы: файлы в src/pages (файловый роутинг Nuxt, имя файла = последняя часть адреса) и старые адреса в src/router.options.ts
const pageIds = readdirSync(new URL('../frontend/src/pages/', import.meta.url), { recursive: true }).filter(f => f.endsWith('.vue')).map(f => `'${path.basename(f, '.vue')}'`)
const routerSrc = readFileSync(new URL('../frontend/src/router.options.ts', import.meta.url), 'utf8') + pageIds.join(' ')
const sectionsSrc = readFileSync(new URL('../frontend/src/data/korean/sections.ts', import.meta.url), 'utf8')

describe('«О платформе»: слайды', () => {
  test('у каждого слайда есть картинка, название и описание, id не повторяются', () => {
    assert.ok(ABOUT_SLIDES.length >= 10)
    assert.equal(new Set(ABOUT_SLIDES.map(s => s.id)).size, ABOUT_SLIDES.length)
    for (const s of ABOUT_SLIDES) {
      assert.ok(s.title.trim() && s.text.trim(), s.id)
      assert.ok(existsSync(new URL(`${shotName(s.to)}.webp`, assets)), `нет картинки ${shotName(s.to)}.webp (node scripts/about-shots.mjs)`)
    }
  })

  test('у каждой страницы и игры из «Что здесь есть» есть скриншот; лишних файлов в папке нет', () => {
    const need = new Set(['home', ...GAMES.map(c => shotName(c.to)), ...PAGES.map(c => shotName(c.to)), ...ABOUT_SLIDES.map(s => shotName(s.to))])
    for (const name of need) assert.ok(existsSync(new URL(`${name}.webp`, assets)), `нет картинки ${name}.webp`)
    const extra = readdirSync(assets).filter(f => f.endsWith('.webp') && !need.has(f.replace('.webp', '')))
    assert.deepEqual(extra, [], 'лишние картинки: удали или запусти scripts/about-shots.mjs без KEEP')
  })

  test('имя скриншота выводится из адреса', () => {
    assert.equal(shotName('/'), 'home')
    assert.equal(shotName('/korean/ref/hangul'), 'korean-ref-hangul')
    assert.equal(shotName('/game/home?game=word'), 'game-home-game-word')
    assert.equal(shotName('/korean/cabinet?tab=settings'), 'korean-cabinet-tab-settings')
  })

  test('каждый слайд ведёт на существующую страницу', () => {
    for (const s of ABOUT_SLIDES) {
      assert.ok(s.to.startsWith('/'), s.id)
      if (s.to === '/' || s.to === '/game/home') continue
      const id = s.to.split('?')[0].split('/').pop() // ?tab=… в адресе вкладки не считается
      assert.ok(routerSrc.includes(`'${id}'`) || sectionsSrc.includes(`id: '${id}'`), `страницы ${s.to} нет в роутере`)
    }
  })

  test('закрытые токеном страницы помечены, открытые нет', () => {
    const priv = ABOUT_SLIDES.filter(s => s.private).map(s => s.id)
    assert.deepEqual(priv.sort(), ['alphabet', 'cabinet', 'cheat', 'game', 'garden', 'grammar', 'hangul', 'numbers', 'reading', 'review', 'sentences', 'settings', 'talk', 'today', 'trainers', 'words'])
  })
})
