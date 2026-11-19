<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { GROWTH } from '@/data/growth'
import { themeLight, toggleTheme } from '@/lib/theme'

/**
 * «Рост платформы»: лента событий идёт вниз, справа и слева от волнистой лозы. Лоза рисуется по мере прокрутки, от неё к каждому блоку
 * тянется веточка, а на её конце распускается цветок сакуры. Без JS и при «уменьшить движение» всё видно сразу.
 * Данные: `data/growth.ts` (собирает `scripts/build-commit-graph.mjs`). Цвета для светлой и тёмных тем лежат переменными в `.gr`.
 */
const PETAL = 'M0 0 C-7 -8 -6 -20 0 -26 C6 -20 7 -8 0 0Z'
const STEP = 8
const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const nf = new Intl.NumberFormat('ru-RU')
const at = (d: string) => fmt.format(new Date(d + 'T12:00:00'))

const blocks = GROWTH.marks.map((m, i) => ({ ...m, key: m.d + ':' + i, date: at(m.d), right: i % 2 === 0 }))
const totals = { commits: GROWTH.commits, days: GROWTH.days.length, lines: GROWTH.lines, marks: GROWTH.marks.length }

interface Geo {
  W: number
  H: number
  d: string
  twigs: string[]
  flowers: { x: number; y: number }[]
  /** Размер цветка: на телефоне меньше, чтобы не заходил на карточку. */
  fs: number
  leaves: { x: number; y: number; rot: number; at: number }[]
}
const geo = shallowRef<Geo>({ W: 1000, H: 0, d: '', twigs: [], flowers: [], fs: 1.15, leaves: [] })

const rootEl = ref<HTMLElement>()
const tlEl = ref<HTMLElement>()
const vineEl = ref<SVGPathElement>()
const progEl = ref<HTMLElement>()
const cntEl = ref<HTMLElement>()
const dateEl = ref<HTMLElement>()
const hudOn = ref(false)
const armed = ref(false)
const reduced = ref(false)

/** Длина лозы до каждой высоты (по таблице с шагом STEP): так не нужно спрашивать у браузера длину пути на каждый кадр. */
let lens: number[] = [0]
let total = 1
let blkEls: HTMLElement[] = []
let twigEls: SVGPathElement[] = []
let flEls: SVGGElement[] = []
let leafEls: SVGEllipseElement[] = []
let ys: number[] = []
let lastIdx = -2
let raf = 0
let ro: ResizeObserver | undefined

/** Лоза: x по высоте (на телефоне почти прямая у левого края). */
function vineX(y: number, mobile: boolean, cx: number) {
  return mobile ? 14 + Math.sin(y / 150) * 5 : cx + Math.sin(y / 150) * 46
}

function measure() {
  const tl = tlEl.value
  if (!tl) return
  const mobile = innerWidth < 760
  const W = tl.clientWidth
  const H = tl.clientHeight
  const cx = W / 2
  const els = [...tl.querySelectorAll<HTMLElement>('.blk')]
  ys = els.map(el => el.offsetTop + el.offsetHeight / 2)
  const n = Math.max(1, Math.floor((H - 40) / STEP))
  let d = `M${vineX(0, mobile, cx).toFixed(1)} 0`
  lens = [0]
  let px = vineX(0, mobile, cx)
  for (let k = 1; k <= n; k++) {
    const y = k * STEP
    const x = vineX(y, mobile, cx)
    d += ` L${x.toFixed(1)} ${y}`
    lens.push((lens[k - 1] ?? 0) + Math.hypot(x - px, STEP))
    px = x
  }
  total = lens[lens.length - 1] || 1
  const twigs: string[] = []
  const flowers: { x: number; y: number }[] = []
  els.forEach((el, i) => {
    const y = ys[i]!
    const right = mobile || el.classList.contains('r')
    const s = right ? 1 : -1
    const x0 = vineX(y, mobile, cx)
    const x1 = mobile ? el.offsetLeft - 28 : right ? el.offsetLeft - 40 : el.offsetLeft + el.offsetWidth + 40
    twigs.push(`M${x0.toFixed(1)} ${y} C${(x0 + s * 30).toFixed(1)} ${y - 28} ${(x1 - s * 40).toFixed(1)} ${y - 24} ${x1.toFixed(1)} ${y}`)
    flowers.push({ x: x1, y })
  })
  const leaves: Geo['leaves'] = []
  for (let y = 70; y < H - 80; y += 95) {
    const side = (Math.floor(y / 95) % 2 ? 1 : -1) as 1 | -1
    leaves.push({ x: vineX(y, mobile, cx) + side * 16, y, rot: side * -35, at: y })
  }
  geo.value = { W, H, d, twigs, flowers, fs: mobile ? 0.8 : 1.15, leaves }
}

