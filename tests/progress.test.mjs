import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reply, offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useProgressStore, normalize, dayKey, KNOWN_STREAK } = await load('/src/stores/progress.ts')
const { xpFor } = await load('/src/data/levels.ts')
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
  store.disconnect() // гасит отложенную запись на сервер
  globalThis.fetch = realFetch
})

const daysAgo = n => dayKey(new Date(Date.now() - n * 86_400_000))

describe('normalize', () => {
  test('чужие и битые данные отклоняются', () => {
    for (const bad of [null, undefined, 'x', 5, [], { v: 2 }, {}]) assert.equal(normalize(bad), null)
  })

  test('старая версия без профиля и настроек получает значения по умолчанию', () => {
    const d = normalize({ v: 1, xp: 120, words: { 사람: { ok: 1, bad: 0, streak: 1, last: 5 } } })
    assert.equal(d.xp, 120)
    assert.deepEqual(d.profile, { name: '', avatar: '🌸' })
    assert.deepEqual(d.settings, { goal: 20, cats: [], gameCats: null })
    assert.deepEqual(d.log, [])
  })

  test('имя режется до 24 символов, неверная цель дня заменяется на 20', () => {
    const d = normalize({ v: 1, profile: { name: 'я'.repeat(40), avatar: '' }, settings: { goal: 7 } })
    assert.equal(d.profile.name.length, 24)
    assert.equal(d.profile.avatar, '🌸')
    assert.equal(d.settings.goal, 20)
  })

  test('журнал обрезается до 300 записей', () => {
    const log = Array.from({ length: 500 }, (_, i) => ({ t: i, w: null, ok: true, s: 'game' }))
    assert.equal(normalize({ v: 1, log }).log.length, 300)
  })
})

describe('record', () => {
  test('верный ответ: очки, серия, счётчики дня и источника', () => {
    const r = store.record({ word: '사람', ok: true, source: 'game' })
    const d = store.data
    assert.equal(d.xp, 10)
    assert.deepEqual([d.words['사람'].ok, d.words['사람'].streak], [1, 1])
    assert.equal(d.days[dayKey()], 1)
    assert.equal(d.all[dayKey()], 1)
    assert.deepEqual(d.sources.game, { ok: 1, bad: 0 })
    assert.equal(d.log[0].w, '사람')
    assert.equal(r.levelUp, false)
  })

  test('ошибка обнуляет серию и очков не даёт, но день считается', () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    store.record({ word: '사람', ok: false, source: 'game' })
    const w = store.data.words['사람']
    assert.deepEqual([w.bad, w.streak], [1, 0])
    assert.equal(store.data.xp, 10)
    assert.equal(store.data.all[dayKey()], 2)
    assert.equal(store.data.days[dayKey()], 1)
  })

  test('слово выучено после трёх верных подряд: bloomed один раз, kd запоминается', () => {
    const results = Array.from({ length: KNOWN_STREAK + 2 }, () => store.record({ word: '사람', ok: true, source: 'game' }))
    assert.deepEqual(results.map(r => r.bloomed), [false, false, true, false, false])
    assert.ok(store.data.words['사람'].kd)
    assert.equal(store.status('사람'), 'known')
  })

  test('ошибка после выученного сбрасывает статус, но kd остаётся', () => {
    for (let i = 0; i < KNOWN_STREAK; i++) store.record({ word: '사람', ok: true, source: 'game' })
    const kd = store.data.words['사람'].kd
    store.record({ word: '사람', ok: false, source: 'game' })
    assert.equal(store.status('사람'), 'learning')
    assert.equal(store.data.words['사람'].kd, kd)
  })

  test('ответ без слова пишет только день и очки', () => {
    store.record({ ok: true, source: 'today', xp: 15 })
    assert.equal(store.data.xp, 15)
    assert.deepEqual(store.data.words, {})
  })

  test('цель дня достигается ровно на последнем ответе', () => {
    store.setSettings({ goal: 10 })
    const reached = Array.from({ length: 11 }, () => store.record({ ok: true, source: 'game' }).goalReached)
    assert.deepEqual(reached, [...Array(9).fill(false), true, false])
    assert.equal(store.goalDone, true)
  })

  test('уровень растёт на пороге очков', () => {
    assert.equal(store.record({ ok: true, source: 'game', xp: xpFor(2) - 1 }).levelUp, false)
    assert.equal(store.record({ ok: true, source: 'game', xp: 1 }).levelUp, true)
    assert.equal(store.info.level, 2)
  })

  test('журнал не длиннее 300', () => {
    for (let i = 0; i < 320; i++) store.record({ ok: true, source: 'game' })
    assert.equal(store.data.log.length, 300)
  })
})

