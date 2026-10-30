import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const store = new Map()
globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() }
const { usePersisted } = await load('/src/composables/usePersisted.ts')
after(close)
beforeEach(() => store.clear())

describe('запоминание состояния при обновлении страницы', () => {
  test('значение сохраняется и возвращается после «обновления»', async () => {
    const a = usePersisted('mode', 'match')
    assert.equal(a.value, 'match')
    a.value = 'type'
    await nextTick()
    assert.equal(JSON.parse(store.get('ui_mode')), 'type')
    assert.equal(usePersisted('mode', 'match').value, 'type', 'новый экземпляр читает сохранённое')
  })

  test('мусор и значения, не прошедшие проверку, заменяются запасным', () => {
    store.set('ui_size', '{не json')
    assert.equal(usePersisted('size', 8).value, 8)
    store.set('ui_size', '999')
    assert.equal(usePersisted('size', 8, v => [4, 8].includes(v)).value, 8)
    store.set('ui_size', '4')
    assert.equal(usePersisted('size', 8, v => [4, 8].includes(v)).value, 4)
  })

  test('если хранилище недоступно, всё работает без запоминания', async () => {
    const saved = globalThis.sessionStorage
    globalThis.sessionStorage = {
      getItem() {
        throw new Error('нет доступа')
      },
      setItem() {
        throw new Error('нет доступа')
      },
    }
    const r = usePersisted('x', 1)
    r.value = 2
    await nextTick()
    assert.equal(r.value, 2)
    globalThis.sessionStorage = saved
  })
})
