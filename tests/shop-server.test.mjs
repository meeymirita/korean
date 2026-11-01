import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const day = '2026-10-30'
const answer = (o = {}) => ({ type: 'answer', t: 1000, day, word: '사람', ok: true, source: 'game', mode: 'mix', ...o })

describe('сервер: магазин Юны', () => {
  let s
  before(async () => (s = await start()))
  const ops = (...list) => s.call('POST', '/api/ops', OWNER, { ops: list })
  const shop = async (path = '') => (await s.call('GET', '/api/shop' + path, OWNER)).json()
  const post = (path, body) => s.call('POST', '/api/shop/' + path, OWNER, { day, ...body })

  test('в начале 100 монеток в подарок, инвентарь пуст', async () => {
    const st = await shop()
    assert.deepEqual([st.coins, st.inv], [100, {}])
  })

  test('покупка списывает монетки и кладёт предмет в инвентарь; не хватает монеток — 400', async () => {
    const r = await (await post('buy', { id: 'hint' })).json()
    assert.deepEqual([r.coins, r.inv.hint], [85, 1])
    assert.equal((await post('buy', { id: 'nothing' })).status, 400)
    await post('buy', { id: 'double' })
    await post('buy', { id: 'shield' }) // 85 - 40 - 35 = 10
    assert.equal((await post('buy', { id: 'shield' })).status, 400, 'не хватает')
    assert.equal((await shop()).coins, 10)
  })

  test('защита опыта гасит одну ошибку, двойная награда удваивает монетки серии', async () => {
    await post('use', { id: 'shield' })
    await post('use', { id: 'double' })
    assert.deepEqual((await shop()).active, { shield: true, double: true })
    await ops(answer({ t: 5000 }), answer({ t: 5001 }))
    const p = await (await s.call('GET', '/api/progress', OWNER)).json()
    assert.equal(p.coins, 10 + 2 * 2 * 2) // 2 ответа, по 2 монетки ×2
    await ops(answer({ t: 5002, ok: false }))
    const q = await (await s.call('GET', '/api/progress', OWNER)).json()
    assert.equal(q.xp, 20, 'ошибка под защитой очков не отняла')
    assert.equal((await shop()).active.shield, false)
    await ops({ type: 'round', t: 5003, day, id: 'r1', size: 5, right: 2 })
    assert.equal((await shop()).active.double, false, 'двойная награда на одну серию')
    assert.equal((await post('use', { id: 'shield' })).status, 400, 'предмета больше нет')
  })

  test('сюрпризы: набор подсказок даёт 5, случайный набор 3–5 предметов', async () => {
    await ops(...Array.from({ length: 60 }, (_, i) => answer({ t: 6000 + i }))) // монетки на сюрпризы
    let st = await shop()
    const before = st.coins
    const h = await (await post('buy', { id: 'hints' })).json()
    assert.equal(h.inv.hint, 6) // одна куплена раньше и пять пришло в наборе
    assert.equal(h.coins, before - 60)
    const b = await (await post('buy', { id: 'box' })).json()
    const n = Object.values(b.got).reduce((a, x) => a + x, 0)
    assert.ok(n >= 3 && n <= 5, `предметов ${n}`)
    assert.equal(b.coins, before - 160)
  })

  test('история: покупки и использования записаны, можно отфильтровать', async () => {
    const all = await (await s.call('GET', '/api/shop/log', OWNER)).json()
    assert.ok(all.some(e => e.kind === 'gift'))
    const buys = await (await s.call('GET', '/api/shop/log?kind=buy', OWNER)).json()
    assert.ok(buys.length >= 4 && buys.every(e => e.kind === 'buy' && e.amount < 0))
    const use = await (await s.call('GET', '/api/shop/log?kind=use', OWNER)).json()
    assert.equal(use.length, 2)
  })

  test('достижение выдаётся один раз: 100 верных ответов дают «Первые шаги»', async () => {
    await ops(...Array.from({ length: 50 }, (_, i) => answer({ t: 9000 + i })))
    const st = await shop()
    assert.equal(st.ach.find(a => a.id === 'first').paid, true)
    const log = await (await s.call('GET', '/api/shop/log?kind=achievement', OWNER)).json()
    assert.equal(log.filter(e => e.reason === 'Первые шаги').length, 1)
  })

  test('гостю магазин закрыт', async () => {
    const r = await s.call('GET', '/api/shop', 'Bearer wrong')
    assert.ok(r.status === 401 || r.status === 403)
  })
})
