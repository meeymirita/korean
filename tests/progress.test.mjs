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
const sleep = ms => new Promise(r => setTimeout(r, ms))
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
    assert.deepEqual(d.profile, { name: '', avatar: '🌸', cover: '' })
    assert.deepEqual(d.time, {})
    assert.deepEqual(d.settings, { goal: 20, cats: [], gameCats: null, marks: [], keys: {} })
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

  test('обложка кабинета: id картинки запоминается и уходит на сервер, мусорный id не принимается', () => {
    store.setProfile({ cover: '0123456789abcdef' })
    assert.equal(store.data.profile.cover, '0123456789abcdef')
    store.setProfile({ cover: '' })
    assert.equal(store.data.profile.cover, '')
    assert.equal(normalize({ v: 1, profile: { cover: '../x' } }).profile.cover, '')
  })

  test('время занятий: секунды прибавляются к сегодняшнему дню, нулевое и дробное не считается лишним', () => {
    store.addTime(0)
    store.addTime(0.4)
    assert.deepEqual(store.data.time, {})
    store.addTime(30)
    store.addTime(45.9)
    assert.equal(store.data.time[dayKey()], 75)
  })

  test('настройки: цель только из списка', () => {
    store.setSettings({ goal: 50 })
    store.setSettings({ goal: 33 })
    assert.equal(store.goal, 50)
  })

  test('экспорт и импорт возвращают те же данные, мусор не принимается', async () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    const json = store.exportJson()
    await store.reset()
    assert.equal(store.data.xp, 0)
    assert.equal(await store.importJson(json), true)
    assert.equal(store.data.xp, 10)
    assert.equal(await store.importJson('не json'), false)
    assert.equal(await store.importJson('{"v":2}'), false)
  })

  test('круг «экспорт → сброс → импорт» возвращает слова, дни, время, журнал, профиль и настройки', async () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    store.record({ word: '사람', ok: false, source: 'today' })
    store.record({ word: '친구', ok: true, source: 'trainer' })
    store.setProfile({ name: 'Хлеб', avatar: '🌿' })
    store.setSettings({ goal: 50 })
    store.addTime(120)
    const before = JSON.parse(store.exportJson())
    assert.equal(before.v, 1)
    await store.reset()
    assert.deepEqual(store.data.words, {})
    assert.equal(await store.importJson(JSON.stringify(before)), true)
    const after = JSON.parse(store.exportJson())
    after.updated = before.updated = 0 // метка времени импорта меняется
    assert.deepEqual(after, before)
    assert.equal(store.data.profile.name, 'Хлеб')
    assert.equal(store.goal, 50)
  })

  test('импорт принимает копию старой версии без времени, профиля и настроек', async () => {
    const old = JSON.stringify({ v: 1, xp: 40, days: { '2026-10-01': 3 }, all: { '2026-10-01': 4 }, words: { 사람: { ok: 2, bad: 0, streak: 2, last: 5 } } })
    assert.equal(await store.importJson(old), true)
    assert.equal(store.data.xp, 40)
    assert.deepEqual(store.data.time, {})
    assert.equal(store.goal, 20)
    assert.equal(store.data.profile.avatar, '🌸')
  })

  test('импорт отбрасывает лишние поля и не доверяет странным числам', async () => {
    const evil = { v: 1, xp: 5, hack: '<script>alert(1)</script>', words: { 사람: { ok: 1, bad: 0, streak: 1, last: 1, extra: 'x' } }, profile: { name: 'x'.repeat(500) } }
    assert.equal(await store.importJson(JSON.stringify(evil)), true)
    const out = JSON.parse(store.exportJson())
    assert.ok(!('hack' in out))
    assert.ok(!('extra' in out.words['사람']))
    assert.ok(out.profile.name.length < 100, 'имя не бесконечное')
  })

  test('файл с пустым содержимым, массивом, null и числом не принимается и данные не трогает', async () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    const xp = store.data.xp
    for (const bad of ['', '[]', 'null', '5', '"текст"', '{', '{"v":"1"}']) assert.equal(await store.importJson(bad), false, bad)
    assert.equal(store.data.xp, xp)
  })

  test('закладки: звёздочка ставится и снимается, уходит на сервер, мусор из файла отбрасывается', () => {
    assert.equal(store.isMarked('w', '사람'), false)
    assert.equal(store.toggleMark('w', '사람'), true)
    store.toggleMark('g', 'ayo')
    assert.deepEqual(store.data.settings.marks, ['w:사람', 'g:ayo'])
    assert.equal(store.isMarked('g', 'ayo'), true)
    store.toggleMark('w', '사람')
    assert.deepEqual(store.data.settings.marks, ['g:ayo'])
    const d = normalize({ v: 1, settings: { marks: ['w:친구', 'w:친구', 5, 'плохо', 'g:x'] } })
    assert.deepEqual(d.settings.marks, ['w:친구', 'g:x'])
  })

  test('сочетания клавиш: попадают в настройки и на сервер, мусор из файла отбрасывается', () => {
    store.setSettings({ keys: { 'nav:grammar': 'mod+shift+KeyG' } })
    assert.deepEqual(store.data.settings.keys, { 'nav:grammar': 'mod+shift+KeyG' })
    const d = normalize({ v: 1, settings: { keys: { 'nav:grammar': 'mod+KeyG', 'nav:words': 'mod+KeyG', 'cab:notes': 'KeyN', 'nav:zzz': 'mod+KeyJ', 'nav:today': 'mod+KeyK' } } })
    // повтор сочетания: остаётся пункт, который раньше в меню (Слова)
    assert.deepEqual(d.settings.keys, { 'nav:words': 'mod+KeyG' })
    assert.deepEqual(normalize({ v: 1 }).settings.keys, {})
  })

  test('закладок не больше лимита', () => {
    for (let i = 0; i < 500; i++) assert.equal(store.toggleMark('w', 'слово' + i), true)
    assert.equal(store.toggleMark('w', 'лишнее'), false)
    assert.equal(store.data.settings.marks.length, 500)
    assert.equal(store.toggleMark('w', 'слово0'), true, 'снять закладку можно всегда')
  })

  test('сброс обнуляет прогресс, но оставляет профиль и настройки', async () => {
    store.setProfile({ name: 'Хлеб' })
    store.setSettings({ goal: 50 })
    store.record({ word: '사람', ok: true, source: 'game' })
    await store.reset()
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

  test('сервер главный: прогресс на сайте заменяется тем, что в базе', async () => {
    store.record({ ok: true, source: 'game' }) // локально 10 очков, но токена ещё нет, на сервер это не уходит
    globalThis.fetch = reply(200, { v: 1, updated: 5, xp: 500, words: { 사람: { ok: 3, bad: 0, streak: 3, last: 9, kd: 9 } } })
    await store.connect('токен')
    assert.equal(store.data.xp, 500)
    assert.equal(store.status('사람'), 'known')
  })

  test('выход стирает токен', async () => {
    globalThis.fetch = reply(200, { v: 1, updated: 0 })
    await store.connect('токен')
    store.disconnect()
    assert.equal(store.unlocked, false)
    assert.equal(ls.get('progress_verified') ?? null, null)
  })
})

