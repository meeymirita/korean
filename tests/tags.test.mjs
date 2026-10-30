import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { OWNER, cleanup, start } from './_server.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { cleanTag, cleanTags, MAX_TAGS } = await load('/src/lib/tags.ts')
const { useNotesStore } = await load('/src/stores/notes.ts')
after(close)
after(cleanup)

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

describe('теги: правила', () => {
  test('# убирается, регистр и пробелы приводятся к виду test-tag', () => {
    assert.equal(cleanTag('  #Test Tag '), 'test-tag')
    assert.equal(cleanTag('##Грамматика_1'), 'грамматика-1')
    assert.equal(cleanTag('a!@$b'), 'ab')
    assert.equal(cleanTag('---'), '')
    assert.equal(cleanTag(5), '')
    assert.equal(cleanTag('x'.repeat(50)).length, 30)
  })

  test('список: дубли и пустые убираются, не больше 10', () => {
    assert.deepEqual(cleanTags(['#a', 'A', '', 'b']), ['a', 'b'])
    assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => 't' + i)).length, MAX_TAGS)
    assert.deepEqual(cleanTags('нет'), [])
  })
})

describe('теги в заметках (магазин)', () => {
  test('добавление и правка чистят теги, счётчик считает заметки', () => {
    setActivePinia(createPinia())
    const n = useNotesStore()
    const a = n.add('A', '', [], ['#Слова', 'слова', 'Урок 1'])
    assert.deepEqual(a.tags, ['слова', 'урок-1'])
    n.add('B', '', [], ['слова'])
    assert.equal(n.tagCounts.get('слова'), 2)
    n.update(a.id, { tags: ['новый'] })
    assert.deepEqual(n.data.notes.find(x => x.id === a.id).tags, ['новый'])
    assert.equal(n.tagCounts.get('слова'), 1)
  })
})

describe('сервер: теги', () => {
  let s
  before(async () => (s = await start()))

  test('заметки: теги сохраняются чистыми и возвращаются', async () => {
    const body = { v: 1, updated: 1, notes: [{ id: 'n1', title: 'T', text: '', images: [], tags: ['#Слова', 'слова', 'Test Tag'], created: 1, updated: 1 }] }
    assert.equal((await s.call('PUT', '/api/notes', OWNER, body)).status, 200)
    const got = await (await s.call('GET', '/api/notes', OWNER)).json()
    assert.deepEqual(got.notes[0].tags, ['слова', 'test-tag'])
  })

  test('заметки: старый клиент без тегов работает, слишком много тегов — 400', async () => {
    const old = { v: 1, updated: 2, notes: [{ id: 'n2', title: 'T', text: '', created: 1, updated: 1 }] }
    assert.equal((await s.call('PUT', '/api/notes', OWNER, old)).status, 200)
    assert.deepEqual((await (await s.call('GET', '/api/notes', OWNER)).json()).notes[0].tags, [])
    const many = { v: 1, updated: 3, notes: [{ id: 'n3', title: 'T', text: '', tags: Array.from({ length: 11 }, (_, i) => 't' + i), created: 1, updated: 1 }] }
    assert.equal((await s.call('PUT', '/api/notes', OWNER, many)).status, 400)
  })

  test('картинки: теги при загрузке и правке, неверный список — 400', async () => {
    const img = await (await s.upload(OWNER, PNG, 'a.png', 'cap', { tags: JSON.stringify(['#Фото', 'Мой кот']) })).json()
    assert.deepEqual(img.tags, ['фото', 'мой-кот'])
    assert.equal((await s.call('PATCH', `/api/images/${img.id}`, OWNER, { tags: ['один'] })).status, 200)
    assert.equal((await s.call('PATCH', `/api/images/${img.id}`, OWNER, { tags: 'не список' })).status, 400)
    const l = await (await s.call('GET', '/api/images', OWNER)).json()
    assert.deepEqual(l.items[0].tags, ['один'])
    const bad = await (await s.upload(OWNER, PNG, 'b.png', '', { tags: '{сломано' })).json()
    assert.deepEqual(bad.tags, [])
  })
})