function cache() {
  const tl = tlEl.value
  if (!tl) return
  blkEls = [...tl.querySelectorAll<HTMLElement>('.blk')]
  twigEls = [...tl.querySelectorAll<SVGPathElement>('.twig')]
  flEls = [...tl.querySelectorAll<SVGGElement>('.fl')]
  leafEls = [...tl.querySelectorAll<SVGEllipseElement>('.leaf')]
}

function lenAtY(y: number) {
  const k = Math.min(lens.length - 1, Math.max(0, y / STEP))
  const i = Math.floor(k)
  const a = lens[i] ?? 0
  const b = lens[Math.min(lens.length - 1, i + 1)] ?? a
  return a + (b - a) * (k - i)
}

function frame() {
  const tl = tlEl.value
  const vine = vineEl.value
  if (!tl || !vine) return
  const reach = reduced.value ? Infinity : innerHeight * 0.62 - tl.getBoundingClientRect().top
  vine.style.strokeDashoffset = String(1 - Math.min(1, lenAtY(reach) / total))
  let idx = -1
  ys.forEach((y, i) => {
    if (y <= reach) idx = i
    blkEls[i]?.classList.toggle('in', reach > y - 130)
    twigEls[i]?.classList.toggle('on', reach >= y)
    flEls[i]?.classList.toggle('on', reach >= y + 10)
  })
  leafEls.forEach(l => l.classList.toggle('on', reach >= Number(l.dataset.at)))
  if (progEl.value) progEl.value.style.transform = `scaleX(${Math.min(1, Math.max(0, reach / Math.max(1, tl.clientHeight)))})`
  if (idx !== lastIdx) {
    lastIdx = idx
    hudOn.value = idx >= 0
    const m = GROWTH.marks[idx]
    if (m && cntEl.value && dateEl.value) {
      cntEl.value.textContent = nf.format(m.cum)
      dateEl.value.textContent = at(m.d)
    }
  }
}

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    frame()
  })
}

async function refresh() {
  measure()
  await nextTick()
  cache()
  frame()
}

onMounted(async () => {
  reduced.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  armed.value = !reduced.value
  await refresh()
  const root = rootEl.value
  root?.addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', refresh)
  if (typeof ResizeObserver !== 'undefined' && tlEl.value) {
    ro = new ResizeObserver(() => void refresh())
    ro.observe(tlEl.value)
  }
  void document.fonts?.ready.then(refresh)
})
onBeforeUnmount(() => {
  rootEl.value?.removeEventListener('scroll', onScroll)
  removeEventListener('resize', refresh)
  ro?.disconnect()
  cancelAnimationFrame(raf)
})

const toStart = () => rootEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
const toEnd = () => rootEl.value?.scrollTo({ top: rootEl.value.scrollHeight, behavior: 'smooth' })
const themeLabel = computed(() => (themeLight.value ? '☾︎ Тёмная' : '☀︎ Светлая'))
</script>

<template>
  <main ref="rootEl" class="gr" :class="{ armed }">
    <header class="gr-top">
      <RouterLink to="/" class="gr-brand"><span class="mark">✳︎</span><span class="name ko">우리말</span><span class="sub">рост платформы</span></RouterLink>
      <nav class="nav">
        <RouterLink to="/history">История</RouterLink>
        <RouterLink to="/about">О платформе</RouterLink>
        <button type="button" class="jump" @click="toStart">↑ в начало</button>
        <button type="button" class="jump" @click="toEnd">к итогу ↓</button>
        <button type="button" class="jump solid theme-btn" aria-label="Сменить тему" @click="toggleTheme">{{ themeLabel }}</button>
      </nav>
      <div class="gr-prog" aria-hidden="true"><i ref="progEl"></i></div>
    </header>

    <section class="gr-hero">
      <div class="kicker">как росла платформа</div>
      <h1>Рост платформы</h1>
      <p>От первого коммита до сегодняшнего дня. Листай вниз: лоза пойдёт вниз, к каждому событию потянется веточка, и на ней распустится цветок.</p>
      <div class="gr-hint"><span>↓</span> листай</div>
    </section>

    <div ref="tlEl" class="tl">
      <svg class="ov" aria-hidden="true" :viewBox="`0 0 ${geo.W} ${geo.H}`" :width="geo.W" :height="geo.H">
        <path class="base" :d="geo.d" />
        <path ref="vineEl" class="vine" :d="geo.d" pathLength="1" />
        <path v-for="(t, i) in geo.twigs" :key="'t' + i" class="twig" :d="t" pathLength="1" />
        <g v-for="(l, i) in geo.leaves" :key="'l' + i" :transform="`translate(${l.x.toFixed(1)} ${l.y}) rotate(${l.rot})`"><ellipse class="leaf" rx="14" ry="6" :data-at="l.at" /></g>
        <g v-for="(f, i) in geo.flowers" :key="'f' + i" :transform="`translate(${f.x.toFixed(1)} ${f.y})`">
          <g class="fl">
            <path v-for="k in 5" :key="k" class="gr-petal" :d="PETAL" :transform="`rotate(${(k - 1) * 72}) scale(${geo.fs})`" />
            <circle class="core" r="4" />
          </g>
        </g>
      </svg>

      <article v-for="b in blocks" :key="b.key" class="blk" :class="b.right ? 'r' : 'l'">
        <div class="d">{{ b.date }} · {{ nf.format(b.cum) }}-й коммит</div>
        <h2>{{ b.title }}</h2>
        <p>{{ b.summary }}</p>
        <div class="n"><b>+{{ b.items }}</b> изменений</div>
      </article>
    </div>

    <section class="gr-fin">
      <ul>
        <li><b>{{ nf.format(totals.commits) }}</b> коммитов</li>
        <li><b>{{ totals.days }}</b> дней работы</li>
        <li><b>{{ nf.format(Math.round(totals.lines / 1000)) }} тыс.</b> строк кода</li>
        <li><b>{{ totals.marks }}</b> ключевых событий</li>
      </ul>
      <RouterLink to="/history" class="jump solid">Читать всю историю →</RouterLink>
    </section>

    <div class="hud" :class="{ on: hudOn }" aria-hidden="true"><b ref="cntEl">0</b> <span>коммитов</span><em ref="dateEl"></em></div>
  </main>
