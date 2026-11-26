<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import FlowerNode from '@/components/korean/mapgraph/FlowerNode.vue'
import PetalEdge from '@/components/korean/mapgraph/PetalEdge.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { useQueryParam } from '@/composables/useQueryParam'
import { buildGraph, LAYOUTS } from '@/data/korean/map-graph'

/**
 * Карта обучения графом (пробные пять видов, ветка `feat/map-graph`): все темы книг 1A и 1B на одной странице,
 * розовые стрелки = порядок книги, фиолетовые пунктирные = «опирается на». Вид выбирается `?v=1..5`.
 */
const graph = buildGraph()
const view = useQueryParam('v', '6', ['1', '2', '3', '4', '5', '6'])
const layout = computed(() => LAYOUTS.find(l => String(l.id) === view.value)!)
const { open } = useGrammarModal()
const { fitView, onNodeClick, onNodeMouseEnter, onNodeMouseLeave, updateNode, findEdge } = useVueFlow()
onNodeClick(({ node }) => { if (!node.id.startsWith('cap')) open(node.id, true) })

const BEND: Record<number, { seq: number; dep: number }> = {
  1: { seq: 0.12, dep: 0.22 },
  2: { seq: 0, dep: 0.12 },
  3: { seq: 0.1, dep: 0.3 },
  4: { seq: 0.15, dep: 0.25 },
  5: { seq: 0.08, dep: 0.35 },
  6: { seq: 0.1, dep: 0.3 },
}
const done = (id: string) => graph.nodes.find(n => n.id === id)?.state === 'ok'

const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])
function apply() {
  const l = layout.value
  const built = l.build(graph)
  const list: Node[] = graph.nodes.map((n, i) => ({
    id: n.id,
    type: 'flower',
    position: { x: built.pos[n.id]!.x - 34, y: built.pos[n.id]!.y - 34 },
    data: { n, delay: 0.2 + i * 0.03 },
    draggable: true,
  }))
  built.labels.forEach((t, i) =>
    list.push({ id: 'cap' + i, type: 'caption', position: { x: t.x - 90, y: t.y }, data: { text: t.text }, draggable: false, selectable: false, focusable: false }),
  )
  nodes.value = list
  edges.value = graph.edges
    .filter(e => (l.edges === 'dep' ? e.kind === 'dep' : true))
    .map((e, i) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'petal',
      data: { kind: e.kind, bend: BEND[l.id]![e.kind] * (e.kind === 'dep' && i % 2 ? -1 : 1), done: done(e.from) },
    }))
  void nextTick(() => setTimeout(() => void fitView({ padding: 0.15, duration: 500 }), 60))
}
watch(view, apply, { immediate: true })
/** Наведение: связи цветка загораются, остальные гаснут. */
function light(id: string | null) {
  const near = new Set<string>(id ? [id] : [])
  for (const e of edges.value) {
    const hit = !!id && (e.source === id || e.target === id)
    if (hit) { near.add(e.source); near.add(e.target) }
    const ge = findEdge(e.id)
    if (ge) ge.class = !id ? '' : hit ? 'hl' : 'dim'
  }
  for (const n of nodes.value) if (n.type === 'flower') updateNode(n.id, { class: !id || near.has(n.id) ? '' : 'dim' })
}
onNodeMouseEnter(({ node }) => { if (node.type === 'flower') light(node.id) })
onNodeMouseLeave(() => light(null))
const FALL = Array.from({ length: 12 }, (_, i) => ({ left: 4 + i * 8, delay: -i * 1.9, dur: 10 + (i % 4) * 2, size: 10 + (i % 3) * 5 }))
const doneCount = graph.nodes.filter(n => n.state === 'ok').length
</script>

