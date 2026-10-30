import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { searchOpen, searchQuery, openSearch, closeSearch, toggleSearch } = await load('/src/composables/useSearchWindow.ts')
after(close)

describe('окно поиска по платформе', () => {
  test('открывается, закрывается и переключается; запрос помнится между открытиями', () => {
    assert.equal(searchOpen.value, false)
    openSearch()
    assert.equal(searchOpen.value, true)
    searchQuery.value = 'дом'
    closeSearch()
    assert.equal(searchOpen.value, false)
    toggleSearch()
    assert.equal(searchOpen.value, true)
    assert.equal(searchQuery.value, 'дом', 'запрос не потерялся')
    toggleSearch()
    assert.equal(searchOpen.value, false)
  })
})