describe('серия дней', () => {
  test('считается от вчера, если сегодня ещё не занимались', () => {
    store.data.days = { [daysAgo(1)]: 5, [daysAgo(2)]: 3 }
    assert.equal(store.streak, 2)
  })

  test('сегодняшний день входит в серию', () => {
    store.data.days = { [daysAgo(0)]: 1, [daysAgo(1)]: 5, [daysAgo(2)]: 3 }
    assert.equal(store.streak, 3)
  })

  test('пропуск дня обрывает серию', () => {
    store.data.days = { [daysAgo(1)]: 5, [daysAgo(3)]: 3 }
    assert.equal(store.streak, 1)
  })

  test('лучшая серия за всё время', () => {
    store.data.days = { [daysAgo(10)]: 1, [daysAgo(9)]: 1, [daysAgo(8)]: 1, [daysAgo(7)]: 1, [daysAgo(1)]: 1, [daysAgo(0)]: 1 }
    assert.equal(store.bestStreak, 4)
  })
})

describe('профиль, настройки, копия', () => {
  test('профиль: имя режется, пустая картинка не затирает старую', () => {
    store.setProfile({ name: 'я'.repeat(30), avatar: '🐰' })
    store.setProfile({ avatar: '' })
    assert.equal(store.data.profile.name.length, 24)
    assert.equal(store.data.profile.avatar, '🐰')
  })

  test('настройки: цель только из списка', () => {
    store.setSettings({ goal: 50 })
    store.setSettings({ goal: 33 })
    assert.equal(store.goal, 50)
  })

  test('экспорт и импорт возвращают те же данные, мусор не принимается', () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    const json = store.exportJson()
    store.reset()
    assert.equal(store.data.xp, 0)
    assert.equal(store.importJson(json), true)
    assert.equal(store.data.xp, 10)
    assert.equal(store.importJson('не json'), false)
    assert.equal(store.importJson('{"v":2}'), false)
  })

  test('сброс обнуляет прогресс, но оставляет профиль и настройки', () => {
    store.setProfile({ name: 'Хлеб' })
    store.setSettings({ goal: 50 })
    store.record({ word: '사람', ok: true, source: 'game' })
    store.reset()
    assert.equal(store.data.xp, 0)
    assert.deepEqual(store.data.words, {})
    assert.equal(store.data.profile.name, 'Хлеб')
    assert.equal(store.goal, 50)
  })

  test('данные сохраняются в localStorage', async () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    await new Promise(r => setTimeout(r, 0))
    assert.equal(JSON.parse(ls.get('progress_v1')).xp, 10)
  })
})

describe('вход по токену', () => {
  test('сервер принял: доступ открыт и запомнен', async () => {
    globalThis.fetch = reply(200, { v: 1, updated: 0 })
    assert.equal(await store.connect('  секрет  '), true)
    assert.equal(store.unlocked, true)
    assert.equal(ls.get('progress_token'), 'секрет', 'пробелы обрезаны')
    assert.equal(ls.get('progress_verified'), '1')
  })

  test('401: токен и подтверждение стираются, доступ закрыт', async () => {
    globalThis.fetch = reply(401)
    assert.equal(await store.connect('чужой'), false)
    assert.equal(store.unlocked, false)
    assert.equal(ls.get('progress_token') ?? null, null)
    assert.equal(store.syncMessage, 'неверный токен')
  })

  test('пустой токен не отправляется', async () => {
    let called = false
    globalThis.fetch = async () => ((called = true), reply(200)())
    assert.equal(await store.connect('   '), false)
    assert.equal(called, false)
  })

  test('сервер недоступен при первом входе: доступа нет', async () => {
    assert.equal(await store.connect('токен'), false)
    assert.equal(store.unlocked, false)
    assert.equal(store.syncMessage, 'сервер недоступен')
  })

  test('уже подтверждённый вход переживает недоступный сервер', async () => {
    globalThis.fetch = reply(200, { v: 1, updated: 0 })
    await store.connect('токен')
    globalThis.fetch = offline
    await store.init()
    assert.equal(store.unlocked, true)
    assert.equal(store.sync, 'error')
  })

  test('401 позже тоже закрывает доступ', async () => {
    globalThis.fetch = reply(200, { v: 1, updated: 0 })
    await store.connect('токен')
    globalThis.fetch = reply(401)
    await store.init()
    assert.equal(store.unlocked, false)
  })

  test('более свежий прогресс с сервера побеждает', async () => {
    store.record({ ok: true, source: 'game' }) // локально 10 очков
    globalThis.fetch = reply(200, { v: 1, updated: Date.now() + 60_000, xp: 500 })
    await store.connect('токен')
    assert.equal(store.data.xp, 500)
  })

  test('более свежий локальный прогресс уходит на сервер', async () => {
    store.record({ ok: true, source: 'game' })
    const calls = []
    globalThis.fetch = async (url, opt = {}) => {
      calls.push(opt.method ?? 'GET')
      return reply(200, { v: 1, updated: 1, xp: 0 })()
    }
    await store.connect('токен')
    assert.deepEqual(calls, ['GET', 'PUT'])
  })

  test('выход стирает токен', async () => {
    globalThis.fetch = reply(200, { v: 1, updated: 0 })
    await store.connect('токен')
    store.disconnect()
    assert.equal(store.unlocked, false)
    assert.equal(ls.get('progress_verified') ?? null, null)
  })
})