<template>
  <div class="wrap mg" :class="'v' + view">
    <header class="top">
      <div>
        <h1>Карта обучения <small>графом</small></h1>
        <p>{{ doneCount }} из {{ graph.nodes.length }} тем пройдено. <b class="k1">━▶</b> порядок книги, <b class="k2">┅▶</b> «опирается на». Нажми на цветок, чтобы открыть карточку.</p>
      </div>
    </header>
    <nav class="tabs" aria-label="Вид графа">
      <button v-for="l in LAYOUTS" :key="l.id" type="button" :class="{ on: view === String(l.id) }" @click="view = String(l.id) as '1'">
        <b>{{ l.id }}. {{ l.name }}</b><small>{{ l.hint }}</small>
      </button>
    </nav>
    <div class="board">
      <i v-for="(f, fi) in FALL" :key="fi" class="fall" aria-hidden="true" :style="{ left: f.left + '%', width: f.size + 'px', height: f.size + 'px', animationDelay: f.delay + 's', animationDuration: f.dur + 's' }" />
      <ClientOnly>
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :min-zoom="0.08"
          :max-zoom="1.6"
          :nodes-connectable="false"
          :elements-selectable="false"
          :zoom-on-double-click="false"
        >
          <template #node-flower="p"><FlowerNode :data="p.data" /></template>
          <template #node-caption="p"><div class="cap">{{ p.data.text }}</div></template>
          <template #edge-petal="p"><PetalEdge v-bind="p" /></template>
          <Background :gap="26" :size="1.6" pattern-color="var(--grid)" />
          <Controls position="bottom-left" :show-interactive="false" />
          <MiniMap position="bottom-right" pannable zoomable :node-color="() => 'var(--petal-line)'" mask-color="rgba(214,77,169,.08)" />
        </VueFlow>
        <template #fallback><div class="wait">Рисую ветку…</div></template>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.mg { --petal: #ffb3da; --petal-line: #e0559f; --core: #fff6c8; --gold: #f3b93d; --bud: #cfc8ee; --bud-line: #9d97c7; --arrow: #ec6fb0; --arrow2: #8a6bd6; --grid: #f0d9e8; --bg: #fff8fc; }
html[data-theme='dark'] .mg { --petal: #ffd1e3; --petal-line: #ff6fae; --core: #ff4f9a; --gold: #ffcf6e; --bud: #5a3a4c; --bud-line: #a77a93; --arrow: #ff8cc2; --arrow2: #b9a0ff; --grid: #3a2a38; --bg: #1d1520; }
/* у каждого вида свои цвета стрелок и фон */
.mg.v2 { --arrow2: #7a55d8; --arrow: #b9a0ff; --bg: #faf7ff; --grid: #e6def8; }
.mg.v3 { --arrow: #d64da9; --arrow2: #9a7be0; --bg: #fff5fa; }
.mg.v4 { --arrow: #f08ac0; --arrow2: #8f77d9; --bg: #fdf6ff; --grid: #efdcf5; }
.mg.v5 { --arrow: #e667a8; --arrow2: #6f5fcf; --bg: #f8f6ff; --grid: #e2dcf6; }
html[data-theme='dark'] .mg.v2, html[data-theme='dark'] .mg.v3, html[data-theme='dark'] .mg.v4, html[data-theme='dark'] .mg.v5 { --bg: #1d1520; --grid: #3a2a38; }
.top h1 { margin: 0 0 4px; font-size: 24px; }
.top h1 small { font-size: 14px; font-weight: 500; color: var(--muted); }
.top p { margin: 0 0 12px; color: var(--muted); font-size: 14px; }
.k1 { color: var(--arrow); } .k2 { color: var(--arrow2); }
.tabs { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; }
.tabs button { flex: 1 0 150px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: transform .15s, box-shadow .15s; }
.tabs button:hover { transform: translateY(-2px); }
.tabs button.on { border-color: var(--petal-line); box-shadow: 0 0 0 3px rgba(224, 85, 159, .22); }
.tabs b { display: block; font-size: 15px; }
.tabs small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--muted); line-height: 1.25; }
.board { position: relative; height: calc(100vh - 250px); min-height: 460px; border: 1px solid var(--line); border-radius: 26px; overflow: hidden; background: var(--bg); }
.wait { display: grid; place-items: center; height: 100%; color: var(--muted); }
.cap { width: 180px; text-align: center; font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--arrow2); opacity: .8; pointer-events: none; }
.fall { position: absolute; top: -20px; z-index: 5; pointer-events: none; border-radius: 80% 0 80% 0; background: var(--petal); opacity: .7; animation: fall linear infinite; }
@keyframes fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 10% { opacity: .7; } 100% { transform: translate(80px, 640px) rotate(420deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fall { display: none; } }
:deep(.vue-flow__node), :deep(.vue-flow__edge) { transition: opacity .25s; }
:deep(.vue-flow__node.dim) { opacity: .18; }
:deep(.vue-flow__edge.dim) { opacity: .06; }
:deep(.vue-flow__edge.hl .line) { opacity: 1 !important; stroke-width: 5 !important; }
:deep(.vue-flow__edge.hl .head) { opacity: 1 !important; }
:deep(.vue-flow__node-flower) { cursor: pointer; }
:deep(.vue-flow__edge-path) { stroke: none; }
:deep(.vue-flow__controls) { border-radius: 14px; overflow: hidden; box-shadow: 0 4px 14px rgba(100, 87, 170, .2); }
:deep(.vue-flow__minimap) { border-radius: 14px; overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
</style>
