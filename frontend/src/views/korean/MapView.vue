<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import FlowerNode from '@/components/korean/mapgraph/FlowerNode.vue'
import MapScenery from '@/components/korean/mapgraph/MapScenery.vue'
import PetalEdge from '@/components/korean/mapgraph/PetalEdge.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { UNIT_PASS } from '@/data/korean/exam-units'
import { archipelago, buildGraph, type GNode } from '@/data/korean/map-graph'
import { useExamStore } from '@/stores/exam'

/**
 * Карта обучения графом: все темы книг «서울대 한국어+ 1A» и «1B» (`bk` у карточек в `grammar.ts`) на одной странице.
 * Единицы книги островками, острова идут змейкой от первой темы до последней. Пройденная тема (`st: 'ok'`) цветёт,
 * первая непройденная по порядку книги светится («ты здесь»), остальные бутоны. Розовая стрелка = порядок книги,
 * фиолетовая пунктирная = «опирается на» (`DEPS` из `lab.ts`). Данные только из карточек: отдельной отметки нет.
 */
const graph = buildGraph()
const { open } = useGrammarModal()
const exams = useExamStore()
const { fitView, setCenter, onNodeClick, onNodeMouseEnter, onNodeMouseLeave, updateNode, findEdge } = useVueFlow()
onNodeClick(({ node }) => { if (node.type === 'flower') open(node.id, true) })

/** Единица сдана на экзамене единицы (80% и больше): подпись острова золотая. */
const unitPassed = (b: string, unit: number) => (exams.units[`${b}-${unit}`]?.best ?? 0) >= UNIT_PASS * 100
const BEND = { seq: 0.15, dep: 0.25 }
const done = (id: string) => graph.nodes.find(n => n.id === id)?.state === 'ok'

const bounds = shallowRef<[[number, number], [number, number]]>([[-1e5, -1e5], [1e5, 1e5]])
const minZoom = ref(0.1)
const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])
function build() {
  const built = archipelago(graph)
  const list: Node[] = graph.nodes.map((n, i) => ({
    id: n.id,
    type: 'flower',
    position: { x: built.pos[n.id]!.x - 34, y: built.pos[n.id]!.y - 34 },
    data: { n, delay: 0.2 + i * 0.03 },
  }))
  built.labels.forEach((t, i) =>
    list.push({ id: 'cap' + i, type: 'caption', position: { x: t.x - 90, y: t.y }, data: { text: t.text, gold: unitPassed(t.book, t.unit) }, draggable: false, selectable: false, focusable: false }),
  )
  // нарисованный фон под всем графом, в тех же координатах
  const xs = graph.nodes.map(n => built.pos[n.id]!.x)
  const ys = graph.nodes.map(n => built.pos[n.id]!.y)
  // фон шире графа в стороны и выше него, снизу поменьше; за его края карту не двигают (translate-extent)
  const MX = 900
  const MT = 800
  const MB = 450
  const x0 = Math.min(...xs) - MX
  const y0 = Math.min(...ys) - MT
  const w = Math.max(...xs) - Math.min(...xs) + MX * 2
  const h = Math.max(...ys) - Math.min(...ys) + MT + MB
  bounds.value = [[x0, y0], [x0 + w, y0 + h]]
  const rowsY = built.rows.map(y => y - y0)
  list.unshift({ id: 'scenery', type: 'scenery', position: { x: x0, y: y0 }, data: { w, h, rowsY }, draggable: false, selectable: false, focusable: false, zIndex: -10 })
  nodes.value = list
  edges.value = graph.edges.map((e, i) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'petal',
    data: { kind: e.kind, bend: BEND[e.kind] * (e.kind === 'dep' && i % 2 ? -1 : 1), done: done(e.from) },
  }))
}
build()

