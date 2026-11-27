<script setup lang="ts">
/**
 * Вид «Книжная полка» страницы грамматики: полки (свои карточки, книга 1A, книга 1B), на них корешки-карточки.
 * Корешки можно переставлять (`dragSort`, порядок помнится), по нажатию открывается книга: содержимое карточки режется на страницы, их листают
 * стрелками, кнопками, свайпом и за уголок страницы (`dragPointer`: лист тянется за краем, отпустил за серединой — перевернулся).
 * Описание: docs/data.md, «Страница грамматики: виды».
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Gram } from '@/data/korean/grammar'
import { F, blk, esc } from '@/data/korean/render'
import { dragPointer, dragSort } from '@/lib/dragdrop'
import { formulaOf, moveId, orderBy, plain, secColor, shelvesOf, spineLabel, spineSize } from '@/lib/grammarView'
import { usePersisted } from '@/composables/usePersisted'

const props = defineProps<{ cards: Gram[]; noBookLabel: string }>()
const emit = defineEmits<{ open: [id: string] }>()

/** порядок корешков на полках, которым их расставил владелец: {полка: [id…]} */
const saved = usePersisted<Record<string, string[]>>('grammar_shelf_order', {}, v => typeof v === 'object' && v !== null && !Array.isArray(v))
const shelves = computed(() => shelvesOf(props.cards, props.noBookLabel).map(s => ({ ...s, cards: orderBy(s.cards, saved.value[s.key]) })))
const hint = (g: Gram) => `${g.bk ? `${g.bk} · ` : ''}${plain(g.ko)} — ${plain(g.ru)}`

/* ---------- перестановка корешков ---------- */
const room = ref<HTMLElement>()
let stops: Array<() => void> = []
function setupSort() {
  stops.forEach(s => s())
  stops = []
  room.value?.querySelectorAll<HTMLElement>('.row').forEach(row => {
    const key = row.dataset.shelf!
    stops.push(
      dragSort({
        items: row.querySelectorAll('.spine'),
        slot: t => t.parentElement!,
        idOf: t => t.dataset.id!,
        onMove: (id, overId, after) => {
          const ids = shelves.value.find(s => s.key === key)?.cards.map(g => g.id) ?? []
          saved.value = { ...saved.value, [key]: moveId(ids, id, overId, after) }
        },
      }),
    )
  })
}
const setKey = computed(() => props.cards.map(g => g.id).join())
onMounted(() => setupSort())
watch(setKey, () => void nextTick(setupSort), { flush: 'post' })
function resetOrder() {
  saved.value = {}
}

/* ---------- книга ---------- */
const book = ref<Gram | null>(null)
const pages = ref<string[]>([])
const sp = ref(0)
/** какие страницы лежат под листом: слева и справа */
const under = ref({ l: 0, r: 1 })
const spreadEl = ref<HTMLElement>()
const leafHost = ref<HTMLElement>()
const spreads = computed(() => pages.value.length / 2)
const color = computed(() => (book.value ? secColor(book.value) : '#8f7cf0'))

const pgBox = (i: number) => {
  const p = pages.value[i]
  return `<div class="pg${i % 2 === 0 ? ' l' : ''} rich${p ? '' : ' blank'}">${p ? `${p}<div class="pn">${i + 1}</div>` : ''}</div>`
}

