import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { load, close } from './_load.mjs'
import { readFileSync } from 'node:fs'

const { ALL_GAMES, GAME_GROUPS, TOOL_IDS, findGames } = await load('/src/data/games.ts')
after(close)

test('пять групп и у каждой есть игры', () => {
  assert.equal(GAME_GROUPS.length, 5)
  for (const g of GAME_GROUPS) assert.ok(g.games.length > 0, g.id)
})

test('id игр не повторяются, адреса ведут в игру или в раздел', () => {
  const ids = ALL_GAMES.map(g => g.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const g of ALL_GAMES) assert.match(g.to, /^\/game\/home\?game=\w+(&mode=\w+)?$/, g.id)
})

test('режимы ?game=… существуют в движке игры или среди тренажёров', () => {
  const engine = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8')
  for (const g of ALL_GAMES) {
    const m = /^\/game\/home\?game=(\w+)$/.exec(g.to)
    if (m && !TOOL_IDS.includes(m[1])) assert.ok(engine.includes(`{id:'${m[1]}'`), `нет режима ${m[1]}`)
  }
})

test('иконки каталога есть среди нарезанных', () => {
  for (const g of [...ALL_GAMES, ...GAME_GROUPS]) {
    assert.ok(readFileSync(new URL(`../src/assets/game/icons/${g.icon}.webp`, import.meta.url)).length > 0, g.icon)
  }
})

test('поиск по названию и описанию, пустой запрос возвращает всё', () => {
  assert.equal(findGames(ALL_GAMES, '').length, ALL_GAMES.length)
  assert.ok(findGames(ALL_GAMES, 'ПАРУ').some(g => g.id === 'match'))
  assert.equal(findGames(ALL_GAMES, 'zzzz').length, 0)
})