/** Наведение: связи цветка загораются, остальные гаснут, рядом короткое описание темы. */
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
const board = ref<HTMLElement | null>(null)
const tip = ref<{ n: GNode; x: number; y: number } | null>(null)
onNodeMouseEnter(({ node, event }) => {
  if (node.type !== 'flower') return
  light(node.id)
  const r = board.value?.getBoundingClientRect()
  const el = (event.target as HTMLElement).closest('.vue-flow__node')?.getBoundingClientRect()
  if (r && el) tip.value = { n: node.data.n as GNode, x: el.left + el.width / 2 - r.left, y: el.top - r.top }
})
onNodeMouseLeave(() => { light(null); tip.value = null })
const stateText = (s: GNode['state']) => (s === 'ok' ? 'пройдено ✓' : s === 'next' ? 'следующая' : 'впереди')

/** Лепестки, которые падают над доской: только украшение. */
const FALL = Array.from({ length: 12 }, (_, i) => ({ left: 4 + i * 8, delay: -i * 1.9, dur: 10 + (i % 4) * 2, size: 10 + (i % 3) * 5 }))
onBeforeUnmount(() => window.removeEventListener('resize', fitMinZoom))
const doneCount = graph.nodes.filter(n => n.state === 'ok').length
/** Дальше, чем виден весь лес, не отдалить: нижняя граница масштаба по размеру доски и фона. */
function fitMinZoom() {
  const el = board.value
  const [[ax, ay], [bx, by]] = bounds.value
  if (el) minZoom.value = Math.max(el.clientWidth / (bx - ax), el.clientHeight / (by - ay), 0.05)
}
onMounted(async () => {
  void exams.loadUnits().then(() => { build(); fitMinZoom() })
  fitMinZoom()
  window.addEventListener('resize', fitMinZoom)
  await nextTick()
  // открываем там, где сейчас учишься: приближение к теме «ты здесь» (кнопка «вписать» слева внизу возвращает весь граф)
  setTimeout(() => {
    const here = nodes.value.find(n => n.type === 'flower' && (n.data.n as GNode).state === 'next')
    if (here) void setCenter(here.position.x + 34, here.position.y + 34, { zoom: 0.85, duration: 600 })
    else void fitView({ padding: 0.12, duration: 500 })
  }, 120)
})
</script>

<template>
  <div class="wrap map">
    <SectionHead id="map" :big="doneCount" />
    <p class="intro">Единицы книги островками, ветка идёт от первой темы до последней. Пройденные темы расцвели, над следующей «ты здесь», дальше бутоны. <b class="k1">━▶</b> порядок книги, <b class="k2">┅▶</b> «опирается на». Наведи на цветок: покажется описание и загорятся его связи; нажми, чтобы открыть карточку. Что пройдено, отмечаешь ты: карта берёт это из карточек.</p>
    <div ref="board" class="board">
      <i v-for="(f, fi) in FALL" :key="fi" class="fall" aria-hidden="true" :style="{ left: f.left + '%', width: f.size + 'px', height: f.size + 'px', animationDelay: f.delay + 's', animationDuration: f.dur + 's' }" />
      <div v-if="tip" class="tip" :style="{ left: Math.min(Math.max(tip.x, 140), (board?.clientWidth ?? 800) - 140) + 'px', top: Math.max(tip.y, 140) + 'px' }">
        <b>{{ tip.n.g.ko }}</b>
        <span class="ru">{{ tip.n.g.ru }}</span>
        <span class="d">{{ tip.n.g.d }}</span>
        <small>Книга {{ tip.n.book }} · {{ tip.n.g.bk!.replace(/^1B /, '') }} · {{ stateText(tip.n.state) }}</small>
      </div>
      <ClientOnly>
        <VueFlow v-model:nodes="nodes" v-model:edges="edges" :min-zoom="minZoom" :translate-extent="bounds" :max-zoom="1.6" :nodes-connectable="false" :elements-selectable="false" :zoom-on-double-click="false">
          <template #node-flower="p"><FlowerNode :data="p.data" /></template>
          <template #node-scenery="p"><MapScenery :w="p.data.w" :h="p.data.h" :rows-y="p.data.rowsY" /></template>
          <template #node-caption="p"><div class="cap" :class="{ gold: p.data.gold }" :title="p.data.gold ? 'Экзамен единицы сдан' : undefined">{{ p.data.text }}</div></template>
          <template #edge-petal="p"><PetalEdge v-bind="p" /></template>
          <Background :gap="26" :size="1.6" pattern-color="var(--grid)" />
          <Controls position="bottom-left" :show-interactive="false" />
          <MiniMap position="bottom-right" pannable zoomable :node-color="(n: Node) => (n.type === 'scenery' ? 'transparent' : 'var(--petal-line)')" mask-color="rgba(214,77,169,.08)" />
        </VueFlow>
        <template #fallback><div class="wait">Рисую ветку…</div></template>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.map { --petal: #ff8cc2; --petal-line: #b3175f; --core: #ffd23d; --gold: #f3a81d; --bud: #eef8dc; --bud-line: #3f7a2c; --arrow: #d81b7a; --arrow2: #5b35c8; --grid: #a9d899; --bg: #bfe3b0; --lbl-bg: rgba(255, 255, 255, .8); --cap-bg: rgba(255, 255, 255, .82); --cap-ink: #4a3a7a; }