/** Режем карточку на страницы по высоте: заголовочная страница, потом блоки (примеры по два ряда), «Глубже» раскрыто. */
function paginate(g: Gram, halfW: number, H: number): string[] {
  const out: string[] = []
  const head = `<div class="no">${esc(g.bk ?? 'вне книги')} · ${esc(g.s)}</div><h2>${F(g.ko)}</h2><div class="ru">${esc(plain(g.ru))}</div>`
  if (g.ahead) {
    out.push(`${head}<p class="soon">Эту тему ещё не проходили.<br>Страницы склеены: карточка заполнится по материалам Леры.</p>`)
    return out
  }
  const formula = formulaOf(g)
  out.push(`${head}${formula ? `<div class="formula">${F(formula)}</div>` : ''}<p class="turn">Листай стрелками, кнопками внизу, свайпом или за уголок страницы.</p>`)
  const items: string[] = []
  let first = true
  for (const b of g.b) {
    if (b[0] === 'deep') {
      items.push(`<h4>${F(b[1])}</h4>`)
      continue
    }
    if (b[0] === 'formula' && first) {
      first = false
      continue
    }
    if (b[0] === 'ex') {
      for (let k = 0; k < b[1].length; k += 2) items.push(blk(['ex', b[1].slice(k, k + 2)]))
      continue
    }
    items.push(blk(b))
  }
  // та же вёрстка, что у настоящей страницы, но за экраном
  const wrap = document.createElement('div')
  wrap.className = 'study sky gbook-measure'
  wrap.style.cssText = 'position:absolute;left:-9999px;top:0;min-height:0;background:none'
  const m = document.createElement('div')
  m.className = 'pg rich'
  m.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;width:${halfW}px;height:${H}px`
  wrap.append(m)
  document.body.append(wrap)
  let cur: string[] = []
  const flush = () => {
    if (cur.length) out.push(cur.join(''))
    cur = []
    m.innerHTML = ''
  }
  for (const it of items) {
    m.insertAdjacentHTML('beforeend', it)
    if (m.scrollHeight > m.clientHeight + 1 && cur.length) {
      m.lastElementChild?.remove()
      flush()
      m.insertAdjacentHTML('beforeend', it)
    }
    cur.push(it)
  }
  flush()
  wrap.remove()
  return out
}

let stopPointer = () => {}
async function openBook(g: Gram) {
  const H = Math.min(680, innerHeight * 0.88)
  const W = Math.min(1080, innerWidth * 0.96)
  const p = paginate(g, W / 2, H)
  if (p.length % 2) p.push('')
  pages.value = p
  sp.value = 0
  leaf = null
  under.value = { l: 0, r: 1 }
  book.value = g
  await nextTick()
  if (spreadEl.value) stopPointer = dragPointer({ trigger: spreadEl.value, onPress, onStart, onMove, onEnd })
  addEventListener('keydown', onKey)
}
function closeBook() {
  stopPointer()
  stopPointer = () => {}
  removeEventListener('keydown', onKey)
  anim++
  leaf = null
  book.value = null
}
function onKey(e: KeyboardEvent) {
  if (!book.value) return
  if (e.key === 'ArrowRight') flip(1)
  else if (e.key === 'ArrowLeft') flip(-1)
  else if (e.key === 'Escape') closeBook()
}
onBeforeUnmount(() => {
  stops.forEach(s => s())
  closeBook()
})

/* ---------- живой лист: угол поворота задаёт рука, лист тянется за краем ---------- */
interface Leaf { el: HTMLElement; dir: 1 | -1; th: number; n: number; sf: HTMLElement; sb: HTMLElement; hover?: boolean }
let leaf: Leaf | null = null
let anim = 0
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const canGo = (d: number) => sp.value + d >= 0 && sp.value + d < spreads.value

function ensureLeaf(d: 1 | -1): Leaf | null {
  if (leaf) return leaf.dir === d ? leaf : null
  if (!canGo(d) || !leafHost.value) return null
  const n = sp.value + d
  const el = document.createElement('div')
  el.className = `leaf ${d > 0 ? 'r' : 'l'}`
  const front = d > 0 ? pgBox(sp.value * 2 + 1) : pgBox(sp.value * 2)
  const back = d > 0 ? pgBox(n * 2) : pgBox(n * 2 + 1)
  el.innerHTML = `<div class="fc">${front}<i class="sh"></i></div><div class="bk">${back}<i class="sh"></i></div>`
  // под листом сразу страница следующего разворота
  under.value = d > 0 ? { l: under.value.l, r: n * 2 + 1 } : { l: n * 2, r: under.value.r }
  leafHost.value.append(el)
  leaf = { el, dir: d, th: 0, n, sf: el.querySelector('.fc .sh')!, sb: el.querySelector('.bk .sh')! }
  setTh(0)
  return leaf
}
function setTh(th: number, dy = 0) {
  if (!leaf) return
  leaf.th = th
  const sin = Math.sin((th * Math.PI) / 180)
  const sg = leaf.dir > 0 ? -1 : 1
  leaf.el.style.transform = `rotateY(${sg * th}deg) skewY(${(dy * sin * sg * -1).toFixed(2)}deg)`
  leaf.sf.style.opacity = String(th < 90 ? sin * 0.55 : 0)
  leaf.sb.style.opacity = String(th >= 90 ? sin * 0.55 : 0)
}
function settle(done: boolean) {
  if (!leaf) return
  const L = leaf
  if (done) sp.value = L.n
  under.value = { l: sp.value * 2, r: sp.value * 2 + 1 }
  L.el.remove()
  leaf = null
}
function animateTo(target: number, ms: number, done?: () => void) {
  if (!leaf) return
  const L = leaf
  const from = L.th
  const my = ++anim
  const t0 = performance.now()
  const dur = Math.max(180, (ms * Math.abs(target - from)) / 180)
  const step = (now: number) => {
    if (my !== anim || leaf !== L) return
    const k = Math.min(1, (now - t0) / dur)
    setTh(from + (target - from) * ease(k))
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}
function flip(d: 1 | -1) {
  if (leaf && leaf.th > 0 && !leaf.hover) return
  if (leaf && leaf.dir !== d) {
    anim++
    settle(false)
  }
  const L = leaf && leaf.dir === d ? leaf : ensureLeaf(d)
  if (!L) return
  L.hover = false
  animateTo(180, 780, () => settle(true))
}

function geom() {
  const r = spreadEl.value!.getBoundingClientRect()
  return { r, cx: r.left + r.width / 2, half: r.width / 2 }
}
const thFor = (d: number, x: number, off: number) => {
  const { cx, half } = geom()
  const edge = (d > 0 ? cx + half : cx - half) + (x - off)
  const u = d > 0 ? (edge - cx) / half : (cx - edge) / half
  return (Math.acos(Math.max(-1, Math.min(1, u))) * 180) / Math.PI
}
let drag: { x: number; y: number; d: 0 | 1 | -1; off: number } | null = null
function onPress(x: number, y: number) {
  if (leaf && leaf.th >= 179) return
  drag = { x, y, d: 0, off: x }
  // лист уже «подвис» от наведения на уголок: берём его
  const side = x > geom().cx ? 1 : -1
  if (leaf && leaf.dir === side) {
    anim++
    leaf.hover = false
    drag.d = leaf.dir
    drag.off = x - leaf.dir * geom().half * (Math.cos((leaf.th * Math.PI) / 180) - 1)
  }
}
function onStart(x: number) {
  if (!drag || drag.d) return
  const d: 1 | -1 = x - drag.x < 0 ? 1 : -1
  if (leaf) {
    anim++
    settle(false)
  }
  if (!ensureLeaf(d)) {
    drag = null
    return
  }
  drag.d = d
  drag.off = drag.x
}
function onMove(x: number, y: number) {
  if (!drag?.d || !spreadEl.value) return
  setTh(thFor(drag.d, x, drag.off), ((y - drag.y) / spreadEl.value.clientHeight) * 14)
}
function onEnd(_x: number, _y: number, vx: number) {
  const D = drag
  drag = null
  if (!D?.d || !leaf) return
  const go = leaf.th > 90 || (vx * (D.d > 0 ? -1 : 1) > 0.45 && leaf.th > 25)
  if (go) animateTo(180, 620, () => settle(true))
  else animateTo(0, 520, () => settle(false))
}
/** Наведение мыши на уголок: лист чуть приподнимается, как подсказка «за него можно взять». */
function onHover(e: MouseEvent) {
  if (!spreadEl.value || drag) return
  const { r, cx } = geom()
  const inR = e.clientX > cx
  const near = (inR ? r.right - e.clientX : e.clientX - r.left) < 110 && r.bottom - e.clientY < 110
  const d: 1 | -1 = inR ? 1 : -1
  spreadEl.value.style.cursor = near && canGo(d) ? 'grab' : ''
  if (near && canGo(d)) {
    if (!leaf) {
      const L = ensureLeaf(d)
      if (L) {
        L.hover = true
        animateTo(17, 260)
      }
    }
  } else if (leaf?.hover) {
    const L = leaf
    L.hover = false
    animateTo(0, 260, () => {
      if (leaf === L) settle(false)
    })
  }
}
</script>

<template>
  <div ref="room" class="gshelf">
    <p class="gshelf-tip">
      Нажми на книгу, чтобы открыть, а чтобы переставить, перетащи её.
      <button type="button" class="gshelf-reset" @click="resetOrder">сбросить порядок</button>
    </p>
    <section v-for="s in shelves" :key="s.key" class="unit">
      <small>{{ s.label }}</small>
      <div class="row" :data-shelf="s.key">
        <div v-for="g in s.cards" :key="g.id" class="slot">
          <button
            type="button"
            class="spine"
            :class="{ ahead: g.ahead }"
            :data-id="g.id"
            :title="hint(g)"
            :style="{ background: secColor(g), height: spineSize(g).h + 'px', width: spineSize(g).w + 'px' }"
            @click="openBook(g)"
          >
            {{ spineLabel(g) }}
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="book" class="study sky study-modal gbook" @click.self="closeBook">
        <div ref="spreadEl" class="spread" :style="{ '--c': color }" role="dialog" aria-modal="true" @mousemove="onHover">
          <div class="pgslot" v-html="pgBox(under.l)"></div>
          <div class="pgslot" v-html="pgBox(under.r)"></div>
          <div ref="leafHost" class="leafhost"></div>
          <button type="button" class="x" aria-label="Закрыть" @click="closeBook">✕</button>
          <div class="nav">
            <button type="button" :disabled="sp === 0" @click="flip(-1)">← назад</button>
            <span>разворот {{ sp + 1 }} из {{ spreads }}</span>
            <button type="button" :disabled="sp >= spreads - 1" @click="flip(1)">вперёд →</button>
            <button type="button" class="full" @click="emit('open', book.id)">карточка целиком</button>
          </div>
          <div class="hintc">потяни за уголок или свайпни</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.gshelf { margin-top: 18px; }
.gshelf-tip { margin: 0 0 6px; font-size: 13px; color: var(--muted); }
.gshelf-reset { margin-left: 8px; border: 1px solid var(--line); background: #fff; color: var(--muted); border-radius: 99px; padding: 2px 12px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.unit { margin-top: 14px; min-width: 0; }
.unit > small { font: 700 11px/1 Archivo, sans-serif; letter-spacing: .2em; color: var(--muted); text-transform: uppercase; }
.row { min-height: 196px; display: flex; align-items: flex-end; flex-wrap: wrap; margin-top: 5px; padding: 14px 10px 0; background: rgba(255, 255, 255, .55); border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); }
.slot { position: relative; height: 164px; display: flex; align-items: flex-end; padding-right: 2px; border-bottom: 8px solid #cfc3f7; border-radius: 0 0 3px 3px; margin-bottom: 14px; }
.spine { writing-mode: vertical-rl; text-orientation: upright; position: relative; border: 0; cursor: pointer; color: #fff; font: 700 12px 'Noto Sans KR', sans-serif; letter-spacing: .02em; padding: 9px 0; border-radius: 7px 7px 0 0;
  box-shadow: inset -4px 0 6px rgba(32, 38, 92, .14), inset 3px 0 4px rgba(255, 255, 255, .35); transition: transform .25s; touch-action: none; -webkit-user-select: none; user-select: none; }
.spine::before, .spine::after { content: ''; position: absolute; left: 0; right: 0; height: 3px; background: rgba(255, 255, 255, .6); }
.spine::before { top: 7px; }
.spine::after { bottom: 7px; }
.spine:hover { transform: translateY(-8px); }
.spine.ahead { background: repeating-linear-gradient(135deg, #e4defa 0 6px, #f1edff 6px 12px) !important; color: #8f8ac0; box-shadow: inset -5px 0 6px rgba(0, 0, 0, .05); }
.spine.ahead::before, .spine.ahead::after { background: #cfc7f2; }
.spine.dragging { transition: none; z-index: 20; cursor: grabbing; box-shadow: 0 18px 30px rgba(60, 50, 140, .35), inset -4px 0 6px rgba(32, 38, 92, .14); }
</style>

<style>
/* книга: перенос в body, поэтому стили не scoped */
.gbook { perspective: 2600px; }
.gbook .spread { position: relative; width: min(1080px, 96vw); height: min(680px, 88vh); display: grid; grid-template-columns: 1fr 1fr; background: #fff; border-radius: 14px;
  box-shadow: 0 30px 80px rgba(60, 50, 140, .35), 0 0 0 8px var(--c); transform-style: preserve-3d; touch-action: none; user-select: none; -webkit-user-select: none; animation: gbook-open .45s cubic-bezier(.2, .9, .3, 1.2); }
@keyframes gbook-open { from { transform: scale(.4, .9) translateY(120px); opacity: 0; } }
.gbook .spread::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 60px; margin-left: -30px; pointer-events: none; z-index: 5;
  background: linear-gradient(90deg, transparent, rgba(60, 50, 140, .14) 48%, rgba(60, 50, 140, .14) 52%, transparent); }
.gbook .pgslot, .gbook .leafhost { display: contents; }
.gbook .pg { position: relative; padding: 34px 42px 44px; overflow: hidden; height: 100%; background: #fff; font-weight: 600; }
.gbook .pg.l { border-right: 1px solid #e3d9ff; }
.gbook .pg.blank { background: repeating-linear-gradient(#fff 0 28px, #f1edff 28px 29px); }
.gbook .pg .no { font: 700 12px Archivo, sans-serif; letter-spacing: .08em; color: var(--muted); }
.gbook .pg h2 { font-size: 42px; font-weight: 700; margin: 8px 0 2px; color: var(--c); }
.gbook .pg .ru { color: var(--muted); margin-bottom: 14px; }
.gbook .pg .turn { color: var(--muted); margin-top: 30px; }
.gbook .pg .soon { margin-top: 90px; text-align: center; color: var(--muted); }
.gbook .pg .pn { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font: 700 12px Archivo, sans-serif; color: var(--muted); }
.gbook .leaf { position: absolute; top: 0; bottom: 0; width: 50%; transform-style: preserve-3d; z-index: 6; pointer-events: none; will-change: transform; box-shadow: 0 0 30px rgba(60, 50, 140, .2); }
.gbook .leaf.r { left: 50%; transform-origin: left center; }
.gbook .leaf.l { left: 0; transform-origin: right center; }
.gbook .leaf > div { position: absolute; inset: 0; backface-visibility: hidden; background: #fff; overflow: hidden; }
.gbook .leaf > .bk { transform: rotateY(180deg); }
.gbook .leaf .sh { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(60, 50, 140, .35), rgba(60, 50, 140, 0)); opacity: 0; pointer-events: none; }
.gbook .leaf.l .sh { background: linear-gradient(270deg, rgba(60, 50, 140, .35), rgba(60, 50, 140, 0)); }
.gbook .leaf .pg { height: 100%; }
.gbook .x { position: absolute; top: -4px; right: -4px; width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--ink); color: #fff; cursor: pointer; z-index: 8; }
.gbook .nav { position: absolute; bottom: -52px; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 16px; color: #fff; font: 700 14px Archivo, sans-serif; }
.gbook .nav button { border: 0; border-radius: 99px; padding: 9px 20px; background: #fff; color: var(--ink); font: 700 14px Archivo, sans-serif; cursor: pointer; }
.gbook .nav button:disabled { opacity: .35; cursor: default; }
.gbook .nav .full { background: transparent; color: #fff; border: 1px solid rgba(255, 255, 255, .6); }
.gbook .hintc { position: absolute; right: 16px; bottom: -34px; color: #fff; font: 600 12px Archivo, sans-serif; opacity: .7; }
.gbook .rich .deep, .gbook .rich details { margin: 8px 0; }
@media (max-width: 760px) { .gbook .spread { height: min(560px, 80vh); } .gbook .pg { padding: 22px 16px 36px; font-size: 13px; } .gbook .pg h2 { font-size: 28px; } }
</style>
