import { readFileSync } from 'node:fs'
import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { G, SECS } = await load('/src/data/korean/grammar.ts')
const { videoOf } = await load('/src/data/korean/course.ts')
const { VIDEO_TITLES } = await load('/src/data/korean/videoTitles.ts')
after(close)

describe('данные грамматики', () => {
  test('у каждой карточки свой id, раздел из списка, статус ok или soon, непустое содержимое', () => {
    const ids = G.map(g => g.id)
    assert.equal(new Set(ids).size, ids.length, 'повторяющийся id')
    for (const g of G) {
      assert.ok(SECS.includes(g.s), `${g.id}: раздел «${g.s}» не в SECS`)
      assert.ok(['ok', 'soon'].includes(g.st), `${g.id}: статус ${g.st}`)
      assert.ok(g.part === undefined || g.part === 1 || g.part === 2, `${g.id}: часть`)
      assert.ok(g.ko && g.ru && g.d, `${g.id}: пустое название`)
      assert.ok(g.b.length > 0, `${g.id}: нет содержимого`)
    }
  })

  test('каждый раздел из SECS используется хотя бы одной карточкой', () => {
    for (const s of SECS) assert.ok(G.some(g => g.s === s), `раздел «${s}» пуст`)
  })

  test('ссылки на карточки из разбора предложений (parse.ts) ведут на существующие карточки', () => {
    const src = readFileSync('src/data/korean/parse.ts', 'utf8')
    const ids = [...src.matchAll(/\bP\('[^']*',\s*'[^']*',\s*'[^']*',\s*'(\w+)'(?:,\s*\[[^\]]*\])?\)/g)].map(m => m[1])
    assert.ok(ids.length >= 15, 'ссылки не нашлись: поменялся формат P(...)')
    for (const id of new Set(ids)) assert.ok(G.some(g => g.id === id), `parse.ts ссылается на «${id}», такой карточки нет`)
  })

  test('карточка урока: у видео есть оригинальное название, у «своих» карточек видео нет', () => {
    for (const g of G) {
      const v = videoOf(g.l)
      if (g.l) {
        assert.ok(v, `${g.id}: подпись «${g.l}»`)
        const key = v.replace(/^.*\//, '').replace(/\.mp4$/, '')
        assert.ok(VIDEO_TITLES[key], `${g.id}: нет названия для ${key}`)
      } else {
        assert.equal(v, undefined)
      }
    }
  })

  test('первая часть: уроки 1–30 (и 16-1, 16-2) покрыты, вторая: 13 уроков', () => {
    const urls = new Set(G.filter(g => g.l).map(g => videoOf(g.l)))
    for (let n = 1; n <= 30; n++) {
      if (n === 16) continue
      assert.ok(urls.has(`/video/lesson-${String(n).padStart(2, '0')}.mp4`), `нет карточки урока ${n}`)
    }
    assert.ok(urls.has('/video/lesson-16-1.mp4') && urls.has('/video/lesson-16-2.mp4'))
    for (let n = 1; n <= 13; n++) assert.ok(urls.has(`/video/part2-${String(n).padStart(2, '0')}.mp4`), `нет карточки части 2, урок ${n}`)
  })
})

describe('подсказки режимов игры', () => {
  test('у каждого режима игры (кроме «Микс») есть подсказка «?» с описанием и примером', () => {
    const src = readFileSync('src/game/engine.ts', 'utf8')
    const modes = [...src.slice(src.indexOf('const MODES=['), src.indexOf('];', src.indexOf('const MODES=['))).matchAll(/\{id:'(\w+)'/g)].map(m => m[1]).filter(m => m !== 'mix')
    const helpBlock = src.slice(src.indexOf('const MODE_HELP={'), src.indexOf('};', src.indexOf('const MODE_HELP={')))
    assert.ok(modes.length >= 13)
    for (const m of modes) {
      const re = new RegExp(`\\b${m}:\\['[^']+','Пример: `)
      assert.ok(re.test(helpBlock), `у режима «${m}» нет подсказки с примером`)
    }
  })
})
