import { describe, expect, it } from 'vitest'
import { G } from '@/data/korean/grammar'
import { DEPS } from '@/data/korean/lab'
import { archipelago, buildGraph } from '@/data/korean/map-graph'

// «Карта обучения»: узел на каждую карточку из книг 1A и 1B, пройдено только то, что отмечено в данных.
describe('граф карты обучения', () => {
  const cards = G.filter(g => g.bk)
  const { nodes, edges } = buildGraph()
  it('узел на каждую карточку; расцветшие = пройденные; одна «следующая» — первая непройденная по порядку книги', () => {
    expect(nodes.length).toBe(cards.length)
    expect(nodes.filter(n => n.state === 'ok').length).toBe(cards.filter(g => g.st === 'ok').length)
    const next = nodes.filter(n => n.state === 'next')
    expect(next.length).toBe(1)
    expect(nodes.slice(0, nodes.indexOf(next[0]!)).every(n => n.state === 'ok')).toBe(true)
    expect(nodes.filter(n => n.book === '1A').every((n, i, a) => !i || n.i > a[i - 1]!.i)).toBe(true)
  })
  it('стрелки: цепочка книги без разрывов и зависимости из DEPS без повторов', () => {
    const seq = edges.filter(e => e.kind === 'seq')
    expect(seq.length).toBe(nodes.length - 1)
    const ids = new Set(nodes.map(n => n.id))
    for (const [to, froms] of Object.entries(DEPS)) {
      for (const f of froms) if (ids.has(to) && ids.has(f)) expect(edges.some(e => e.from === f && e.to === to)).toBe(true)
    }
    expect(new Set(edges.map(e => e.id)).size).toBe(edges.length)
  })
  it('раскладка: у каждого узла своё место, подпись на каждую единицу', () => {
    const { pos, labels } = archipelago({ nodes, edges })
    expect(new Set(nodes.map(n => `${Math.round(pos[n.id]!.x)}:${Math.round(pos[n.id]!.y)}`)).size).toBe(nodes.length)
    expect(labels.length).toBe(new Set(nodes.map(n => n.book + n.unit)).size)
  })
})
