import { G, type Gram } from './grammar'
import { DEPS } from './lab'

/**
 * Граф «Карты обучения»: узлы = карточки грамматики с `bk` (место в книге 1A/1B),
 * стрелки `seq` = порядок книги, `dep` = «опирается на» (`DEPS` из `lab.ts`).
 * Раскладка `archipelago` считает только координаты: единицы книги островками, острова идут змейкой.
 */
export type NodeState = 'ok' | 'next' | 'ahead'
export interface GNode { id: string; g: Gram; state: NodeState; unit: number; book: '1A' | '1B'; i: number }
export interface GEdge { id: string; from: string; to: string; kind: 'seq' | 'dep' }
export interface Pos { x: number; y: number }
export interface Layout { pos: Record<string, Pos>; labels: { text: string; x: number; y: number; book: string; unit: number }[]; rows: number[] }

const key = (bk: string) => {
  const m = /(\d+)-(\d+) ([①②③④])/.exec(bk)
  return m ? Number(m[1]) * 100 + Number(m[2]) * 10 + '①②③④'.indexOf(m[3]!) + 1 : 0
}
const unitOf = (bk: string) => Number(/(\d+)-\d+/.exec(bk)?.[1] ?? 0)

export function buildGraph() {
  const cards = G.filter(g => !!g.bk)
  const a = cards.filter(g => !g.bk!.startsWith('1B ')).sort((x, y) => key(x.bk!) - key(y.bk!))
  const b = cards.filter(g => g.bk!.startsWith('1B ')).sort((x, y) => key(x.bk!) - key(y.bk!))
  const all = [...a, ...b]
  const nextIdx = all.findIndex(g => g.st !== 'ok')
  const nodes: GNode[] = all.map((g, i) => ({
    id: g.id,
    g,
    state: g.st === 'ok' ? 'ok' : i === nextIdx ? 'next' : 'ahead',
    unit: unitOf(g.bk!),
    book: g.bk!.startsWith('1B ') ? '1B' : '1A',
    i,
  }))
  const ids = new Set(nodes.map(n => n.id))
  const edges: GEdge[] = []
  const seen = new Set<string>()
  const add = (from: string, to: string, kind: GEdge['kind']) => {
    const k = from + '>' + to
    if (from === to || seen.has(k)) return
    seen.add(k)
    edges.push({ id: k, from, to, kind })
  }
  nodes.forEach((n, i) => { if (i) add(nodes[i - 1]!.id, n.id, 'seq') })
  for (const [to, froms] of Object.entries(DEPS)) {
    if (!ids.has(to)) continue
    for (const f of froms) if (ids.has(f)) add(f, to, 'dep')
  }
  return { nodes, edges }
}

type Graph = ReturnType<typeof buildGraph>
const short = (ko: string) => ko.split(':')[0]!.trim()
export { short }

/** 6. «Сакура-острова»: единицы книги островками (без подложки), острова идут змейкой, как ветка. */
export function archipelago({ nodes }: Graph): Layout {
  const units = [...new Set(nodes.map(n => n.book + n.unit))]
  const pos: Layout['pos'] = {}
  const labels: Layout['labels'] = []
  const perRow = 6
  const gx = 430
  const gy = 470
  units.forEach((u, ui) => {
    const members = nodes.filter(n => n.book + n.unit === u)
    const row = Math.floor(ui / perRow)
    const col = ui % perRow
    const c = row % 2 ? perRow - 1 - col : col
    const cx = c * gx + (row % 2 ? 60 : 0)
    const cy = row * gy + Math.sin(ui * 1.1) * 40
    const r = members.length > 1 ? 62 + members.length * 12 : 0
    const turn = row % 2 ? Math.PI : 0
    members.forEach((n, k) => {
      const t = (k / members.length) * Math.PI * 2 - Math.PI / 2 + turn
      pos[n.id] = { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r }
    })
    const done = members.filter(n => n.state === 'ok').length
    labels.push({ text: `${members[0]!.book} · единица ${members[0]!.unit} · ${done}/${members.length}`, x: cx, y: cy - r - 120, book: members[0]!.book, unit: members[0]!.unit })
  })
  const rows = [...new Set(units.map((_, ui) => Math.floor(ui / perRow) * gy))]
  return { pos, labels, rows }
}
