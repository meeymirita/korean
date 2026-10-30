import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reply, offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useNotesStore, normalizeNotes, MAX_NOTES, MAX_TITLE, MAX_TEXT } = await load('/src/stores/notes.ts')
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
const sleep = ms => new Promise(r => setTimeout(r, ms))
let notes

/** Свежий стор; owner — владелец с токеном (без сети: вход уже подтверждён), guest — гостевая сессия, иначе без токена. */
function fresh(who) {
  ls.clear()
  if (who === 'owner') (ls.set('progress_token', 't'), ls.set('progress_verified', '1'))
  if (who === 'guest') (ls.set('progress_token', 't'), ls.set('progress_verified', '1'), ls.set('progress_role', 'guest'))
  setActivePinia(createPinia())
  notes = useNotesStore()
}
beforeEach(() => {
  globalThis.fetch = offline
  fresh()
})
afterEach(() => {
  useProgressStore().disconnect() // выходит из гостевого режима и гасит таймеры
  globalThis.fetch = realFetch
})

const sample = (id, o = {}) => ({ id, title: 'Т', text: 'О', created: 1, updated: 1, ...o })

describe('normalizeNotes', () => {
  test('мусор даёт пустой список', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { notes: 'нет' }]) assert.deepEqual(normalizeNotes(bad).notes, [])
  })

  test('лишнее отбрасывается: без id, дубли, слишком длинный id', () => {
    const d = normalizeNotes({ notes: [sample('a'), sample('a'), sample(''), { title: 'без id' }, sample('я'.repeat(41)), null, sample('b')] })
    assert.deepEqual(d.notes.map(n => n.id), ['a', 'b'])
  })

  test('длина режется по лимитам, список — до 200', () => {
    const d = normalizeNotes({ notes: [sample('a', { title: 'я'.repeat(500), text: 'я'.repeat(9000) })] })
    assert.equal(d.notes[0].title.length, MAX_TITLE)
    assert.equal(d.notes[0].text.length, MAX_TEXT)
    const many = Array.from({ length: 300 }, (_, i) => sample('n' + i))
    assert.equal(normalizeNotes({ notes: many }).notes.length, MAX_NOTES)
  })
})

describe('заметки: добавить, изменить, удалить', () => {
  test('добавление: название и описание обрезаются по краям, новая сверху', async () => {
    const a = notes.add('  Первая  ', '  текст  ')
    await sleep(2)
    const b = notes.add('Вторая', '')
    assert.deepEqual([a.title, a.text], ['Первая', 'текст'])
    assert.deepEqual(notes.notes.map(n => n.title), ['Вторая', 'Первая'])
    assert.ok(b.created >= a.created)
  })

  test('без названия заметка называется «Без названия», совсем пустую не добавить', () => {
    assert.equal(notes.add('', 'только описание').title, 'Без названия')
    assert.equal(notes.add('   ', '   '), null)
    assert.equal(notes.notes.length, 1)
  })

  test('лимиты: длинное режется, 201-я заметка не добавляется', () => {
    const n = notes.add('я'.repeat(300), 'я'.repeat(9000))
    assert.equal(n.title.length, MAX_TITLE)
    assert.equal(n.text.length, MAX_TEXT)
    for (let i = 1; i < MAX_NOTES; i++) assert.ok(notes.add('н' + i, ''))
    assert.equal(notes.full, true)
    assert.equal(notes.add('лишняя', ''), null)
    assert.equal(notes.notes.length, MAX_NOTES)
  })

  test('изменение: меняет текст и время, порядок не прыгает', async () => {
    const a = notes.add('Первая', 'a')
    await sleep(2)
    notes.add('Вторая', 'b')
    const before = notes.data.updated
    await sleep(2)
    assert.equal(notes.update(a.id, { title: 'Новая', text: 'новый текст' }), true)
    const got = notes.notes.find(n => n.id === a.id)
    assert.deepEqual([got.title, got.text], ['Новая', 'новый текст'])
    assert.ok(got.updated > got.created && notes.data.updated > before)
    assert.deepEqual(notes.notes.map(n => n.title), ['Вторая', 'Новая'])
    assert.equal(notes.update('нет-такой', { title: 'x' }), false)
  })

  test('картинки: попадают в заметку, лишние id отбрасываются, не больше 10', () => {
    const id = n => n.toString(16).padStart(16, '0')
    const many = Array.from({ length: 15 }, (_, i) => id(i))
    const n = notes.add('С картинками', '', many)
    assert.equal(n.images.length, 10)
    assert.equal(notes.add('', '', []), null, 'пустая заметка без картинок не добавляется')
    assert.ok(notes.add('', '', [id(1)]), 'одни картинки — уже заметка')
    notes.update(n.id, { images: [id(2)] })
    assert.deepEqual(notes.notes.find(x => x.id === n.id).images, [id(2)])
    const d = normalizeNotes({ notes: [sample('a', { images: [id(3), 'не-id', 5, '../x'] }), sample('b')] })
    assert.deepEqual(d.notes.map(x => x.images), [[id(3)], []])
  })

  test('удаление', () => {
    const a = notes.add('A', '')
    notes.add('B', '')
    notes.remove(a.id)
    assert.deepEqual(notes.notes.map(n => n.title), ['B'])
    const before = notes.data.updated
    notes.remove('нет-такой')
    assert.equal(notes.data.updated, before, 'удалять нечего: список не менялся')
  })

  test('заметки сохраняются в браузере и возвращаются после перезагрузки', () => {
    notes.add('Живу в браузере', 'текст')
    setActivePinia(createPinia())
    assert.deepEqual(useNotesStore().notes.map(n => n.title), ['Живу в браузере'])
  })
})

