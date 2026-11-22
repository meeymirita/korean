// Карта мест из влогов: данные мест и районов, значки, поиск влогов по ключевым словам.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const M = await load('/src/data/korean/vlog-map.ts')
const A = await load('/src/data/korean/vlog-map-art.ts')
const { VLOGS } = await load('/src/data/korean/vlogs.ts')
after(close)

test('места: уникальные id, район существует, координаты на карте, значок нарисован, есть слова поиска', () => {
  const ids = new Set()
  const districts = new Set([...M.DISTRICTS.map(d => d.id), 'sea'])
  for (const p of M.PLACES) {
    assert.ok(!ids.has(p.id), `повтор ${p.id}`)
    ids.add(p.id)
    assert.ok(districts.has(p.district), `${p.id}: нет района ${p.district}`)
    assert.ok(p.x > 80 && p.x < M.MAP_W - 80 && p.y > 120 && p.y < M.MAP_H - 40, `${p.id}: вне карты`)
    assert.ok(A.ICON_DEFS.includes(`id="vm-${p.icon}"`), `${p.id}: нет значка ${p.icon}`)
    assert.ok(p.keys.length && p.keys.every(k => k.length >= 2), `${p.id}: слова поиска`)
    assert.match(p.color, /^#[0-9a-f]{6}$/i)
    assert.ok(p.ko && p.ru && p.note)
  }
})

test('места не налезают друг на друга и у каждого района есть место', () => {
  for (let i = 0; i < M.PLACES.length; i++) for (let j = i + 1; j < M.PLACES.length; j++) {
    const a = M.PLACES[i], b = M.PLACES[j]
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 120, `${a.id} и ${b.id} слишком близко`)
  }
  for (const d of M.DISTRICTS) assert.ok(M.PLACES.some(p => p.district === d.id), `в районе ${d.id} нет мест`)
})

test('индекс влогов: у мест есть фразы и влоги, влоги существуют, районы суммируют места', () => {
  const idx = M.mapIndex()
  assert.equal(idx.size, M.PLACES.length)
  const known = new Set(VLOGS.map(v => v.id))
  let withVlogs = 0
  for (const [id, s] of idx) {
    assert.ok(s.vlogs.every(v => known.has(v.id) && v.count > 0), id)
    for (let i = 1; i < s.vlogs.length; i++) assert.ok(s.vlogs[i - 1].count >= s.vlogs[i].count, `${id}: порядок`)
    assert.ok(s.phrases.length <= 8)
    if (s.vlogs.length) withVlogs++
  }
  assert.ok(withVlogs >= M.PLACES.length - 3, `мест без влогов слишком много: ${M.PLACES.length - withVlogs}`)
  const d = M.districtStat('food')
  assert.equal(d.total, d.places.reduce((a, p) => a + idx.get(p.id).total, 0))
  assert.ok(d.vlogs.length >= 5)
})