describe('очередь действий для сервера', () => {
  const urls = []
  const bodies = []
  /** Сервер владельца: запоминает запросы и отвечает 200 на всё. */
  const serverOk = (remote = { v: 1, updated: 0 }) => async (url, opt = {}) => {
    urls.push(`${opt.method ?? 'GET'} ${url}`)
    if (opt.body) bodies.push(JSON.parse(opt.body))
    return reply(200, remote)()
  }
  const owner = () => {
    ls.set('progress_token', 't')
    ls.set('progress_verified', '1')
    setActivePinia(createPinia())
    store = useProgressStore()
  }
  beforeEach(() => {
    urls.length = 0
    bodies.length = 0
  })

  test('ответ превращается в действие: время, день, слово, источник, режим, очки', async () => {
    owner()
    globalThis.fetch = serverOk()
    store.record({ word: '사람', ok: true, source: 'game', mode: 'build', xp: 20 })
    await store.push()
    const op = bodies[0].ops[0]
    assert.deepEqual([op.type, op.word, op.ok, op.source, op.mode, op.xp], ['answer', '사람', true, 'game', 'build', 20])
    assert.equal(op.day, dayKey())
    assert.ok(op.t > 0 && op.t === store.data.log[0].t, 'то же время, что в журнале на сайте')
  })

  test('действия копятся и уходят одним запросом через долю секунды', async () => {
    owner()
    globalThis.fetch = serverOk()
    store.record({ word: 'а', ok: true, source: 'game' })
    store.record({ word: 'б', ok: false, source: 'game' })
    store.setProfile({ name: 'mira' })
    assert.equal(urls.length, 0, 'сразу не отправляется')
    await sleep(1000)
    assert.deepEqual(urls, ['POST /api/ops'], 'один запрос')
    assert.deepEqual(bodies[0].ops.map(o => o.type), ['answer', 'answer', 'profile'])
    assert.equal(store.sync, 'ok')
  })

  test('профиль и настройки уходят действиями (неверная цель на сервер не уходит)', async () => {
    owner()
    globalThis.fetch = serverOk()
    store.setProfile({ name: 'mira', avatar: '🦊' })
    store.setSettings({ goal: 50, cats: ['еда'], gameCats: { v: 1 } })
    store.setSettings({ goal: 7 })
    await store.push()
    const ops = bodies[0].ops
    assert.deepEqual(ops.map(o => o.type), ['profile', 'settings', 'settings'])
    assert.deepEqual(ops[0], { type: 'profile', name: 'mira', avatar: '🦊' })
    assert.deepEqual(ops[1], { type: 'settings', goal: 50, cats: ['еда'], gameCats: { v: 1 } })
    assert.deepEqual(ops[2], { type: 'settings' })
  })

  test('сброс и загрузка копии с сервером: повторный токен уходит заголовком, сначала накопленное, не вышло — ничего не меняется', async () => {
    owner()
    const heads = []
    globalThis.fetch = async (url, opt = {}) => {
      urls.push(`${opt.method ?? 'GET'} ${url}`)
      if (opt.body) bodies.push(JSON.parse(opt.body))
      heads.push(opt.headers?.['X-Confirm-Token'])
      return reply(200, {})()
    }
    store.record({ word: '사람', ok: true, source: 'game' })
    await store.reset('my-token')
    assert.equal(store.data.xp, 0, 'локально обнулилось')
    assert.deepEqual(bodies.map(b => b.ops.map(o => o.type)), [['answer'], ['reset']], 'накопленный ответ ушёл раньше сброса')
    assert.deepEqual(heads, [undefined, 'my-token'], 'токен только у опасного запроса')
    store.record({ word: '친구', ok: true, source: 'game' })
    assert.equal(await store.importJson(store.exportJson(), 'my-token'), true)
    assert.equal(bodies.at(-1).ops[0].type, 'import')
    assert.equal(heads.at(-1), 'my-token')

    // сервер не принял токен: данные на сайте остаются
    store.record({ word: '아이', ok: true, source: 'game' })
    const xp = store.data.xp
    globalThis.fetch = reply(403, {})
    await assert.rejects(() => store.reset('wrong'), /неверный токен подтверждения/)
    await assert.rejects(() => store.importJson(store.exportJson(), 'wrong'), /неверный токен подтверждения/)
    assert.equal(store.data.xp, xp, 'ничего не обнулилось')
    globalThis.fetch = reply(429, {})
    await assert.rejects(() => store.reset('x'), /слишком много попыток/)
    await assert.rejects(() => store.reset('русский токен'), /неверный токен подтверждения/, 'русские буквы в заголовок не пускаем')
    globalThis.fetch = offline
    await assert.rejects(() => store.reset('x'))
    assert.equal(store.data.xp, xp)
  })

  test('без сервера (нет токена) сброс и копия работают на месте без подтверждения', async () => {
    assert.equal(store.needsConfirm(), false)
    store.record({ word: '사람', ok: true, source: 'game' })
    await store.reset()
    assert.equal(store.data.xp, 0)
  })

  test('без токена и у гостя действия никуда не копятся', async () => {
    globalThis.fetch = serverOk()
    store.record({ word: 'а', ok: true, source: 'game' }) // без токена
    await store.push()
    await sleep(900)
    assert.deepEqual(urls, [])
    assert.equal(ls.has('progress_outbox'), false)
  })

  test('очередь переживает перезагрузку и уходит на сервер раньше загрузки прогресса', async () => {
    owner()
    globalThis.fetch = offline
    store.record({ word: 'а', ok: true, source: 'game', xp: 15 })
    await sleep(900) // сервер недоступен: действие остаётся в очереди
    assert.equal(store.sync, 'error')
    assert.equal(JSON.parse(ls.get('progress_outbox')).length, 1)

    setActivePinia(createPinia()) // «перезагрузка»
    store = useProgressStore()
    globalThis.fetch = serverOk({ v: 1, updated: 9, xp: 15, words: { а: { ok: 1, bad: 0, streak: 1, last: 5 } } })
    await store.init()
    assert.deepEqual(urls, ['GET /api/progress', 'POST /api/ops', 'GET /api/progress'], 'сначала отправка, потом свежие данные')
    assert.equal(ls.get('progress_outbox'), '[]')
    assert.equal(store.data.xp, 15)
  })

  test('сервер недоступен: очередь и локальные данные остаются, статус — ошибка', async () => {
    owner()
    globalThis.fetch = offline
    store.record({ word: 'а', ok: true, source: 'game' })
    await store.init()
    assert.equal(store.unlocked, true, 'подтверждённый вход не сбрасывается')
    assert.equal(store.sync, 'error')
    assert.equal(store.data.xp, 10, 'ответ на экране не пропал')
    assert.equal(JSON.parse(ls.get('progress_outbox')).length, 1)
  })

  test('при сбое отправки перед загрузкой серверные данные не затирают неотправленное', async () => {
    owner()
    store.record({ word: 'а', ok: true, source: 'game' })
    globalThis.fetch = async (url, opt = {}) => (opt.method === 'POST' ? reply(500)() : reply(200, { v: 1, updated: 1, xp: 0 })())
    await store.init()
    assert.equal(store.data.xp, 10, 'локальный ответ не потерян')
    assert.equal(store.syncMessage, 'не всё отправлено: изменения сохранены в браузере')
  })

  test('401 при отправке закрывает доступ', async () => {
    owner()
    globalThis.fetch = reply(401)
    store.record({ word: 'а', ok: true, source: 'game' })
    await store.push()
    assert.equal(store.unlocked, false)
  })

  test('сервер отклонил пачку (400): она выбрасывается и очередь не застревает', async () => {
    owner()
    globalThis.fetch = reply(400, { error: 'invalid op' })
    store.record({ word: 'а', ok: true, source: 'game' })
    await store.push()
    assert.equal(ls.get('progress_outbox'), '[]')
    assert.equal(store.syncMessage, 'сервер отклонил часть действий')
  })

  test('большая очередь уходит пачками по 200', async () => {
    owner()
    globalThis.fetch = serverOk()
    for (let i = 0; i < 450; i++) store.record({ word: null, ok: true, source: 'game' })
    await store.push()
    assert.deepEqual(bodies.map(b => b.ops.length), [200, 200, 50])
  })

  test('вход по токену записывается в журнал событий сервера', async () => {
    globalThis.fetch = serverOk()
    await store.connect('токен')
    await sleep(5)
    assert.ok(urls.includes('POST /api/session'))
  })
})
