import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { sortNotes, moveOrder } = await load('/src/lib/notesMeta.ts')
const { useNotesStore, normalizeNotes } = await load('/src/stores/notes.ts')
after(close)

const n = (id, created, extra = {}) => ({ id, created, ...extra })
const ids = list => list.map(x => x.id)

describe('заметки: ручной порядок', () => {
  test('без ручного места: закреплённые первыми, новые сверху (как раньше)', () => {
    assert.deepEqual(ids(sortNotes([n('a', 1), n('b', 5), n('c', 3, { pinned: true })])), ['c', 'b', 'a'])
  })

  test('расставленные вручную идут по pos, а новая заметка без места встаёт сверху', () => {
    const list = [n('a', 1, { pos: 1 }), n('b', 5, { pos: 0 }), n('c', 3, { pos: 2 }), n('new', 9, { pos: null })]
    assert.deepEqual(ids(sortNotes(list)), ['new', 'b', 'a', 'c'])
  })

  test('перенос: заметка встаёт на место той, на которую её бросили, закреплённые отдельной группой', () => {
    const list = sortNotes([n('p', 1, { pinned: true }), n('a', 4), n('b', 3), n('c', 2)])
    assert.deepEqual(moveOrder(list, 'c', 'a'), ['p', 'c', 'a', 'b'])
    assert.deepEqual(moveOrder(list, 'a', 'c'), ['p', 'b', 'c', 'a'])
    assert.equal(moveOrder(list, 'a', 'p'), null, 'в закреплённые перетаскивание не переносит')
    assert.equal(moveOrder(list, 'a', 'a'), null)
    assert.equal(moveOrder(list, 'a', 'нет'), null)
  })

  test('нормализация: pos только целое от 0, иначе null', () => {
    const got = normalizeNotes({ notes: [{ id: 'a', pos: 3 }, { id: 'b', pos: -1 }, { id: 'c', pos: 1.5 }, { id: 'd', pos: 'x' }, { id: 'e' }] }).notes
    assert.deepEqual(got.map(x => x.pos), [3, null, null, null, null])
  })

  test('хранилище: move запоминает порядок для всех заметок и переживает перезагрузку', () => {
    ls.clear()
    globalThis.fetch = offline
    setActivePinia(createPinia())
    let store = useNotesStore()
    for (const t of ['один', 'два', 'три']) store.add(t, '')
    store.data.notes.forEach((x, i) => (x.created = 1000 + i)) // add() в одну миллисекунду: разводим время
    const [first, , last] = store.notes.map(x => x.id) // сверху вниз: три, два, один
    const order0 = store.notes.map(x => x.title)
    assert.deepEqual(order0, ['три', 'два', 'один'])
    assert.equal(store.move(last, first), true) // «один» на место «три»
    assert.deepEqual(store.notes.map(x => x.title), ['один', 'три', 'два'])
    assert.equal(store.move(first, first), false)
    store.add('четыре', '')
    store.data.notes.find(x => x.title === 'четыре').created = 9999
    assert.deepEqual(store.notes.map(x => x.title), ['четыре', 'один', 'три', 'два'], 'новая заметка сверху')
    setActivePinia(createPinia())
    store = useNotesStore()
    assert.deepEqual(store.notes.map(x => x.title), ['четыре', 'один', 'три', 'два'], 'порядок из браузера')
  })
})