.intro { margin: 8px 0 14px; max-width: 860px; color: var(--muted); font-size: 14px; line-height: 1.55; }
.k1 { color: #d81b7a; } .k2 { color: #5b35c8; }
.board { position: relative; height: calc(100vh - 230px); min-height: 480px; border: 1px solid var(--line); border-radius: 26px; overflow: hidden; background: var(--bg); }
.wait { display: grid; place-items: center; height: 100%; color: var(--muted); }
.tip { position: absolute; z-index: 30; width: 270px; padding: 12px 16px; border: 1px solid var(--petal-line); border-radius: 18px; background: var(--surface); box-shadow: 0 14px 30px rgba(100, 87, 170, .3); transform: translate(-50%, calc(-100% - 12px)); line-height: 1.4; pointer-events: none; }
.tip b { display: block; font-size: 17px; }
.tip .ru { display: block; margin-top: 2px; font-size: 14px; }
.tip .d { display: block; margin-top: 4px; font-size: 13px; color: var(--muted); }
.tip small { display: block; margin-top: 8px; font-size: 11.5px; font-weight: 700; color: var(--petal-line); }
.fall { position: absolute; top: -20px; z-index: 5; pointer-events: none; border-radius: 80% 0 80% 0; background: var(--petal); opacity: .7; animation: fall linear infinite; }
@keyframes fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 10% { opacity: .7; } 100% { transform: translate(80px, 640px) rotate(420deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fall { display: none; } }
.cap { width: 180px; padding: 3px 0; border-radius: 99px; background: var(--cap-bg); text-align: center; font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--cap-ink); pointer-events: none; }
.cap.gold { background: rgba(243, 185, 61, .55); color: #3d2a00; box-shadow: 0 0 0 2px var(--gold); }
:deep(.vue-flow__node-scenery) { pointer-events: none !important; }
:deep(.vue-flow__node), :deep(.vue-flow__edge) { transition: opacity .25s; }
:deep(.vue-flow__node-flower:hover) { z-index: 1000 !important; }
:deep(.vue-flow__node.dim) { opacity: .18; }
:deep(.vue-flow__edge.dim) { opacity: .06; }
:deep(.vue-flow__edge.hl .line) { opacity: 1 !important; stroke-width: 5 !important; }
:deep(.vue-flow__edge.hl .head) { opacity: 1 !important; }
:deep(.vue-flow__node-flower) { cursor: pointer; }
:deep(.vue-flow__edge-path) { stroke: none; }
:deep(.vue-flow__controls) { border-radius: 14px; overflow: hidden; box-shadow: 0 4px 14px rgba(100, 87, 170, .2); }
:deep(.vue-flow__minimap) { border-radius: 14px; overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
@media (max-width: 640px) { .board { border-radius: 20px; height: calc(100vh - 260px); } }
</style>
