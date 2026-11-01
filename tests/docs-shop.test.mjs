import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ITEMS, SURPRISES, ACHIEVEMENTS, DAILY, DAILY_ALL, WEEKLY } = require('../server/dist/progress/coins.js')
const doc = readFileSync(new URL('../docs/shop.md', import.meta.url), 'utf8')
const rows = doc.split('\n')

test('docs/shop.md: у каждого предмета указана его цена', () => {
  for (const [id, it] of Object.entries(ITEMS)) {
    const row = rows.find(r => r.includes('`' + id + '`'))
    assert.ok(row, `предмет ${id} не описан`)
    assert.ok(row.includes(`| ${it.price} |`), `цена ${id} в доке не ${it.price}`)
  }
})

test('docs/shop.md: цены сюрпризов и награды за достижения и задания совпадают с кодом', () => {
  for (const [id, s] of Object.entries(SURPRISES)) assert.ok(doc.includes(`\`${id}\` ${s.price}`), `сюрприз ${id}`)
  for (const a of ACHIEVEMENTS) assert.ok(doc.includes(`+${a.coins}`), `достижение ${a.id}: +${a.coins}`)
  for (const d of DAILY) assert.ok(doc.includes(`+${d.coins}`), `задание ${d.id}: +${d.coins}`)
  assert.ok(doc.includes(`+${DAILY_ALL}`) && doc.includes(`+${WEEKLY.coins}`))
})
