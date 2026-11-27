// Книжная полка в открытой игре: кнопка-книжка в строке «← К списку игр» открывает те же книги, что страница грамматики (?view=shelf).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = p => readFileSync(fileURLToPath(new URL(`../frontend/src/${p}`, import.meta.url)), 'utf8')

test('GameHomeView: у открытой игры в строке gh-back есть кнопка книжной полки и окно', () => {
  const v = read('views/GameHomeView.vue')
  assert.match(v, /<GameTools menu shelf[^>]*@shelf="shelfOpen = true"/)
  assert.match(v, /<GameShelfWindow v-model="shelfOpen"/)
  // в каталоге (без игры) кнопки нет
  assert.match(v, /<GameTools :menu="false"/)
  assert.doesNotMatch(v, /<GameTools :menu="false"[^>]*shelf/)
})

test('GameShelfWindow: те же полки, что на странице грамматики, только пройденные карточки', () => {
  const v = read('components/korean/GameShelfWindow.vue')
  assert.match(v, /<GrammarShelf/)
  assert.match(v, /g\.st === 'ok'/)
  assert.match(v, /bookKey/)
})