</template>

<style scoped>
.gr {
  --ink: #1e2350; --soft: #6c70a8; --accent: #d64da9; --line: rgba(120, 110, 200, .2);
  --card: rgba(255, 255, 255, .86); --card-line: #fff; --card-shadow: 0 18px 44px rgba(100, 87, 170, .16);
  --vine: #e0559f; --vine-base: rgba(214, 77, 169, .14); --petal: #ffb3da; --petal-line: #e0559f; --core: #fff6c8; --leaf: #ff8fcb;
  --hdr: rgba(251, 248, 255, .72); --btn-ink: #fff;
  position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; color: var(--ink); font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all;
  background: linear-gradient(160deg, #fff6fb 0%, #f1ecff 48%, #e6f5ff 100%) fixed;
}
html[data-theme='dark'] .gr {
  --ink: #fff; --soft: #ffb3d1; --accent: #ff9cc6; --line: rgba(255, 190, 220, .18);
  --card: rgba(32, 8, 20, .84); --card-line: rgba(255, 190, 220, .18); --card-shadow: 0 18px 44px rgba(0, 0, 0, .35);
  --vine: #ff9cc6; --vine-base: rgba(255, 190, 220, .12); --petal: #ffd1e3; --petal-line: #ff6fae; --core: #ff4f9a; --leaf: #ff6fae;
  --hdr: rgba(20, 6, 12, .72); --btn-ink: #2a0a18;
  background: radial-gradient(60% 40% at 0 0, rgba(255, 79, 154, .28), transparent 60%), radial-gradient(50% 40% at 100% 35%, rgba(194, 24, 107, .28), transparent 70%), linear-gradient(#2a0a18, #12040a) fixed;
}
.gr a { color: inherit; text-decoration: none; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }

.gr-top { position: fixed; z-index: 20; inset: 0 0 auto 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px clamp(16px, 4vw, 48px); background: var(--hdr); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
.gr-brand { display: flex; align-items: baseline; gap: 12px; }
.gr-brand .mark { font-size: 24px; color: var(--accent); line-height: 1; }
.gr-brand .name { font-size: 17px; letter-spacing: 3px; font-weight: 700; }
.gr-brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--soft); text-transform: uppercase; }
.nav { display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--soft); }
.nav a:hover { color: var(--ink); }
.jump { padding: 8px 16px; border: 1px solid var(--ink); border-radius: 22px; background: transparent; color: var(--ink); font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; white-space: nowrap; display: inline-block; }
.jump:hover { background: var(--ink); color: var(--btn-ink); }
.jump.solid { background: var(--ink); color: var(--btn-ink); }
.jump.solid:hover { background: var(--accent); border-color: var(--accent); }
.gr-prog { position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; overflow: hidden; }
.gr-prog i { display: block; width: 100%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--vine)); transform: scaleX(0); transform-origin: 0 50%; }

