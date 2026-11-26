import { G, type Gram } from './grammar'
import { DEPS } from './lab'

/**
 * Граф «Карты обучения»: узлы = карточки грамматики с `bk` (место в книге 1A/1B),
 * стрелки `seq` = порядок книги, `dep` = «опирается на» (`DEPS` из `lab.ts`).
 * Пять раскладок (`LAYOUTS`) считают только координаты, сами узлы и стрелки одни и те же.
 */
export type NodeState = 'ok' | 'next' | 'ahead'
export interface GNode { id: string; g: Gram; state: NodeState; unit: number; book: '1A' | '1B'; i: number }
export interface GEdge { id: string; from: string; to: string; kind: 'seq' | 'dep' }
export interface Pos { x: number; y: number }
export interface Layout { pos: Record<string, Pos>; labels: { text: string; x: number; y: number; big?: boolean; r?: number }[] }

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

/** 1. «Ветка»: одна длинная извилистая лента змейкой, от первой карточки к последней. */
function snake({ nodes }: Graph): Layout {
  const perRow = 13
  const dx = 150
  const dy = 200
  const pos: Layout['pos'] = {}
  nodes.forEach((n, i) => {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const c = row % 2 ? perRow - 1 - col : col
    pos[n.id] = { x: c * dx, y: row * dy + Math.sin(i * 0.9) * 26 }
  })
  return { pos, labels: [] }
}

/** 2. «Слои»: колонки по глубине зависимостей, слева база, справа самые «высокие» темы. */
function layers({ nodes, edges }: Graph): Layout {
  const deps = edges.filter(e => e.kind === 'dep')
  const linked = new Set(deps.flatMap(e => [e.from, e.to]))
  const depth: Record<string, number> = {}
  const dep = (id: string, seen: string[] = []): number => {
    if (id in depth) return depth[id]!
    if (seen.includes(id)) return 0
    const ups = deps.filter(e => e.to === id).map(e => dep(e.from, [...seen, id]))
    return (depth[id] = ups.length ? 1 + Math.max(...ups) : 0)
  }
  const cols: string[][] = []
  const lone: string[] = []
  nodes.forEach(n => {
    if (!linked.has(n.id)) { lone.push(n.id); return }
    const d = dep(n.id)
    ;(cols[d] ??= []).push(n.id)
  })
  cols.push(lone)
  const pos: Layout['pos'] = {}
  const labels: Layout['labels'] = []
  cols.forEach((col, ci) => {
    if (!col) return
    col.forEach((id, ri) => { pos[id] = { x: ci * 230, y: ri * 120 + (ci % 2) * 40 } })
    labels.push({ text: ci === cols.length - 1 ? 'отдельные темы' : ci === 0 ? 'основа' : `уровень ${ci}`, x: ci * 230, y: -90, big: true })
  })
  return { pos, labels }
}

/** 6. «Сакура-острова»: единицы книги островками на мягких пятнах, острова идут змейкой, как ветка. */
function archipelago({ nodes }: Graph): Layout {
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
    labels.push({ text: '', x: cx, y: cy, r: r + 105 })
    labels.push({ text: `${members[0]!.book} · единица ${members[0]!.unit} · ${done}/${members.length}`, x: cx, y: cy - r - 120, big: true })
  })
  return { pos, labels }
}

/** 4. «Острова»: каждая единица книги отдельным кружком из цветов, острова идут по сетке. */
function islands({ nodes }: Graph): Layout {
  const units = [...new Set(nodes.map(n => n.book + n.unit))]
  const pos: Layout['pos'] = {}
  const labels: Layout['labels'] = []
  const perRow = 4
  const gx = 520
  const gy = 520
  units.forEach((u, ui) => {
    const members = nodes.filter(n => n.book + n.unit === u)
    const row = Math.floor(ui / perRow)
    const col = ui % perRow
    const cx = (row % 2 ? perRow - 1 - col : col) * gx
    const cy = row * gy
    const r = members.length > 1 ? 70 + members.length * 12 : 0
    members.forEach((n, k) => {
      const t = (k / members.length) * Math.PI * 2 - Math.PI / 2
      pos[n.id] = { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r }
    })
    labels.push({ text: `${members[0]!.book} · единица ${members[0]!.unit}`, x: cx, y: cy - r - 90, big: true })
  })
  return { pos, labels }
}

/** 5. «Лента»: 1A сверху слева направо, 1B снизу, зависимости дугами между ними. */
function ribbon({ nodes }: Graph): Layout {
  const pos: Layout['pos'] = {}
  const labels: Layout['labels'] = [{ text: 'Книга 1A', x: 0, y: -90, big: true }, { text: 'Книга 1B', x: 0, y: 410, big: true }]
  const idx = { '1A': 0, '1B': 0 }
  nodes.forEach(n => {
    const i = idx[n.book]++
    pos[n.id] = { x: i * 150, y: (n.book === '1A' ? 0 : 500) + (i % 2 ? 70 : -20) }
  })
  return { pos, labels }
}

export const LAYOUTS = [
  { id: 1, name: 'Ветка', hint: 'одна змейка от первой темы до последней', build: snake, edges: 'seq+dep' },
  { id: 2, name: 'Слои', hint: 'что на чём стоит: основа слева, сложное справа', build: layers, edges: 'dep' },
  { id: 6, name: 'Сакура-острова', hint: 'единицы книги островками, ветка идёт змейкой', build: archipelago, edges: 'seq+dep' },
  { id: 4, name: 'Острова', hint: 'каждая единица книги цветочным островком', build: islands, edges: 'seq+dep' },
  { id: 5, name: 'Лента', hint: '1A над 1B, связи тем дугами', build: ribbon, edges: 'seq+dep' },
] as const
