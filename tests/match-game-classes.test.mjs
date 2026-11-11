import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const match = read('../frontend/src/components/korean/MatchGame.vue')
const gameCss = read('../frontend/src/game/game.css')

/** Классы, которым стили движка внутри `.game` ставят `display: none` (окна и слои игры). */
const hidden = [...gameCss.matchAll(/\.game \.([\w-]+)\{[^}]*display:none/g)].map(m => m[1])

describe('«Найди пару» на странице игр', () => {
  test('у движка есть скрытые слои, среди них .over', () => {
    assert.ok(hidden.includes('over'))
  })

  test('карточки не получают класс, который движок игры прячет', () => {
    // страница игр обёрнута в `.game`: карточка с таким классом исчезала под линией, а колонка съезжала
    const template = match.slice(match.indexOf('<template>'), match.indexOf('<style>'))
    for (const cls of hidden) {
      assert.ok(!new RegExp(`(^|[\\s{,'"])${cls}:\\s`, 'm').test(template), `класс «${cls}» в шаблоне`)
      assert.ok(!match.includes(`.mg-card.${cls} `), `стиль .mg-card.${cls}`)
    }
    assert.ok(template.includes("'mg-aim':"))
  })
})