.gr-hero { padding: 150px 24px 40px; text-align: center; }
.kicker { display: inline-flex; align-items: center; gap: 10px; font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--soft); }
.kicker::before { content: ''; width: 26px; height: 1px; background: var(--accent); }
.gr-hero h1 { margin: 10px 0 8px; font-size: clamp(40px, 8vw, 96px); line-height: 1; letter-spacing: -.04em; font-weight: 800; }
.gr-hero p { max-width: 560px; margin: 0 auto; line-height: 1.7; font-size: 15px; color: var(--soft); }
.gr-hint { margin-top: 18px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--soft); }
.gr-hint span { display: inline-block; font-size: 18px; color: var(--accent); margin-right: 6px; animation: nudge 1.2s ease-in-out infinite alternate; }
@keyframes nudge { to { transform: translateY(8px); } }

.tl { position: relative; max-width: 1040px; margin: 30px auto 0; padding: 60px 20px 120px; }
.ov { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; z-index: 1; }
.base { fill: none; stroke: var(--vine-base); stroke-width: 2; }
.vine { fill: none; stroke: var(--vine); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--vine) 55%, transparent)); }
.twig { fill: none; stroke: var(--vine); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset .7s ease-out; }
.twig.on { stroke-dashoffset: 0; }
.leaf { fill: var(--leaf); opacity: 0; transform-box: fill-box; transform-origin: center; transform: scale(0); transition: transform .5s cubic-bezier(.3, 1.6, .5, 1), opacity .5s; }
.leaf.on { opacity: .85; transform: scale(1); }
.fl { transform-box: fill-box; transform-origin: center; transform: scale(0) rotate(-60deg); transition: transform .8s cubic-bezier(.25, 1.9, .4, 1); }
.fl.on { transform: scale(1) rotate(0); }
.gr-petal { fill: var(--petal); stroke: var(--petal-line); stroke-width: 1.5; }
.core { fill: var(--core); }

.blk { position: relative; z-index: 2; width: calc(50% - 100px); padding: 18px 22px; border-radius: 22px; background: var(--card); border: 1px solid var(--card-line); box-shadow: var(--card-shadow); margin-bottom: 96px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: opacity .6s, transform .7s cubic-bezier(.2, .8, .2, 1); }
.blk.r { margin-left: calc(50% + 100px); }
.armed .blk { opacity: 0; transform: translateX(-40px); }
.armed .blk.r { transform: translateX(40px); }
.armed .blk.in { opacity: 1; transform: none; }
.blk .d { font: 500 12px/1 'JetBrains Mono', ui-monospace, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
.blk h2 { margin: 8px 0 6px; font-size: 21px; line-height: 1.25; font-weight: 700; letter-spacing: -.01em; }
.blk p { margin: 0 0 10px; color: var(--soft); font-size: 14.5px; line-height: 1.6; }
.blk .n { font: 400 12px/1.4 'JetBrains Mono', ui-monospace, Menlo, monospace; color: var(--soft); }
.blk .n b { color: var(--ink); }

.gr-fin { max-width: 640px; margin: 0 auto; padding: 24px 28px; text-align: left; background: var(--card); border: 1px solid var(--card-line); border-radius: 32px; box-shadow: var(--card-shadow); margin-bottom: 140px; }
.gr-fin ul { list-style: none; display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 0 0 20px; padding: 0; color: var(--soft); font-size: 13px; }
.gr-fin b { display: block; font-size: clamp(30px, 5vw, 48px); letter-spacing: -.03em; color: var(--ink); font-weight: 800; font-variant-numeric: tabular-nums; }

.hud { position: fixed; z-index: 15; right: clamp(14px, 3vw, 40px); bottom: 22px; display: flex; align-items: baseline; gap: 8px; padding: 10px 18px; border-radius: 999px; background: var(--card); border: 1px solid var(--card-line); box-shadow: var(--card-shadow); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); opacity: 0; transform: translateY(10px); transition: opacity .4s, transform .4s; pointer-events: none; font-size: 13px; color: var(--soft); }
.hud.on { opacity: 1; transform: none; }
.hud b { font-size: 22px; letter-spacing: -.02em; color: var(--accent); font-variant-numeric: tabular-nums; }
.hud em { font-style: normal; margin-left: 8px; color: var(--ink); }

@media (max-width: 760px) {
  .gr-top .gr-brand .sub, .nav a { display: none; }
  .nav { gap: 8px; }
  .jump { padding: 7px 11px; }
  .gr-hero { padding-top: 120px; }
  .blk, .blk.r { width: calc(100% - 56px); margin-left: 56px; margin-right: 0; }
  .armed .blk, .armed .blk.r { transform: translateX(30px); }
  .armed .blk.in { transform: none; }
  .hud em { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .gr-hint span { animation: none; }
  .blk, .twig, .leaf, .fl, .hud { transition: none; }
}
</style>
