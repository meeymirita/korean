import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useNotebookStore, packStrokes } = await load('/src/stores/notebook.ts')
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
let store
beforeEach(() => {
  ls.clear()
  ls.set('progress_token', 'токен')
  setActivePinia(createPinia())
  store = useNotebookStore()
})
afterEach(() => {
  useProgressStore().disconnect()
  globalThis.fetch = realFetch
})

const reply = (body, status = 200) => ({ status, ok: status < 300, json: async () => body })
const it = (id, kind, parent = null, name = id) => ({ id, kind, name, parent, tpl: 'blank', fav: 0, created: 1, updated: 1 })

describe('тетрадь (стор)', () => {
  test('загрузка, создание и запрос с токеном', async () => {
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push([url, init?.method ?? 'GET', init?.headers?.Authorization])
      return init?.method === 'POST' ? reply({ ...it('b', 'sheet', 'a'), text: '', strokes: [] }) : reply({ items: [it('a', 'folder')] })
    }
    await store.load()
    assert.equal(store.loaded, true)
    const sh = await store.create('sheet', 'Лист', 'a', 'grid')
    assert.deepEqual(store.items.map(i => i.id), ['a', 'b'])
    assert.equal(sh.strokes.length, 0)
    assert.deepEqual(calls[0], ['/api/notebook', 'GET', 'Bearer токен'])
    assert.equal(calls[1][1], 'POST')
  })

  test('удаление папки убирает всё внутри, 404 не мешает', async () => {
    store.items = [it('a', 'folder'), it('b', 'folder', 'a'), it('c', 'sheet', 'b'), it('d', 'sheet')]
    globalThis.fetch = async () => reply({ error: 'not found' }, 404)
    await store.remove('a')
    assert.deepEqual(store.items.map(i => i.id), ['d'])
  })

  test('ошибка сервера понятным текстом', async () => {
    globalThis.fetch = async () => reply({ error: 'folder inside itself' }, 400)
    await assert.rejects(store.update('a', { parent: 'b' }), /внутрь самой себя/)
    globalThis.fetch = async () => reply({}, 403)
    await assert.rejects(store.load(), /только владельцу/)
  })

  test('папка внутри себя и путь папки', () => {
    store.items = [it('a', 'folder', null, 'Хангыль'), it('b', 'folder', 'a', 'Гласные')]
    assert.equal(store.isInside('b', 'a'), true)
    assert.equal(store.isInside('a', 'b'), false)
    assert.equal(store.isInside('a', 'a'), true)
    assert.equal(store.folderPath('b'), 'Тетрадь / Хангыль / Гласные')
    assert.equal(store.folderPath(null), 'Тетрадь')
  })

  test('штрихи округляются', () => {
    assert.deepEqual(packStrokes([{ c: '#fff', w: 4, p: [[1.23456, 2.98765, 0.123456]] }]), [{ c: '#fff', w: 4, p: [[1.2, 3, 0.12]] }])
  })
})
