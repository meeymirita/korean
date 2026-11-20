<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { G, type Gram } from '@/data/korean/grammar'

/**
 * Карта обучения: ветка сакуры по книгам «서울대 한국어+ 1A» и «1B» (`bk` у карточек в `grammar.ts`).
 * Пройденная тема (`st: 'ok'`) цветёт, первая непройденная по порядку книги светится («дальше»), остальные бутоны.
 * Данные только из карточек: отдельной отметки нет, пройдено то, что отметил владелец.
 */
const BOOKS = [
  { id: '1A', title: 'Книга 1A', sub: 'единицы 1–8', is: (g: Gram) => !!g.bk && !g.bk.startsWith('1B ') },
  { id: '1B', title: 'Книга 1B', sub: 'единицы 9–16', is: (g: Gram) => !!g.bk && g.bk.startsWith('1B ') },
] as const

/** «6-2 ③» или «1B 9-1 ②» → число для сортировки (единица, урок, пункт). */
const key = (bk: string) => {
  const m = /(\d+)-(\d+) ([①②③④])/.exec(bk)
  return m ? Number(m[1]) * 100 + Number(m[2]) * 10 + '①②③④'.indexOf(m[3]!) + 1 : 0
}
const unitOf = (bk: string) => Number(/(\d+)-\d+/.exec(bk)?.[1] ?? 0)

interface Node { g: Gram; state: 'ok' | 'next' | 'ahead'; x: number; y: number; up: boolean; unit: number; first: boolean }
const STEP = 96
const H = 330
const books = computed(() =>
  BOOKS.map(b => {
    const cards = G.filter(b.is).sort((a, c) => key(a.bk!) - key(c.bk!))
    const nextIdx = cards.findIndex(g => g.st !== 'ok')
    const nodes: Node[] = cards.map((g, i) => ({
      g,
      state: g.st === 'ok' ? 'ok' : i === nextIdx ? 'next' : 'ahead',
      x: 60 + i * STEP,
      y: H / 2 + Math.sin(i * 0.9) * 26,
      up: i % 2 === 0,
      unit: unitOf(g.bk!),
      first: i === 0 || unitOf(g.bk!) !== unitOf(cards[i - 1]!.bk!),
    }))
    const w = 60 * 2 + Math.max(0, nodes.length - 1) * STEP
    // ветка плавной линией через все цветки
    let d = nodes.length ? `M0 ${nodes[0]!.y}` : ''
    nodes.forEach((n, i) => {
      const p = i ? nodes[i - 1]! : { x: 0, y: n.y }
      const mx = (p.x + n.x) / 2
      d += ` C${mx} ${p.y} ${mx} ${n.y} ${n.x} ${n.y}`
    })
    if (nodes.length) d += ` L${w} ${nodes[nodes.length - 1]!.y}`
    return { ...b, nodes, w, d, done: nodes.filter(n => n.state === 'ok').length }
  }),
)
/** Название на ярлыке: без пояснения после двоеточия («에 (когда): в пятницу…» → «에 (когда)»). */
const short = (ko: string) => ko.split(':')[0]!.trim()
const PETAL = 'M0 0 C-7 -8 -6 -20 0 -26 C6 -20 7 -8 0 0Z'
const scrollers = ref<HTMLElement[]>([])
/** Лента встаёт так, чтобы «дальше» было в поле зрения. */
onMounted(async () => {
  await nextTick()
  books.value.forEach((b, i) => {
    const el = scrollers.value[i]
    const n = b.nodes.find(x => x.state === 'next')
    if (el && n) el.scrollLeft = Math.max(0, n.x - el.clientWidth / 2)
  })
})
</script>

