import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const day = '2026-10-30'
const answer = (o = {}) => ({ type: 'answer', t: 1000, day, word: '사람', ok: true, source: 'game', mode: 'mix', ...o })

describe('сервер: прогресс в базе', () => {
  let s
  before(async () => (s = await start()))
  const ops = (...list) => s.call('POST', '/api/ops', OWNER, { ops: list })
  const read = async () => (await s.call('GET', '/api/progress', OWNER)).json()

  test('сначала прогресс пустой, но в нужной форме', async () => {
    const p = await read()
    assert.deepEqual([p.v, p.xp, p.updated], [1, 0, 0])
    assert.deepEqual([p.days, p.all, p.words, p.sources, p.log], [{}, {}, {}, {}, []])
    assert.deepEqual(p.profile, { name: '', avatar: '🌸', cover: '' })
    assert.deepEqual(p.time, {})
    assert.deepEqual(p.settings, { goal: 20, cats: [], gameCats: null, marks: [], keys: {} })
  })

  test('время занятий суммируется по дням, лишнее отклоняется', async () => {
    assert.equal((await ops({ type: 'time', day, seconds: 30 }, { type: 'time', day, seconds: 45 }, { type: 'time', day: '2026-10-29', seconds: 60 })).status, 200)
    const p = await read()
    assert.deepEqual(p.time, { [day]: 75, '2026-10-29': 60 })
    for (const bad of [{ seconds: 0 }, { seconds: 3601 }, { seconds: 1.5 }, { seconds: '5' }, { day: 'вчера' }]) {
      assert.equal((await ops({ type: 'time', day, seconds: 5, ...bad })).status, 400, JSON.stringify(bad))
    }
    assert.deepEqual((await read()).time, { [day]: 75, '2026-10-29': 60 }, 'неверная пачка не применяется')
  })

  test('обложка кабинета: id картинки или пусто, остальное отклоняется', async () => {
    assert.equal((await ops({ type: 'profile', cover: '0123456789abcdef' })).status, 200)
    assert.equal((await read()).profile.cover, '0123456789abcdef')
    assert.equal((await ops({ type: 'profile', cover: '../../etc/passwd' })).status, 400)
    assert.equal((await read()).profile.cover, '0123456789abcdef')
    assert.equal((await ops({ type: 'profile', cover: '' })).status, 200)
    assert.equal((await read()).profile.cover, '')
  })

  test('без токена и с чужим токеном закрыто', async () => {
    assert.equal((await s.call('GET', '/api/progress')).status, 401)
    assert.equal((await s.call('POST', '/api/ops', 'wrong-token', { ops: [] })).status, 401)
  })

  test('ответ: очки, слово, день, источник и журнал', async () => {
    assert.equal((await ops(answer({ t: 5000 }))).status, 200)
    const p = await read()
    assert.equal(p.xp, 10)
    assert.deepEqual(p.words['사람'], { ok: 1, bad: 0, streak: 1, last: 5000 })
    assert.deepEqual([p.days[day], p.all[day]], [1, 1])
    assert.deepEqual(p.sources.game, { ok: 1, bad: 0 })
    assert.deepEqual(p.log[0], { t: 5000, w: '사람', ok: true, s: 'game', m: 'mix' })
    assert.ok(p.updated > 0)
  })

  test('ошибка обнуляет серию и очков не даёт, но день считается', async () => {
    await ops(answer({ t: 6000, ok: false }))
    const p = await read()
    assert.deepEqual([p.words['사람'].bad, p.words['사람'].streak, p.xp], [1, 0, 10])
    assert.deepEqual([p.days[day], p.all[day]], [1, 2])
    assert.deepEqual(p.sources.game, { ok: 1, bad: 1 })
  })

  test('слово выучено после трёх верных подряд: kd запоминается один раз', async () => {
    await ops(answer({ t: 7000, word: '학교' }), answer({ t: 8000, word: '학교' }), answer({ t: 9000, word: '학교' }), answer({ t: 9500, word: '학교' }))
    const w = (await read()).words['학교']
    assert.deepEqual([w.streak, w.kd], [4, 9000])
  })

  test('свои очки ответа и ответ без слова', async () => {
    const before = (await read()).xp
    await ops(answer({ t: 9600, word: null, xp: 25 }))
    const p = await read()
    assert.equal(p.xp, before + 25)
    assert.equal(p.log[0].w, null)
  })

  test('журнал: последние 300 ответов, новые первыми', async () => {
    await ops(...Array.from({ length: 320 }, (_, i) => answer({ t: 20_000 + i, word: null })))
    const log = (await read()).log
    assert.equal(log.length, 300)
    assert.equal(log[0].t, 20_319)
  })

  test('профиль и настройки сохраняются, неверные значения — 400 и ничего не меняют', async () => {
    assert.equal((await ops({ type: 'profile', name: 'mira', avatar: '🦊' }, { type: 'settings', goal: 50, cats: ['еда'], gameCats: { v: 1, a: 0 } })).status, 200)
    const p = await read()
    assert.deepEqual(p.profile, { name: 'mira', avatar: '🦊', cover: '' })
    assert.deepEqual(p.settings, { goal: 50, cats: ['еда'], gameCats: { v: 1, a: 0 }, marks: [], keys: {} })
    const bad = [
      [{ type: 'settings', goal: 7 }],
      [{ type: 'profile', name: 'я'.repeat(25) }],
      [{ type: 'settings', cats: 'нет' }],
      [{ type: 'settings', gameCats: { v: 5 } }],
      [answer({ day: 'вчера' })],
      [answer({ ok: 'да' })],
      [answer({ source: '' })],
      [answer({ xp: 5000 })],
      [{ type: 'неизвестное' }],
      [answer(), { type: 'settings', goal: 7 }], // вторая неверная: первая тоже не применяется
    ]
    const xpBefore = (await read()).xp
    for (const list of bad) assert.equal((await ops(...list)).status, 400, JSON.stringify(list).slice(0, 60))
    const after = await read()
    assert.equal(after.xp, xpBefore, 'ничего из неверных пачек не применилось')
    assert.deepEqual(after.settings, p.settings)
  })

  test('не больше 500 действий за раз; не массив — 400', async () => {
    assert.equal((await ops(...Array.from({ length: 501 }, () => answer()))).status, 400)
    assert.equal((await s.call('POST', '/api/ops', OWNER, { ops: 'нет' })).status, 400)
    assert.equal((await s.call('POST', '/api/ops', OWNER, {})).status, 400)
  })

  test('подробности ответа попадают в журнал; лишнее отвергается', async () => {
    assert.equal((await ops(answer({ t: 5100, word: null, xp: 0, detail: { q: 'Переведи: 사람', a: 'человек', y: 'друг', junk: 'x' } }))).status, 200)
    assert.deepEqual((await read()).log[0].d, { q: 'Переведи: 사람', a: 'человек', y: 'друг' })
    assert.equal((await ops(answer({ t: 5200, detail: 'строка' }))).status, 400)
    assert.equal((await ops(answer({ t: 5300, detail: { q: 'я'.repeat(301) } }))).status, 400)
  })

  test('сброс обнуляет прогресс, но оставляет профиль и настройки', async () => {
    await ops({ type: 'reset' })
    const p = await read()
    assert.deepEqual([p.xp, p.days, p.words, p.sources, p.log], [0, {}, {}, {}, []])
    assert.equal(p.profile.name, 'mira')
    assert.equal(p.settings.goal, 50)
  })

  test('загрузка копии заменяет слова, дни, очки, профиль и настройки', async () => {
    await ops(answer())
    const copy = {
      v: 1, xp: 300, days: { '2026-10-01': 7 }, all: { '2026-10-01': 9 },
      words: { 가다: { ok: 5, bad: 1, streak: 3, last: 123, kd: 100 } },
      profile: { name: 'Копия', avatar: '🌿' }, settings: { goal: 10, cats: [], gameCats: null },
    }
    assert.equal((await ops({ type: 'import', data: copy })).status, 200)
    const p = await read()
    assert.equal(p.xp, 300)
    assert.deepEqual([p.days, p.all], [{ '2026-10-01': 7 }, { '2026-10-01': 9 }])
    assert.deepEqual(p.words, { 가다: { ok: 5, bad: 1, streak: 3, last: 123, kd: 100 } })
    assert.deepEqual([p.profile.name, p.settings.goal], ['Копия', 10])
    assert.equal((await ops({ type: 'import', data: { v: 2 } })).status, 400)
  })

  test('сочетания клавиш: сохраняются на сервере, мусор, повторы и лишнее отклоняются', async () => {
    const keys = { 'nav:grammar': 'mod+shift+KeyG', 'cab:notes': 'mod+alt+KeyN' }
    assert.equal((await ops({ type: 'settings', keys })).status, 200)
    assert.deepEqual((await read()).settings.keys, keys)
    for (const bad of [{ 'nav:grammar': 'KeyG' }, { 'x:y': 'mod+KeyG' }, { 'nav:a': 'mod+KeyG', 'nav:b': 'mod+KeyG' }, [], 'mod+KeyG', null, Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`nav:${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, `mod+Key${i}`]))]) {
      assert.equal((await ops({ type: 'settings', keys: bad })).status, 400, JSON.stringify(bad).slice(0, 40))
    }
    assert.deepEqual((await read()).settings.keys, keys, 'неудачная пачка ничего не меняет')
    assert.equal((await ops({ type: 'settings', goal: 50 })).status, 200)
    assert.deepEqual((await read()).settings.keys, keys, 'другие настройки сочетания не трогают')
    assert.equal((await ops({ type: 'settings', keys: {} })).status, 200)
    assert.deepEqual((await read()).settings.keys, {})
  })

  test('закладки: сохраняются, повторы убираются, неверные ключи и лишнее отклоняются', async () => {
    assert.equal((await ops({ type: 'settings', marks: ['w:사람', 'g:ayo', 'w:사람'] })).status, 200)
    assert.deepEqual((await read()).settings.marks, ['w:사람', 'g:ayo'])
    assert.equal((await ops({ type: 'settings', marks: ['x:что-то'] })).status, 400)
    assert.equal((await ops({ type: 'settings', marks: ['w:사람', 'g:ayo', 'd:iyo'] })).status, 200, 'отметка «урок пройден»')
    assert.equal((await ops({ type: 'settings', marks: ['w:사람', 'g:ayo'] })).status, 200)
    assert.equal((await ops({ type: 'settings', marks: 'w:사람' })).status, 400)
    assert.equal((await ops({ type: 'settings', marks: Array.from({ length: 501 }, (_, i) => `w:${i}`) })).status, 400)
    assert.deepEqual((await read()).settings.marks, ['w:사람', 'g:ayo'], 'неудачная пачка ничего не меняет')
    assert.equal((await ops({ type: 'settings', goal: 50 })).status, 200)
    assert.deepEqual((await read()).settings.marks, ['w:사람', 'g:ayo'], 'другие настройки закладки не трогают')
  })

  test('настроение занятий: счётчики по дню, неверное отклоняется, сброс очищает, копия возвращает', async () => {
    const mood = (m, d = day) => ops({ type: 'mood', day: d, mood: m })
    assert.equal((await mood('easy')).status, 200)
    await mood('easy')
    await mood('hard')
    assert.deepEqual((await read()).moods[day], [2, 0, 1])
    assert.equal((await mood('great')).status, 400)
    assert.equal((await ops({ type: 'mood', day: 'вчера', mood: 'ok' })).status, 400)
    assert.deepEqual((await read()).moods[day], [2, 0, 1], 'неверное ничего не меняет')
    const copy = JSON.parse(JSON.stringify(await read()))
    await ops({ type: 'reset' })
    assert.deepEqual((await read()).moods, {})
    assert.equal((await ops({ type: 'import', data: copy })).status, 200)
    assert.deepEqual((await read()).moods[day], [2, 0, 1])
  })

  test('данные переживают перезапуск сервера', async () => {
    const t = await start()
    await t.call('POST', '/api/ops', OWNER, { ops: [answer({ t: 42 })] })
    await t.stop()
    const again = await start({ dir: t.dir })
    const p = await (await again.call('GET', '/api/progress', OWNER)).json()
    assert.equal(p.xp, 10)
    assert.equal(p.words['사람'].last, 42)
  })

  test('гость: прогресс пустой, его действия игнорируются, владельца не трогают', async () => {
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    const xp = (await read()).xp
    assert.deepEqual(await (await s.call('GET', '/api/progress', g.token)).json(), {})
    const put = await s.call('POST', '/api/ops', g.token, { ops: [answer({ xp: 500 }), { type: 'reset' }] })
    assert.equal(put.status, 200)
    assert.equal((await put.json()).guest, true)
    assert.equal((await read()).xp, xp, 'очки и данные владельца целы')
  })

  test('вход попадает в журнал событий', async () => {
    const t = await start()
    const g = await (await t.call('POST', '/api/guests', OWNER, { hours: 1, label: 'Лера' })).json()
    assert.equal((await t.call('POST', '/api/session', OWNER)).status, 200)
    assert.equal((await (await t.call('POST', '/api/session', g.token)).json()).role, 'guest')
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(`${t.dir}/app.db`, { readOnly: true })
    const rows = db.prepare("SELECT type, info FROM events WHERE type LIKE '%login'").all()
    db.close()
    assert.deepEqual(rows.map(r => [r.type, r.info]), [['login', 'владелец'], ['guest_login', 'Лера']])
  })
})
