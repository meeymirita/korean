import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { usePlansStore, formatSize, MAX_DOC } = await load('/src/stores/plans.ts')
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
let store
beforeEach(() => {
  ls.clear()
  ls.set('progress_token', 'токен')
  setActivePinia(createPinia())
  store = usePlansStore()
})
afterEach(() => {
  useProgressStore().disconnect()
  globalThis.fetch = realFetch
})

/** Ответ сервера: тело и статус. */
const reply = (body, status = 200) => ({ status, ok: status < 300, json: async () => body })
const plan = (id, day, o = {}) => ({ id, day, time: '', title: id, text: '', kind: 'own', tags: [], created: 1, updated: 1, files: [], ...o })

describe('записи календаря (магазин)', () => {
  test('проверка файла: PDF, Word, картинки; другое, большое и сверх места нельзя', () => {
    assert.equal(store.check({ name: 'дз.pdf', size: 1000 }), null)
    assert.equal(store.check({ name: 'К.DOCX', size: 1000 }), null)
    assert.equal(store.check({ name: 'a.jpeg', size: 1000 }), null)
    assert.match(store.check({ name: 'a.exe', size: 10 }), /нужны PDF, Word/)
    assert.match(store.check({ name: 'a.pdf', size: MAX_DOC + 1 }), /больше 25 МБ/)
  })

  test('загрузка списка: записи по дням, внутри дня по времени, счётчик тегов', async () => {
    globalThis.fetch = async () => reply({ items: [plan('b', '2026-11-07', { time: '19:30', tags: ['урок'] }), plan('a', '2026-11-07', { time: '10:00', tags: ['урок', 'дз'] })], used: 5, limit: 100 })
    await store.load()
    assert.deepEqual(store.byDay.get('2026-11-07').map(p => p.id), ['a', 'b'])
    assert.equal(store.tagCounts.get('урок'), 2)
    assert.equal(store.used, 5)
  })

  test('добавление, файл и удаление меняют список и занятое место', async () => {
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (init?.method === 'POST' && url === '/api/plans') return reply(plan('p1', '2026-11-07', { tags: ['урок'] }), 201)
      if (init?.method === 'POST') return reply({ id: 'f1', name: 'дз.pdf', mime: 'application/pdf', size: 40, thumb: 0, created: 1 }, 201)
      return reply({ ok: true })
    }
    const p = await store.add({ day: '2026-11-07', time: '', title: 'Урок', text: '', kind: 'tutor', tags: ['#Урок'] })
    await store.upload(p.id, new File(['x'], 'дз.pdf'))
    assert.equal(store.used, 40)
    assert.equal(store.items[0].files.length, 1)
    await store.removeFile('p1', 'f1')
    assert.equal(store.used, 0)
    await store.remove('p1')
    assert.deepEqual(store.items, [])
    assert.deepEqual(calls, ['POST /api/plans', 'POST /api/plans/p1/files', 'DELETE /api/plans/files/f1', 'DELETE /api/plans/p1'])
  })

  test('ошибка сервера даёт понятный текст', async () => {
    globalThis.fetch = async () => reply({}, 413)
    await assert.rejects(store.upload('p1', new File(['x'], 'a.pdf')), /слишком большой/)
    assert.equal(formatSize(2048), '2 КБ')
  })
})
