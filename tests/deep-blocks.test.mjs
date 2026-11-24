import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { G } = await load('/src/data/korean/grammar.ts')
const { blocksHtml, blk } = await load('/src/data/korean/render.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
after(close)

const plain = s => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1')
const deepCards = G.filter(g => g.b.some(b => b[0] === 'deep'))

describe('«Глубже» в карточках (метка deep)', () => {
  test('блок после метки уезжает в <details>, до метки остаётся как есть; без метки ничего не меняется', () => {
    const b = [['p', 'до'], ['deep', 'Глубже: тест'], ['p', 'после'], ['ex', [['가요.', 'Иду.']]]]
    const html = blocksHtml(b)
    assert.match(html, /^<p>до<\/p><details class="deep"><summary>Глубже: тест<\/summary><div class="deep-in"><p>после<\/p>/)
    assert.equal(html.split('<details').length, 2)
    assert.equal(blk(['deep', 'x']), '')
    const plainBlocks = [['p', 'a'], ['p', 'b']]
    assert.equal(blocksHtml(plainBlocks), '<p>a</p><p>b</p>')
  })

  test('метка одна на карточку, не первая и не последняя', () => {
    assert.ok(deepCards.length > 0)
    for (const g of deepCards) {
      const at = g.b.map((b, i) => (b[0] === 'deep' ? i : -1)).filter(i => i >= 0)
      assert.equal(at.length, 1, `${g.id}: меток deep ${at.length}`)
      assert.ok(at[0] > 0 && at[0] < g.b.length - 1, `${g.id}: метка должна стоять внутри карточки`)
    }
  })

  test('все предложения под меткой разбираются без «нет в словаре» (только слова и пройденная грамматика)', () => {
    for (const g of deepCards) {
      const rest = g.b.slice(g.b.findIndex(b => b[0] === 'deep') + 1)
      for (const b of rest.filter(x => x[0] === 'ex'))
        for (const [ko] of b[1]) {
          const text = plain(ko).replace(/^[가나]: /, '')
          const bad = analyze(text).filter(x => x.type === 'unknown').map(x => x.text)
          assert.deepEqual(bad, [], `${g.id}: «${text}» не разобрано: ${bad}`)
        }
    }
  })

  test('пройденные карточки не уходят вперёд: «Глубже» только у карточек со статусом ok', () => {
    for (const g of deepCards) assert.equal(g.st, 'ok', g.id)
  })
})
