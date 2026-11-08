import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { sections } = await load('/src/data/korean/sections.ts')
const { seoFor } = await load('/src/data/seo.ts')
after(close)

const page = (rel) => new URL('../frontend/src/pages/korean/' + rel, import.meta.url)

describe('гость (без токена) видит только открытое', () => {
  test('в разделе /korean без токена открыта только главная (решение владельца 2026-11-08)', () => {
    assert.deepEqual(sections.filter(s => !s.private).map(s => s.id), ['home'])
  })

  test('у каждой закрытой страницы раздела есть метка private (иначе AuthGate не включится)', () => {
    for (const s of sections.filter(x => x.private)) {
      const file = s.group === 'ref' ? 'ref/' + s.id + '.vue' : s.id + '.vue'
      if (!existsSync(page(file))) continue // тренажёры открываются через /game/home, у него своя метка
      const src = readFileSync(page(file), 'utf8')
      const parent = s.group === 'ref' && readFileSync(page('ref.vue'), 'utf8').includes('private: true')
      assert.ok(src.includes('private: true') || parent, `${file}: нет definePageMeta({ private: true })`)
    }
  })

  test('закрытые страницы не индексируются, а главная раздела и большой словарь открыты', () => {
    for (const p of ['/korean/words', '/korean/grammar', '/korean/ref/cheat', '/korean/ref/numbers', '/korean/cabinet']) {
      assert.equal(seoFor(p).noindex, true, p)
    }
    assert.notEqual(seoFor('/dict').noindex, true)
  })
})
