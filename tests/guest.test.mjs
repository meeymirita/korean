import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reply, offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch

let store
beforeEach(() => {
  ls.clear()
  globalThis.fetch = offline
  setActivePinia(createPinia())
  store = useProgressStore()
})
afterEach(() => {
  store.disconnect() // гасит отложенную запись и гостевую память
  globalThis.fetch = realFetch
})

describe('гостевой режим: ничего не сохраняется', () => {
  const FUTURE = () => String(Date.now() + 3600_000)
  const guestReply = (expires = FUTURE()) => reply(200, {}, { 'X-Role': 'guest', 'X-Guest-Expires': expires })
  const real = () => ls // настоящее хранилище устройства (Map под заглушкой)

  test('вход гостем: полный доступ, прогресс чистый, роль и срок известны', async () => {
    store.record({ word: '사람', ok: true, source: 'game' }) // прогресс этого устройства до гостя
    globalThis.fetch = guestReply()
    assert.equal(await store.connect('гость'), true)
    assert.equal(store.unlocked, true)
    assert.equal(store.isGuest, true)
    assert.ok(store.guestExpires > Date.now())
    assert.deepEqual(store.data.words, {}, 'чужой прогресс гостю не виден')
    assert.equal(store.data.xp, 0)
  })

  test('ответы гостя не попадают ни в настоящий localStorage, ни на сервер', async () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    await new Promise(r => setTimeout(r, 0)) // дать стору записать в хранилище
    const before = real().get('progress_v1')
    assert.ok(before, 'прогресс устройства записан до гостя')
    const calls = []
    globalThis.fetch = async (url, opt = {}) => (calls.push(`${opt.method ?? 'GET'} ${url}`), guestReply()())
    await store.connect('гость')
    for (let i = 0; i < 5; i++) store.record({ word: '학교', ok: true, source: 'game' })
    localStorage.setItem('hleb_game_v1', '{"гость":1}') // так пишет игра
    store.setProfile({ name: 'Гость' })
    await store.push()
    await new Promise(r => setTimeout(r, 1000))
    assert.equal(real().get('progress_v1'), before, 'прогресс устройства не тронут')
    assert.equal(real().has('hleb_game_v1'), false, 'статистика игры не сохранена')
    assert.equal(real().has('progress_outbox'), false, 'очередь действий не создана')
    assert.equal(store.data.xp, 50, 'но в самой сессии всё считается')
    assert.deepEqual(calls, ['GET /api/progress', 'POST /api/session'], 'на сервер ушли только вход и запись о входе, ни одного действия')
  })

  test('вход переживает перезагрузку, прогресс гостя нет', async () => {
    globalThis.fetch = guestReply()
    await store.connect('гость')
    store.record({ word: '학교', ok: true, source: 'game' })
    assert.equal(real().get('progress_role'), 'guest')
    assert.equal(real().get('progress_token'), 'гость')
    setActivePinia(createPinia()) // «перезагрузка»: новый стор читает то же хранилище
    const again = useProgressStore()
    assert.equal(again.isGuest, true)
    assert.equal(again.unlocked, true)
    assert.equal(again.data.xp, 0)
    again.disconnect()
  })

  test('выход: гостевая память выбрасывается, данные устройства на месте', async () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    await new Promise(r => setTimeout(r, 0))
    globalThis.fetch = guestReply()
    await store.connect('гость')
    store.record({ word: '학교', ok: true, source: 'game' })
    store.disconnect()
    assert.equal(store.isGuest, false)
    assert.equal(store.unlocked, false)
    assert.equal(store.data.xp, 10)
    assert.ok(store.data.words['사람'])
    assert.equal(store.data.words['학교'], undefined)
    localStorage.setItem('check', '1') // настоящее хранилище снова на месте
    assert.equal(real().get('check'), '1')
  })

  test('срок вышел: 401 «expired» закрывает доступ с понятным сообщением', async () => {
    globalThis.fetch = guestReply()
    await store.connect('гость')
    globalThis.fetch = reply(401, { error: 'expired' })
    await store.init()
    assert.equal(store.unlocked, false)
    assert.equal(store.isGuest, false)
    assert.equal(store.syncMessage, 'срок гостевого доступа закончился')
    assert.equal(real().get('progress_role') ?? null, null)
  })

  test('токен владельца после гостевого возвращает обычный режим и данные с сервера', async () => {
    globalThis.fetch = guestReply()
    await store.connect('гость')
    globalThis.fetch = reply(200, { v: 1, updated: 5, xp: 70, words: { 사람: { ok: 1, bad: 0, streak: 1, last: 1 } } }, { 'X-Role': 'owner' })
    await store.connect('владелец')
    assert.equal(store.isGuest, false)
    assert.equal(store.unlocked, true)
    assert.equal(store.data.xp, 70)
    assert.ok(store.data.words['사람'], 'прогресс владельца с сервера')
  })

  test('очередь владельца не теряется и не уходит на сервер, пока вошёл гость', async () => {
    ls.set('progress_token', 'владелец')
    ls.set('progress_verified', '1')
    ls.set('progress_outbox', JSON.stringify([{ type: 'reset' }]))
    setActivePinia(createPinia())
    store = useProgressStore()
    const calls = []
    globalThis.fetch = async (url, opt = {}) => (calls.push(`${opt.method ?? 'GET'} ${url}`), guestReply()())
    await store.connect('гость')
    await new Promise(r => setTimeout(r, 1000))
    assert.ok(!calls.some(c => c.includes('/api/ops')), 'ни одного действия на сервер')
    store.disconnect()
    assert.equal(JSON.parse(ls.get('progress_outbox')).length, 1, 'очередь владельца осталась в настоящем хранилище')
  })

  test('владелец создаёт, смотрит и отзывает гостевые токены', async () => {
    const calls = []
    globalThis.fetch = async (url, opt = {}) => {
      calls.push(`${opt.method} ${url}`)
      return reply(200, opt.method === 'GET' ? [{ id: 'a1', label: 'Лера', created: 1, expires: 2 }] : { id: 'a1', token: 'tok', ok: true })()
    }
    store.token // отдельный вход не нужен: методы просто шлют токен владельца
    const made = await store.createGuest(24, 'Лера')
    assert.equal(made.token, 'tok')
    assert.equal((await store.listGuests())[0].label, 'Лера')
    await store.revokeGuest('a1')
    assert.deepEqual(calls, ['POST /api/guests', 'GET /api/guests', 'DELETE /api/guests/a1'])
  })

  test('403 от сервера объясняется человеческими словами', async () => {
    globalThis.fetch = reply(403, {})
    await assert.rejects(() => store.createGuest(1, ''), /только владелец/)
  })
})
