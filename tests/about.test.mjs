import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { ABOUT_SLIDES } = await load('/src/data/about.ts')
after(close)
const assets = new URL('../src/assets/about/', import.meta.url)
const routerSrc = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const sectionsSrc = readFileSync(new URL('../src/data/korean/sections.ts', import.meta.url), 'utf8')

describe('«О платформе»: слайды', () => {
  test('у каждого слайда есть картинка, название и описание, id не повторяются', () => {
    assert.ok(ABOUT_SLIDES.length >= 10)
    assert.equal(new Set(ABOUT_SLIDES.map(s => s.id)).size, ABOUT_SLIDES.length)
    for (const s of ABOUT_SLIDES) {
      assert.ok(s.title.trim() && s.text.trim(), s.id)
      assert.ok(existsSync(new URL(`${s.img}.webp`, assets)), `нет картинки ${s.img}.webp`)
    }
  })

  test('каждый слайд ведёт на существующую страницу', () => {
    for (const s of ABOUT_SLIDES) {
      assert.ok(s.to.startsWith('/'), s.id)
      if (s.to === '/' || s.to === '/game') continue
      const id = s.to.split('/').pop()
      assert.ok(routerSrc.includes(`'${id}'`) || sectionsSrc.includes(`id: '${id}'`), `страницы ${s.to} нет в роутере`)
    }
  })

  test('закрытые токеном страницы помечены, открытые нет', () => {
    const priv = ABOUT_SLIDES.filter(s => s.private).map(s => s.id)
    assert.deepEqual(priv.sort(), ['cabinet', 'game', 'garden', 'review', 'today', 'trainers'])
  })
})