<template>
  <div class="wrap map">
    <SectionHead id="map" :big="books.reduce((a, b) => a + b.done, 0)" />
    <p class="intro">Ветка сакуры по учебнику: пройденные темы расцвели, золотая рамка у следующей, дальше бутоны. Нажми на цветок, чтобы открыть карточку. Что пройдено, отмечаешь ты: карта берёт это из карточек.</p>
    <section v-for="(b, bi) in books" :key="b.id" class="book">
      <header class="bh">
        <h2>{{ b.title }} <small>{{ b.sub }}</small></h2>
        <span class="cnt">{{ b.done }} из {{ b.nodes.length }}</span>
      </header>
      <div :ref="el => (scrollers[bi] = el as HTMLElement)" class="scroll" tabindex="0" :aria-label="`Ветка книги ${b.id}`">
        <div class="branch" :style="{ width: b.w + 'px', height: H + 'px' }">
          <svg :width="b.w" :height="H" :viewBox="`0 0 ${b.w} ${H}`" aria-hidden="true">
            <path class="twig-base" :d="b.d" />
            <path class="twig" :d="b.d" />
            <g v-for="n in b.nodes" :key="n.g.id" :transform="`translate(${n.x} ${n.y})`" :class="['fl', n.state]">
              <circle v-if="n.state === 'next'" class="ring" r="34" />
              <path v-for="k in 5" :key="k" class="petal" :d="PETAL" :transform="`rotate(${(k - 1) * 72}) scale(${n.state === 'ahead' ? 0.62 : n.state === 'next' ? 1.15 : 1})`" />
              <circle class="core" :r="n.state === 'ahead' ? 3.5 : 5.5" />
            </g>
          </svg>
          <NuxtLink
            v-for="n in b.nodes"
            :key="n.g.id"
            class="tag"
            :class="[n.state, { up: n.up }]"
            :style="{ left: n.x - 44 + 'px', top: (n.up ? n.y - 118 : n.y + 42) + 'px' }"
            :to="{ path: '/korean/grammar', query: { g: n.g.id } }"
            :title="`${n.g.ko}: ${n.g.ru}`"
          >
            <b class="ko">{{ short(n.g.ko) }}</b>
            <small>{{ n.g.bk!.replace(/^1B /, '') }}</small>
          </NuxtLink>
          <span v-for="n in b.nodes.filter(x => x.first)" :key="'u' + n.unit" class="unit" :style="{ left: n.x - 44 + 'px' }">Единица {{ n.unit }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.map { --petal: #ffb3da; --petal-line: #e0559f; --core: #fff6c8; --vine: #e0559f; --gold: #f3b93d; --bud: #cfc8ee; --bud-line: #9d97c7; }
html[data-theme='dark'] .map { --petal: #ffd1e3; --petal-line: #ff6fae; --core: #ff4f9a; --vine: #ff9cc6; --gold: #ffcf6e; --bud: #5a3a4c; --bud-line: #a77a93; }
.intro { margin: 8px 0 18px; max-width: 760px; color: var(--muted); font-size: 14px; line-height: 1.55; }
.book { margin: 0 0 22px; padding: 14px 16px 6px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); }
.bh { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 6px 6px; }
.bh h2 { margin: 0; font-size: 20px; }
.bh h2 small { margin-left: 8px; font-size: 13px; font-weight: 500; color: var(--muted); }
.cnt { padding: 3px 12px; border-radius: 99px; background: rgba(214, 77, 169, .12); color: var(--pink, #d64da9); font-size: 13px; font-weight: 700; }
.scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: 10px; scrollbar-width: thin; border-radius: 18px; }
.branch { position: relative; }
.twig-base { fill: none; stroke: var(--line); stroke-width: 3; stroke-dasharray: 3 9; stroke-linecap: round; }
.twig { fill: none; stroke: var(--vine); stroke-width: 5; stroke-linecap: round; opacity: .85; }
.petal { fill: var(--petal); stroke: var(--petal-line); stroke-width: 1.5; }
.core { fill: var(--core); }
.fl.ahead .petal { fill: var(--bud); stroke: var(--bud-line); stroke-width: 1.2; }
.fl.ahead .core { fill: var(--bud-line); }
.ring { fill: none; stroke: var(--gold); stroke-width: 3; stroke-dasharray: 4 6; }
.tag { position: absolute; width: 88px; padding: 6px 6px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: inherit; text-align: center; text-decoration: none; line-height: 1.2; transition: transform .18s, box-shadow .18s; }
.tag:hover, .tag:focus-visible { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(100, 87, 170, .2); }
.tag b { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 14px; overflow-wrap: anywhere; }
.tag small { display: block; margin-top: 2px; font-size: 10.5px; color: var(--muted); }
.tag.ok { border-color: var(--petal-line); }
.tag.next { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(243, 185, 61, .3); }
.tag.ahead { opacity: .62; }
.unit { position: absolute; bottom: 4px; width: 88px; text-align: center; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
@media (max-width: 640px) { .book { padding: 12px 8px 4px; border-radius: 20px; } }
</style>
