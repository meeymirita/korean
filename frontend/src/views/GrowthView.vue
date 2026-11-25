<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { GROWTH } from '@/data/growth'
import { D } from '@/data/korean/words'
import { RULES_COUNT } from '@/data/korean/grammar'
import { ALL_GAMES } from '@/data/games'
import { fetchT } from '@/lib/http'
import RankPic from '@/components/RankPic.vue'
import Icon from '@/components/Icon.vue'

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
/** Полный итог платформы: что накоплено в коде (из git) и что внутри для учёбы (из данных платформы). */
const totals = { commits: GROWTH.commits, days: GROWTH.days.length, lines: GROWTH.lines, marks: GROWTH.marks.length, words: D.length, rules: RULES_COUNT, games: ALL_GAMES.length }

/** Публичная визитка владельца (`/api/public/me`): имя, уровень и звание для блока «обо мне»; если визитка закрыта, блок показывает только ссылки. */
interface PublicCard {
  name: string
  level: number
  title: string
}
const me = ref<PublicCard | null>(null)

interface Geo {
  W: number
  H: number
  d: string
  twigs: string[]
  flowers: { x: number; y: number }[]
  /** Размер цветка: на телефоне меньше, чтобы не заходил на карточку. */
  fs: number
  /** Две ветви лозы вокруг двух конечных блоков: расходятся в стороны, обходят блоки снаружи и сходятся под ними; цветки по ним. */
  br: { l: string; r: string } | null
  bfl: { x: number; y: number; s: number }[]
  leaves: { x: number; y: number; rot: number; at: number }[]
}
const geo = shallowRef<Geo>({ W: 1000, H: 0, d: '', twigs: [], flowers: [], fs: 1.15, br: null, bfl: [], leaves: [] })

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
let brEls: SVGPathElement[] = []
let bflEls: SVGGElement[] = []
let meEl: HTMLElement | null = null
/** Высоты, между которыми рисуются ветви: от развилки до точки, где они сходятся. */
let brRange: [number, number] = [0, 1]
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
  // два блока в конце ленты («обо мне» слева, итог платформы справа): лоза доходит до развилки над ними, дальше две ветви обходят каждый блок снаружи и сходятся под ними
  const mine = tl.querySelector<HTMLElement>('.gr-end')
  let br: Geo['br'] = null
  const bfl: Geo['bfl'] = []
  let endY = H - 40
  if (mine) {
    const top = mine.offsetTop
    const bot = top + mine.offsetHeight
    const sy = top - 100
    const xl = mobile ? 14 : mine.offsetLeft - 34
    const xr = mobile ? W - 10 : mine.offsetLeft + mine.offsetWidth + 34
    const yb = bot - 10
    const yj = bot + 90
    const sx = vineX(sy, mobile, cx)
    const e = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`
    br = {
      l: `M${e(sx, sy)} C${e(sx - (mobile ? 0 : 10), sy + 50)} ${e(xl, sy + 20)} ${e(xl, sy + 110)} L${e(xl, yb)} C${e(xl, yj - 10)} ${e(cx - 90, yj)} ${e(cx, yj)}`,
      r: `M${e(sx, sy)} C${e(sx + 10, sy + 50)} ${e(xr, sy + 20)} ${e(xr, sy + 110)} L${e(xr, yb)} C${e(xr, yj - 10)} ${e(cx + 90, yj)} ${e(cx, yj)}`,
    }
    for (const x of [xl, xr]) for (const y of [top + 30, (top + bot) / 2, bot - 24]) bfl.push({ x, y, s: 0.9 })
    bfl.push({ x: cx, y: yj, s: 1.5 })
    brRange = [sy, yj]
    endY = sy
  }
  const n = Math.max(1, Math.floor(endY / STEP))
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
  geo.value = { W, H, d, twigs, flowers, fs: mobile ? 0.8 : 1.15, br, bfl, leaves }
}

function cache() {
  const tl = tlEl.value
  if (!tl) return
  blkEls = [...tl.querySelectorAll<HTMLElement>('.blk')]
  twigEls = [...tl.querySelectorAll<SVGPathElement>('.twig')]
  flEls = [...tl.querySelectorAll<SVGGElement>('.fl')]
  leafEls = [...tl.querySelectorAll<SVGEllipseElement>('.leaf')]
  brEls = [...tl.querySelectorAll<SVGPathElement>('.br')]
  bflEls = [...tl.querySelectorAll<SVGGElement>('.bfl')]
  meEl = tl.querySelector<HTMLElement>('.gr-end')
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
  const bp = Math.min(1, Math.max(0, (reach - brRange[0]) / Math.max(1, brRange[1] - brRange[0])))
  brEls.forEach(b => (b.style.strokeDashoffset = String(1 - bp)))
  bflEls.forEach(f => f.classList.toggle('on', reach >= Number(f.dataset.at)))
  if (meEl) meEl.classList.toggle('in', reach > meEl.offsetTop - 60)
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

/** Визитка владельца: если она открыта, в блоке «обо мне» появятся имя, уровень и звание. */
async function loadMe() {
  try {
    const res = await fetchT('/api/public/me')
    if (res.ok) me.value = (await res.json()) as PublicCard
  } catch {
    /* визитка закрыта или сервер не ответил: блок остаётся со ссылками */
  }
}

async function refresh() {
  measure()
  await nextTick()
  cache()
  frame()
}

onMounted(async () => {
  void loadMe()
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
        <template v-if="geo.br">
          <path class="vine br" :d="geo.br.l" pathLength="1" />
          <path class="vine br" :d="geo.br.r" pathLength="1" />
        </template>
        <g v-for="(f, i) in geo.bfl" :key="'b' + i" :transform="`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`">
          <g class="bfl" :data-at="f.y">
            <path v-for="k in 5" :key="k" class="gr-petal" :d="PETAL" :transform="`rotate(${(k - 1) * 72}) scale(${(geo.fs * f.s).toFixed(2)})`" />
            <circle class="core" r="4" />
          </g>
        </g>
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

      <div class="gr-end">
        <aside class="gr-me" aria-label="Обо мне">
          <div class="gr-me-pic"><RankPic v-if="me" :level="me.level" /><Icon v-else name="sakura" /></div>
          <h2>{{ me?.name || 'Изучаю корейский' }}</h2>
          <p v-if="me">уровень {{ me.level }} · {{ me.title }}</p>
          <p v-else>личное пространство для корейского</p>
          <div class="gr-me-title">Для связи</div>
          <div class="gr-me-links">
            <a class="jump solid" href="https://t.me/meeymirita" target="_blank" rel="noopener">Telegram · @meeymirita</a>
            <RouterLink v-if="me" to="/me" class="jump">Моя визитка</RouterLink>
          </div>
        </aside>

        <section class="gr-fin" aria-label="Итог платформы">
          <h2>Итог платформы</h2>
          <ul>
            <li><b>{{ nf.format(totals.words) }}</b> слов в словаре</li>
            <li><b>{{ totals.rules }}</b> правил грамматики</li>
            <li><b>{{ totals.games }}</b> игр и тренажёров</li>
            <li><b>{{ nf.format(totals.commits) }}</b> коммитов</li>
            <li><b>{{ totals.days }}</b> дней работы</li>
            <li><b>{{ nf.format(Math.round(totals.lines / 1000)) }} тыс.</b> строк кода</li>
            <li><b>{{ totals.marks }}</b> ключевых событий</li>
          </ul>
          <RouterLink to="/history" class="jump solid">Читать всю историю →</RouterLink>
        </section>
      </div>
    </div>

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
/* полосы прокрутки справа нет: о прогрессе говорит полоса под шапкой (решение владельца 2026-11-19) */
.gr { scrollbar-width: none; }
.gr::-webkit-scrollbar { display: none; }
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

.tl { position: relative; max-width: 1040px; margin: 30px auto 0; padding: 60px 20px max(170px, 52vh); }
.ov { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; z-index: 1; }
.base { fill: none; stroke: var(--vine-base); stroke-width: 2; }
.vine { fill: none; stroke: var(--vine); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--vine) 55%, transparent)); }
.twig { fill: none; stroke: var(--vine); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset .7s ease-out; }
.twig.on { stroke-dashoffset: 0; }
.vine.br { stroke-width: 3.5; }
.leaf { fill: var(--leaf); opacity: 0; transform-box: fill-box; transform-origin: center; transform: scale(0); transition: transform .5s cubic-bezier(.3, 1.6, .5, 1), opacity .5s; }
.leaf.on { opacity: .85; transform: scale(1); }
.fl, .bfl { transform-box: fill-box; transform-origin: center; transform: scale(0) rotate(-60deg); transition: transform .8s cubic-bezier(.25, 1.9, .4, 1); }
.fl.on, .bfl.on { transform: scale(1) rotate(0); }
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

.gr-end { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 32px; align-items: stretch; width: min(calc(100% - 100px), 900px); margin: 170px auto 0; }
.gr-me, .gr-fin { padding: 24px 28px 26px; border-radius: 28px; background: var(--card); border: 1px solid var(--card-line); box-shadow: var(--card-shadow); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: opacity .7s, transform .8s cubic-bezier(.2, .8, .2, 1); }
.armed .gr-end > * { opacity: 0; transform: translateY(34px) scale(.97); }
.armed .gr-end.in > * { opacity: 1; transform: none; }
.armed .gr-end.in > :nth-child(2) { transition-delay: .15s; }
.gr-me { display: flex; flex-direction: column; align-items: center; text-align: center; }
.gr-me-pic { display: grid; place-items: center; height: 104px; margin-bottom: 8px; font-size: 76px; }
.gr-me-pic :deep(.rank-pic) { width: 104px; height: 104px; }
.gr-me h2 { margin: 0; font-size: 26px; letter-spacing: -.02em; font-weight: 800; }
.gr-me p { margin: 4px 0 14px; font: 500 13px/1.5 'JetBrains Mono', ui-monospace, Menlo, monospace; color: var(--soft); }
.gr-me-title { margin: auto 0 8px; font: 500 11px/1 'JetBrains Mono', ui-monospace, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
.gr-me-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.gr-fin { display: flex; flex-direction: column; text-align: left; }
.gr-fin h2 { margin: 0 0 16px; font-size: 20px; letter-spacing: -.01em; font-weight: 800; }
.gr-fin ul { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 16px 18px; margin: 0 0 20px; padding: 0; color: var(--soft); font-size: 12.5px; line-height: 1.35; }
.gr-fin b { display: block; font-size: clamp(22px, 2.8vw, 34px); letter-spacing: -.03em; color: var(--ink); font-weight: 800; font-variant-numeric: tabular-nums; }
.gr-fin .jump { align-self: flex-start; margin-top: auto; }

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
  .gr-end { grid-template-columns: 1fr; width: calc(100% - 76px); margin: 150px 0 0 56px; }
  .armed .blk, .armed .blk.r { transform: translateX(30px); }
  .armed .blk.in { transform: none; }
  .hud em { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .gr-hint span { animation: none; }
  .blk, .twig, .leaf, .fl, .bfl, .gr-me, .gr-fin, .hud { transition: none; }
}
</style>