describe('заметки: сервер', () => {
  test('без токена всё локально и сеть не трогается', async () => {
    let calls = 0
    globalThis.fetch = async () => (calls++, reply(200)())
    notes.add('Локальная', '')
    await notes.init()
    await sleep(1100)
    assert.equal(calls, 0)
    assert.equal(notes.status, 'local')
  })

  test('владелец: свежая версия с сервера побеждает', async () => {
    fresh('owner')
    notes.add('Старая локальная', '')
    globalThis.fetch = reply(200, { v: 1, updated: Date.now() + 60_000, notes: [sample('s1', { title: 'С сервера' })] })
    await notes.init()
    assert.deepEqual(notes.notes.map(n => n.title), ['С сервера'])
    assert.equal(notes.status, 'saved')
    await sleep(1100)
    assert.equal(notes.status, 'saved', 'загруженное с сервера не отправляется обратно')
  })

  test('владелец: локальная версия новее — уходит на сервер', async () => {
    fresh('owner')
    notes.add('Новая локальная', 'текст')
    const calls = []
    globalThis.fetch = async (url, opt = {}) => {
      calls.push(opt.method ?? 'GET')
      if (opt.method === 'PUT') assert.equal(JSON.parse(opt.body).notes[0].title, 'Новая локальная')
      return reply(200, { v: 1, updated: 1, notes: [] })()
    }
    await notes.init()
    assert.deepEqual(calls, ['GET', 'PUT'])
    assert.equal(notes.status, 'saved')
  })

  test('правка уходит на сервер сама, через секунду, одним запросом', async () => {
    fresh('owner')
    const puts = []
    globalThis.fetch = async (url, opt = {}) => (opt.method === 'PUT' && puts.push(JSON.parse(opt.body)), reply(200, { v: 1, updated: 0, notes: [] })())
    await notes.init()
    notes.add('Раз', '')
    notes.add('Два', '')
    notes.add('Три', '')
    assert.equal(notes.status, 'saving')
    assert.equal(puts.length, 0)
    await sleep(1200)
    assert.equal(puts.length, 1, 'три правки подряд — один запрос')
    assert.equal(puts[0].notes.length, 3)
    assert.equal(notes.status, 'saved')
  })

  test('сервер недоступен: заметки остаются, статус — ошибка, потом уходят', async () => {
    fresh('owner')
    notes.add('Не потеряется', '')
    await notes.init()
    assert.equal(notes.status, 'error')
    assert.equal(notes.message, 'сервер недоступен')
    assert.deepEqual(notes.notes.map(n => n.title), ['Не потеряется'])
    const calls = []
    globalThis.fetch = async (url, opt = {}) => (calls.push(opt.method ?? 'GET'), reply(200, { v: 1, updated: 0, notes: [] })())
    await notes.init()
    assert.deepEqual(calls, ['GET', 'PUT'])
  })

  test('сервер отказал (например 413): ошибка понятным текстом', async () => {
    fresh('owner')
    notes.add('Большая', '')
    globalThis.fetch = reply(413)
    await notes.push()
    assert.equal(notes.status, 'error')
    assert.equal(notes.message, 'заметки слишком большие')
  })

  test('гость: сеть не трогается, заметки только в памяти и не попадают в браузер', async () => {
    fresh('guest')
    let calls = 0
    globalThis.fetch = async () => (calls++, reply(200)())
    await notes.init()
    notes.add('Гостевая', 'тест')
    await notes.push()
    await sleep(1100)
    assert.equal(calls, 0)
    assert.equal(notes.status, 'local')
    assert.equal(notes.notes.length, 1, 'в сессии заметка есть')
    assert.equal(ls.has('notes_v1'), false, 'в настоящее хранилище ничего не записано')
  })
})
