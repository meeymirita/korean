import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reply, offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useNotesStore } = await load('/src/stores/notes.ts')
const { useImagesStore } = await load('/src/stores/images.ts')
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
let notes
function fresh(who) {
  ls.clear()
  if (who) (ls.set('progress_token', 't'), ls.set('progress_verified', '1'))
  if (who === 'guest') ls.set('progress_role', 'guest')
  setActivePinia(createPinia())
  notes = useNotesStore()
}
beforeEach(() => {
  globalThis.fetch = offline
})
afterEach(() => {
  useProgressStore().disconnect()
  globalThis.fetch = realFetch
})

describe('заметки: закрепление', () => {
  test('у владельца закреплённая идёт первой, у гостя закрепление и напоминание не сохраняются', () => {
    fresh('owner')
    const a = notes.add('Старая', 'x')
    notes.data.notes.find(n => n.id === a.id).created = 1
    const b = notes.add('Новая', 'y')
    assert.deepEqual(notes.notes.map(n => n.title), ['Новая', 'Старая'])
    assert.equal(notes.togglePin(a.id), true)
    assert.deepEqual(notes.notes.map(n => n.title), ['Старая', 'Новая'])
    assert.equal(notes.update(b.id, { remindAt: '2031-05-04T09:30' }), true)
    assert.equal(notes.data.notes.find(n => n.id === b.id).remindAt, '2031-05-04T09:30')
    notes.togglePin(a.id)
    assert.equal(notes.notes[0].title, 'Новая')

    fresh('guest')
    const g = notes.add('Гость', 'z')
    assert.equal(notes.togglePin(g.id), false)
    notes.update(g.id, { pinned: true, remindAt: '2031-05-04T09:30' })
    const got = notes.data.notes[0]
    assert.deepEqual([got.pinned, got.remindAt], [false, null])
  })
})

describe('заметки: корзина', () => {
  test('восстановление возвращает заметку в список, окончательное удаление шлёт повторный токен', async () => {
    fresh('owner')
    const calls = []
    globalThis.fetch = async (url, init = {}) => {
      calls.push([init.method ?? 'GET', String(url), init.headers?.['X-Confirm-Token']])
      if (String(url).endsWith('/trash')) return reply(200, { days: 30, items: [{ id: 'q', title: 'Из корзины', text: 'т', images: [], tags: [], created: 1, updated: 1, pinned: true, remindAt: null, deletedAt: 5 }] })()
      if (String(url).endsWith('/restore')) return reply(200, { ok: true, updated: 99, note: { id: 'q', title: 'Из корзины', text: 'т', images: [], tags: [], created: 1, updated: 1, pinned: true, remindAt: null } })()
      return reply(200, { ok: true })()
    }
    await notes.loadTrash()
    assert.deepEqual(notes.trash.map(n => [n.id, n.deletedAt]), [['q', 5]])
    await notes.restore('q')
    assert.deepEqual(notes.notes.map(n => n.id), ['q'])
    assert.equal(notes.data.updated, 99)
    assert.equal(notes.trash.length, 0)
    assert.ok(!calls.some(c => c[0] === 'PUT'), 'вернувшаяся заметка не отправляется обратно как новая запись списка')

    await notes.purge('q', 'secret')
    assert.deepEqual(calls.at(-1), ['DELETE', '/api/notes/q', 'secret'])
    await assert.rejects(() => notes.purge('q', 'токен-кириллицей'), /неверный токен/)
  })

  test('сервер не принял токен: ошибка показывается, заметка остаётся в корзине', async () => {
    fresh('owner')
    globalThis.fetch = reply(200, { items: [{ id: 'q', title: 'T', text: '', created: 1, updated: 1, deletedAt: 5 }] })
    await notes.loadTrash()
    globalThis.fetch = reply(403)
    await assert.rejects(() => notes.purge('q', 'wrong'), /неверный токен/)
    assert.equal(notes.trash.length, 1)
  })
})

describe('картинки: корзина', () => {
  test('восстановление возвращает в список, окончательное удаление освобождает место', async () => {
    ls.clear()
    ls.set('progress_token', 't')
    setActivePinia(createPinia())
    const images = useImagesStore()
    const it = (id, o = {}) => ({ id, name: id + '.png', caption: '', mime: 'image/png', size: 1000, width: 1, height: 1, created: 1, tags: [], ...o })
    globalThis.fetch = reply(200, { items: [it('a'), it('b')], used: 2000, limit: 10 ** 9, maxFile: 10 ** 7 })
    await images.load()
    globalThis.fetch = reply(200, { ok: true, trashed: true })
    await images.remove('a')
    assert.equal(images.used, 2000, 'файл остался на сервере')
    globalThis.fetch = reply(200, { days: 30, items: [it('a', { deletedAt: 7 })] })
    await images.loadTrash()
    assert.deepEqual(images.trash.map(i => i.id), ['a'])
    globalThis.fetch = reply(200, { ok: true })
    await images.restore('a')
    assert.deepEqual(images.items.map(i => i.id).sort(), ['a', 'b'])
    await images.remove('a')
    globalThis.fetch = reply(200, { days: 30, items: [it('a', { deletedAt: 7 })] })
    await images.loadTrash()
    globalThis.fetch = reply(200, { ok: true })
    await images.purge('a', 'tok')
    assert.deepEqual([images.trash.length, images.used], [0, 1000])
  })
})
