<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { GROWTH } from '@/data/growth'

/**
 * «Рост платформы»: график накопленных коммитов, который рисуется по мере прокрутки вниз. Линия идёт от нуля вверх,
 * на её конце летит комета со шлейфом, на ключевых событиях распускаются цветки, а карточка события сменяется с анимацией текста.
 * Всё, что даёт GSAP: ScrollTrigger (прокрутка управляет временем), DrawSVG (линия рисуется), MotionPath (комета едет по линии),
 * SplitText и ScrambleText (текст), quickTo (шлейф и наклон от мыши), эластичные и «пружинные» кривые. Библиотека грузится только здесь и только в браузере.
 * Данные: `data/growth.ts` (собирает `scripts/build-commit-graph.mjs`). Картинка в `viewBox`, поэтому разметка и линия видны и без JS.
 */
const MAX = 1000
const DAY = 86_400_000
const PETAL = 'M0 0 C-7 -8 -6 -20 0 -26 C6 -20 7 -8 0 0Z'

const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fmtShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const at = (ms: number, short = false) => (short ? fmtShort : fmt).format(new Date(ms))
const ms = (d: string) => new Date(d + 'T12:00:00').getTime()
const nf = new Intl.NumberFormat('ru-RU')

/** Плавная монотонная кривая (Фритш — Карлсон) в виде кубических Безье: линия никогда не «проваливается» между днями. */
function curve(pts: { x: number; y: number }[]) {
  const n = pts.length
  const dx: number[] = []
  const m: number[] = []
  for (let k = 0; k < n - 1; k++) {
    dx[k] = pts[k + 1]!.x - pts[k]!.x
    m[k] = (pts[k + 1]!.y - pts[k]!.y) / dx[k]!
  }
  const tg: number[] = Array.from({ length: n }, () => 0)
  tg[0] = m[0]!
  tg[n - 1] = m[n - 2]!
  for (let k = 1; k < n - 1; k++) tg[k] = m[k - 1]! * m[k]! <= 0 ? 0 : (m[k - 1]! + m[k]!) / 2
  for (let k = 0; k < n - 1; k++) {
    if (m[k] === 0) {
      tg[k] = 0
      tg[k + 1] = 0
      continue
    }
    const a = tg[k]! / m[k]!
    const b = tg[k + 1]! / m[k]!
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      tg[k] = tau * a * m[k]!
      tg[k + 1] = tau * b * m[k]!
    }
  }
  let d = `M${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`
  const samples: { x: number; y: number; len: number }[] = [{ x: pts[0]!.x, y: pts[0]!.y, len: 0 }]
  let len = 0
  for (let k = 0; k < n - 1; k++) {
    const h = dx[k]!
    const p0 = pts[k]!
    const p3 = pts[k + 1]!
    const c1 = { x: p0.x + h / 3, y: p0.y + (tg[k]! * h) / 3 }
    const c2 = { x: p3.x - h / 3, y: p3.y - (tg[k + 1]! * h) / 3 }
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`
    for (let i = 1; i <= 28; i++) {
      const t = i / 28
      const u = 1 - t
      const x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x
      const y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y
      const prev = samples[samples.length - 1]!
      len += Math.hypot(x - prev.x, y - prev.y)
      samples.push({ x, y, len })
    }
  }
  return { d, samples, total: len }
}

/** Вся геометрия графика для горизонтального (компьютер) или вертикального (телефон) холста. */
function buildGeo(mobile: boolean) {
  const VW = mobile ? 700 : 1200
  const VH = mobile ? 900 : 720
  const PLOT = mobile ? { l: 78, r: 668, top: 60, bottom: 700, bars: 806 } : { l: 96, r: 1148, top: 84, bottom: 596, bars: 668 }
  const t0 = ms(GROWTH.days[0]!.d) - 0.55 * DAY
  const t1 = ms(GROWTH.days[GROWTH.days.length - 1]!.d)
  const xOf = (t: number) => PLOT.l + 14 + ((t - t0) / (t1 - t0)) * (PLOT.r - PLOT.l - 34)
  const yOf = (cum: number) => PLOT.bottom - (cum / MAX) * (PLOT.bottom - PLOT.top)
  const points = [{ x: xOf(t0), y: yOf(0) }, ...GROWTH.days.map(d => ({ x: xOf(ms(d.d)), y: yOf(d.cum) }))]
  const C = curve(points)
  const last = points[points.length - 1]!
  const first = points[0]!
  const areaD = `${C.d} L${last.x.toFixed(1)} ${PLOT.bottom} L${first.x.toFixed(1)} ${PLOT.bottom} Z`
  /** Точка на линии для накопленного числа коммитов: первая точка, где линия дошла до нужной высоты. */
  const pointAt = (cum: number) => C.samples.find(s => s.y <= yOf(cum)) ?? C.samples[C.samples.length - 1]!
  const marks = GROWTH.marks.map((m, i) => {
    const same = GROWTH.marks.filter(x => x.d === m.d)
    const j = same.indexOf(m)
    const day = GROWTH.days.find(d => d.d === m.d)!
    const cum = Math.round(day.cum - day.n + (day.n * (j + 0.5)) / same.length)
    const q = pointAt(cum)
    return { ...m, cum, i, x: q.x, y: q.y, f: q.len / C.total }
  })
  const maxN = Math.max(...GROWTH.days.map(v => v.n))
  const barH = mobile ? 64 : 52
  const dayBars = GROWTH.days.map(d => ({ ...d, x: xOf(ms(d.d)), h: 8 + barH * Math.sqrt(d.n / maxN), f: pointAt(d.cum).len / C.total }))
  const gridY = Array.from({ length: MAX / 200 + 1 }, (_, i) => ({ v: i * 200, y: yOf(i * 200), f: pointAt(i * 200).len / C.total }))
  const ticks: { x: number; label: string }[] = []
  for (let t = ms(GROWTH.days[0]!.d); t <= t1 + 0.4 * DAY; t += 7 * DAY) ticks.push({ x: xOf(t), label: at(t, true) })
  ticks.push({ x: xOf(t1), label: at(t1, true) })
  return { VW, VH, PLOT, t0, t1, C, first, last, areaD, pointAt, marks, dayBars, gridY, ticks, flower: mobile ? 0.7 : 1 }
}
/** Геометрия: сначала компьютерная (так отрисует сервер), на телефоне после загрузки заменяется на вертикальную. */
const geo = shallowRef(buildGeo(false))

// ---- элементы и состояние ----
const rootEl = ref<HTMLElement>()
const trackEl = ref<HTMLElement>()
const svgEl = ref<SVGSVGElement>()
const lineEl = ref<SVGPathElement>()
const glowEl = ref<SVGPathElement>()
const headEl = ref<SVGGElement>()
const clipRect = ref<SVGRectElement>()
const cntEl = ref<HTMLElement>()
const dateEl = ref<HTMLElement>()
const cardEl = ref<HTMLElement>()
const cTime = ref<HTMLElement>()
const cTitle = ref<HTMLElement>()
const cText = ref<HTMLElement>()
const introEl = ref<HTMLElement>()
const hintEl = ref<HTMLElement>()
const finEl = ref<HTMLElement>()
const progEl = ref<HTMLElement>()
const stats = ref({ commits: 0, days: 0, lines: 0, marks: 0 })
const TRACK_VH = 1000
const reduced = ref(false)

let cleanup: (() => void) | undefined
onMounted(async () => {
  reduced.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = rootEl.value
  if (!root) return
  if (innerWidth < 800) {
    geo.value = buildGeo(true)
    await nextTick() // разметка перерисована под вертикальную картинку
  }
  const { VW, PLOT, t0, t1, C, first, last, pointAt, marks, dayBars, gridY } = geo.value
  const [{ gsap }, { ScrollTrigger }, { DrawSVGPlugin }, { MotionPathPlugin }, { SplitText }, { ScrambleTextPlugin }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
    import('gsap/DrawSVGPlugin'),
    import('gsap/MotionPathPlugin'),
    import('gsap/SplitText'),
    import('gsap/ScrambleTextPlugin'),
  ])
  gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin, MotionPathPlugin, SplitText, ScrambleTextPlugin)

  const ctx = gsap.context(() => {
    const svg = svgEl.value!
    const line = lineEl.value!
    const head = headEl.value!
    const card = cardEl.value!
    const q = gsap.utils.selector(root)

    // ---- без анимации: сразу итоговая картина ----
    if (reduced.value) {
      gsap.set(head, { opacity: 0 })
      gsap.set(introEl.value!, { opacity: 0 })
      if (cntEl.value) cntEl.value.textContent = nf.format(GROWTH.commits)
      if (dateEl.value) dateEl.value.textContent = at(geo.value.t1)
      return
    }

    // ---- вступление: заголовок по буквам, подсказка прыгает ----
    const split = SplitText.create(introEl.value!.querySelector('h1')!, { type: 'chars' })
    gsap.from(split.chars, { yPercent: 130, rotate: 8, opacity: 0, duration: 0.9, ease: 'back.out(1.7)', stagger: 0.04, delay: 0.15 })
    gsap.from(introEl.value!.querySelectorAll('.fade'), { y: 18, opacity: 0, duration: 0.8, stagger: 0.12, delay: 0.7, ease: 'power3.out' })
    gsap.to(hintEl.value!, { y: 10, repeat: -1, yoyo: true, duration: 0.9, ease: 'sine.inOut' })

    // ---- исходное состояние ----
    gsap.set(line, { drawSVG: '0%' })
    gsap.set(glowEl.value!, { drawSVG: '0%' })
    gsap.set(clipRect.value!, { attr: { width: 0 } })
    gsap.set(q('.bloom .flower'), { scale: 0, rotation: -140 })
    gsap.set(q('.bloom .halo'), { scale: 0.4, opacity: 0 })
    gsap.set(q('.bar'), { scaleY: 0, transformOrigin: '50% 100%' })
    gsap.set(q('.gl'), { opacity: 0.3 })
    gsap.set(head, { x: first.x, y: first.y, opacity: 0 })
    gsap.set(card, { autoAlpha: 0 })
    gsap.set(finEl.value!, { autoAlpha: 0, y: 40 })
    gsap.set(svg, { transformPerspective: 1100, transformOrigin: '50% 50%' })
    if (cntEl.value) cntEl.value.textContent = '0'

    // ---- лепестки: падают всегда, каждый на своей скорости ----
    const petals = q('.petal') as HTMLElement[]
    petals.forEach(p => {
      const dur = gsap.utils.random(9, 20)
      gsap.set(p, { x: gsap.utils.random(0, innerWidth), y: gsap.utils.random(-120, -20), scale: gsap.utils.random(0.5, 1.3), rotation: gsap.utils.random(0, 360), opacity: gsap.utils.random(0.25, 0.7) })
      gsap.to(p, { y: innerHeight + 140, duration: dur, ease: 'none', repeat: -1, delay: -gsap.utils.random(0, dur) })
      gsap.to(p, { x: `+=${gsap.utils.random(-120, 120)}`, rotation: `+=${gsap.utils.random(-220, 220)}`, duration: gsap.utils.random(3, 6), ease: 'sine.inOut', repeat: -1, yoyo: true })
    })

    // ---- шлейф кометы: каждая точка догоняет голову с задержкой (quickTo) ----
    const trail = q('.trail circle') as unknown as SVGCircleElement[]
    const qx = trail.map((c, i) => gsap.quickTo(c, 'x', { duration: 0.12 + i * 0.07, ease: 'power3.out' }))
    const qy = trail.map((c, i) => gsap.quickTo(c, 'y', { duration: 0.12 + i * 0.07, ease: 'power3.out' }))
    const follow = () => {
      const hx = Number(gsap.getProperty(head, 'x'))
      const hy = Number(gsap.getProperty(head, 'y'))
      qx.forEach(f => f(hx))
      qy.forEach(f => f(hy))
    }
    gsap.ticker.add(follow)

    // ---- наклон картины и сдвиг фона от мыши ----
    const tiltX = gsap.quickTo(svg, 'rotationX', { duration: 0.9, ease: 'power3.out' })
    const tiltY = gsap.quickTo(svg, 'rotationY', { duration: 0.9, ease: 'power3.out' })
    const orbs = q('.orb') as HTMLElement[]
    const orbX = orbs.map((o, i) => gsap.quickTo(o, 'x', { duration: 1.4 + i * 0.4, ease: 'power3.out' }))
    const orbY = orbs.map((o, i) => gsap.quickTo(o, 'y', { duration: 1.4 + i * 0.4, ease: 'power3.out' }))
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / innerWidth - 0.5
      const ny = e.clientY / innerHeight - 0.5
      tiltY(nx * 7)
      tiltX(-ny * 5)
      orbX.forEach((f, i) => f(nx * (40 + i * 35)))
      orbY.forEach((f, i) => f(ny * (30 + i * 25)))
    }
    root.addEventListener('pointermove', onMove)

    // ---- карточка события ----
    let cardTl: gsap.core.Timeline | undefined
    let titleSplit: InstanceType<typeof SplitText> | undefined
    let shown = -2
    const showCard = (i: number) => {
      if (i === shown) return
      shown = i
      cardTl?.kill()
      titleSplit?.revert()
      if (i < 0) {
        cardTl = gsap.timeline().to(card, { autoAlpha: 0, y: -12, duration: 0.25 })
        return
      }
      const m = marks[i]!
      cardTl = gsap.timeline()
      cardTl.to(card, { autoAlpha: 0, y: -16, scale: 0.97, duration: 0.18, ease: 'power2.in' })
      cardTl.add(() => {
        const label = `${at(ms(m.d))} · ${nf.format(m.cum)}-й коммит`
        cTime.value!.textContent = label
        cTitle.value!.textContent = m.title
        cText.value!.textContent = m.summary
        titleSplit = SplitText.create(cTitle.value!, { type: 'words' })
        gsap.from(titleSplit.words, { yPercent: 110, opacity: 0, duration: 0.55, stagger: 0.05, ease: 'back.out(1.6)', delay: 0.12 })
        gsap.to(cTime.value!, { duration: 0.7, scrambleText: { text: label, chars: '0123456789', revealDelay: 0.1, speed: 0.7 } })
        gsap.from(cText.value!, { opacity: 0, y: 10, duration: 0.6, delay: 0.3 })
      })
      cardTl.fromTo(card, { autoAlpha: 0, y: 28, scale: 0.95 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.5)' })
    }

    // ---- главное время: прокрутка управляет всем ----
    const dateText = { v: '' }
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: trackEl.value!, scroller: root, start: 'top top', end: 'bottom bottom', scrub: 1.1 },
    })
    // линия, свечение, площадь под линией и комета едут вместе
    tl.fromTo(line, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1 }, 0)
    tl.fromTo(glowEl.value!, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1 }, 0)
    tl.to(clipRect.value!, { attr: { width: VW }, duration: 1 }, 0)
    tl.to(head, { motionPath: { path: line, align: line, alignOrigin: [0.5, 0.5] }, duration: 1 }, 0)
    tl.fromTo(head, { opacity: 0 }, { opacity: 1, duration: 0.02 }, 0)
    tl.to(introEl.value!, { opacity: 0, y: -60, duration: 0.05, ease: 'power2.in' }, 0)
    tl.to(progEl.value!, { scaleX: 1, duration: 1 }, 0)
    tl.to(q('.bg'), { filter: 'hue-rotate(38deg) saturate(1.15)', duration: 1 }, 0)
    tl.to(q('.orb.o1'), { yPercent: -35, scale: 1.4, duration: 1 }, 0)
    tl.to(q('.orb.o2'), { yPercent: 28, scale: 0.8, duration: 1 }, 0)
    // сетка вспыхивает, когда линия её пересекает
    gridY.forEach((g, i) => tl.to(q('.gl')[i]!, { opacity: 1, duration: 0.02, ease: 'power2.out' }, g.f))
    // столбики дней вырастают с пружиной
    dayBars.forEach((b, i) => tl.to(q('.bar')[i]!, { scaleY: 1, duration: 0.05, ease: 'elastic.out(1, 0.55)' }, Math.max(0, b.f - 0.03)))
    // цветки событий: раскрываются, поворачиваются и пускают круг
    marks.forEach((m, i) => {
      tl.to(q('.bloom .flower')[i]!, { scale: 1, rotation: 0, duration: 0.05, ease: 'back.out(2.4)' }, m.f)
      tl.fromTo(q('.bloom .halo')[i]!, { scale: 0.4, opacity: 0.7 }, { scale: 3.4, opacity: 0, duration: 0.08, ease: 'power2.out', immediateRender: false }, m.f)
    })
    // итог: числа набегают вместе с прокруткой
    const total = { commits: 0, days: 0, lines: 0, marks: 0 }
    tl.to(finEl.value!, { autoAlpha: 1, y: 0, duration: 0.05, ease: 'power3.out' }, 0.94)
    tl.to(
      total,
      { commits: GROWTH.commits, days: GROWTH.days.length, lines: GROWTH.lines, marks: GROWTH.marks.length, duration: 0.06, onUpdate: () => (stats.value = { commits: Math.round(total.commits), days: Math.round(total.days), lines: Math.round(total.lines), marks: Math.round(total.marks) }) },
      0.94,
    )

    // счётчик, дата и карточка следят за кометой
    tl.eventCallback('onUpdate', () => {
      const hx = Number(gsap.getProperty(head, 'x'))
      const hy = Number(gsap.getProperty(head, 'y'))
      const cum = Math.max(0, Math.min(GROWTH.commits, Math.round(((PLOT.bottom - hy) / (PLOT.bottom - PLOT.top)) * MAX)))
      if (cntEl.value) cntEl.value.textContent = nf.format(cum)
      const span = last.x - first.x
      const t = t0 + ((hx - first.x) / span) * (t1 - t0)
      const text = at(Math.min(t1, Math.max(ms(GROWTH.days[0]!.d), t)))
      if (text !== dateText.v) {
        dateText.v = text
        gsap.to(dateEl.value!, { duration: 0.35, scrambleText: { text, chars: '0123456789', speed: 1.2 } })
      }
      const p = tl.progress()
      let idx = -1
      for (let i = 0; i < marks.length; i++) if (marks[i]!.f <= p + 0.002) idx = i
      showCard(p > 0.94 ? -1 : idx)
    })

    cleanup = () => {
      root.removeEventListener('pointermove', onMove)
      gsap.ticker.remove(follow)
      split.revert()
      titleSplit?.revert()
    }
  }, root)

  const prev = cleanup
  cleanup = () => {
    prev?.()
    ctx.revert()
  }
})
onBeforeUnmount(() => cleanup?.())

const toStart = () => rootEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
const toEnd = () => rootEl.value?.scrollTo({ top: rootEl.value.scrollHeight, behavior: 'smooth' })
const totalStats = computed(() => (reduced.value ? { commits: GROWTH.commits, days: GROWTH.days.length, lines: GROWTH.lines, marks: GROWTH.marks.length } : stats.value))
</script>

<template>
  <main ref="rootEl" class="grow">
    <header class="top">
      <RouterLink to="/" class="brand"><span class="mark">✳︎</span><span class="name ko">우리말</span><span class="sub">рост платформы</span></RouterLink>
      <nav class="nav">
        <RouterLink to="/history">История</RouterLink>
        <RouterLink to="/about">О платформе</RouterLink>
        <button type="button" class="jump" @click="toStart">↑ в начало</button>
        <button type="button" class="jump solid" @click="toEnd">к итогу ↓</button>
      </nav>
    </header>

    <div ref="trackEl" class="track" :style="{ height: TRACK_VH + 'vh' }">
      <section class="scene">
        <div class="bg">
          <i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>
          <div class="petals" aria-hidden="true"><i v-for="n in 26" :key="n" class="petal"></i></div>
        </div>

        <svg ref="svgEl" class="chart" :viewBox="`0 0 ${geo.VW} ${geo.VH}`" preserveAspectRatio="xMidYMid meet" role="img" aria-label="График роста: число коммитов по дням">
          <defs>
            <linearGradient id="g-line" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#b9a4ff" /><stop offset=".5" stop-color="#ff7ec4" /><stop offset="1" stop-color="#6fc3ff" /></linearGradient>
            <linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9fd6" stop-opacity=".42" /><stop offset=".6" stop-color="#b9a4ff" stop-opacity=".16" /><stop offset="1" stop-color="#b9a4ff" stop-opacity="0" /></linearGradient>
            <radialGradient id="g-petal" cx=".5" cy=".9" r=".9"><stop offset="0" stop-color="#ff5fb6" /><stop offset="1" stop-color="#ffd0ea" /></radialGradient>
            <filter id="f-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
            <clipPath id="g-clip"><rect ref="clipRect" x="0" y="0" :width="geo.VW" :height="geo.VH" /></clipPath>
          </defs>

          <g class="grid">
            <g v-for="g in geo.gridY" :key="g.v" class="gl">
              <line :x1="geo.PLOT.l" :x2="geo.PLOT.r" :y1="g.y" :y2="g.y" />
              <text :x="geo.PLOT.l - 12" :y="g.y + 4" text-anchor="end">{{ g.v }}</text>
            </g>
            <text v-for="t in geo.ticks" :key="t.label" :x="t.x" :y="geo.VH - 14" text-anchor="middle" class="xl">{{ t.label }}</text>
          </g>

          <g class="bars">
            <rect v-for="b in geo.dayBars" :key="b.d" class="bar" :x="b.x - 7" :y="geo.PLOT.bars - b.h" width="14" :height="b.h" rx="5" fill="url(#g-line)" opacity=".75"><title>{{ b.d }}: {{ b.n }} коммитов</title></rect>
          </g>

          <path :d="geo.areaD" fill="url(#g-area)" clip-path="url(#g-clip)" />
          <path ref="glowEl" :d="geo.C.d" class="glow" fill="none" stroke="url(#g-line)" stroke-width="16" stroke-linecap="round" filter="url(#f-glow)" opacity=".75" />
          <path ref="lineEl" :d="geo.C.d" class="line" fill="none" stroke="url(#g-line)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />

          <g class="blooms">
            <g v-for="m in geo.marks" :key="m.i" class="bloom" :transform="`translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) scale(${geo.flower})`">
              <circle class="halo" r="14" fill="none" stroke="#ff7ec4" stroke-width="2" />
              <g class="flower">
                <path v-for="k in 5" :key="k" :d="PETAL" :transform="`rotate(${(k - 1) * 72})`" fill="url(#g-petal)" opacity=".95" />
                <circle r="5" fill="#fff6c8" stroke="#ff7ec4" stroke-width="1.5" />
              </g>
              <title>{{ m.title }}</title>
            </g>
          </g>

          <g class="trail"><circle v-for="n in 9" :key="n" r="7" :opacity="(0.5 - n * 0.05).toFixed(2)" fill="#ff7ec4" /></g>
          <g ref="headEl" class="head">
            <circle r="16" fill="#ff7ec4" opacity=".28" />
            <circle r="9" fill="#fff" stroke="#ff4fae" stroke-width="3" />
          </g>
        </svg>

        <div ref="introEl" class="intro">
          <div class="kicker fade">как росла платформа</div>
          <h1>Рост платформы</h1>
          <p class="fade">Каждый коммит от первого до сегодняшнего. Листай вниз: линия пойдёт от нуля вверх, а на главных событиях распустятся цветки.</p>
          <div class="hint fade"><span ref="hintEl">↓</span> листай</div>
        </div>

        <div class="hud">
          <div class="count"><b ref="cntEl">{{ nf.format(GROWTH.commits) }}</b><span>коммитов</span></div>
          <div ref="dateEl" class="date">{{ at(geo.t1) }}</div>
          <div class="prog"><i ref="progEl"></i></div>
        </div>

        <article ref="cardEl" class="card">
          <time ref="cTime"></time>
          <h2 ref="cTitle"></h2>
          <p ref="cText"></p>
        </article>

        <div ref="finEl" class="fin">
          <ul>
            <li><b>{{ nf.format(totalStats.commits) }}</b> коммитов</li>
            <li><b>{{ totalStats.days }}</b> дней работы</li>
            <li><b>{{ nf.format(Math.round(totalStats.lines / 1000)) }} тыс.</b> строк кода</li>
            <li><b>{{ totalStats.marks }}</b> ключевых событий</li>
          </ul>
          <RouterLink to="/history" class="jump solid">Читать всю историю →</RouterLink>
        </div>
      </section>
    </div>

    <ol class="sr-only">
      <li v-for="m in GROWTH.marks" :key="m.d + m.title">{{ m.d }}: {{ m.title }}. {{ m.summary }}</li>
    </ol>
  </main>
</template>

<style scoped>
.grow { --ink: #1e2350; --soft: #8b8fc4; --line: rgba(120, 110, 200, .16); --accent: #d64da9;
  position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; color: var(--ink); font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; background: #fbf8ff; }
.grow a { color: inherit; text-decoration: none; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.top { position: fixed; z-index: 20; inset: 0 0 auto 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px clamp(16px, 4vw, 48px); background: rgba(251, 248, 255, .6); backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand .mark { font-size: 24px; color: #6a5cd0; line-height: 1; }
.brand .name { font-size: 17px; letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--soft); text-transform: uppercase; }
.nav { display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--soft); }
.nav a:hover { color: var(--ink); }
.jump { padding: 8px 16px; border: 1px solid var(--ink); border-radius: 22px; background: transparent; color: var(--ink); font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; white-space: nowrap; display: inline-block; }
.jump:hover, .jump.solid { background: var(--ink); color: #fff; }
.jump.solid:hover { background: var(--accent); border-color: var(--accent); }

.track { position: relative; }
.scene { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.bg { position: absolute; inset: 0; background: linear-gradient(160deg, #fff6fb 0%, #f1ecff 48%, #e6f5ff 100%); }
.orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .7; will-change: transform; }
.o1 { width: 46vmax; height: 46vmax; left: -12vmax; bottom: -16vmax; background: #ffc1e4; }
.o2 { width: 40vmax; height: 40vmax; right: -10vmax; top: -12vmax; background: #bfe0ff; }
.o3 { width: 28vmax; height: 28vmax; left: 38%; top: 30%; background: #d8cbff; opacity: .5; }
.petals { position: absolute; inset: 0; pointer-events: none; }
.petal { position: absolute; left: 0; top: 0; width: 14px; height: 14px; border-radius: 100% 0 100% 0; background: linear-gradient(135deg, #ffd0ea, #ff8fcb); }

.chart { position: absolute; inset: 64px 0 0 0; width: 100%; height: calc(100% - 64px); }
.grid line { stroke: rgba(120, 110, 200, .18); stroke-dasharray: 3 7; }
.grid text { font-size: 12px; fill: var(--soft); font-weight: 600; }

.intro { position: absolute; z-index: 6; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 0 24px; text-align: center; pointer-events: none; }
.kicker { display: inline-flex; align-items: center; gap: 10px; font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--soft); }
.kicker::before { content: ""; width: 26px; height: 1px; background: var(--accent); }
.intro h1 { margin: 6px 0 4px; font-size: clamp(44px, 8vw, 104px); line-height: .98; letter-spacing: -.04em; font-weight: 800; overflow: hidden; padding-bottom: .08em; }
.intro p { margin: 0; max-width: 540px; line-height: 1.7; font-size: 15px; color: #6c70a8; }
.hint { margin-top: 16px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--soft); }
.hint span { display: inline-block; font-size: 18px; color: var(--accent); margin-right: 6px; }

.hud { position: absolute; z-index: 5; right: clamp(18px, 4vw, 64px); bottom: 124px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; pointer-events: none; }
.count { display: flex; align-items: baseline; gap: 10px; }
.count b { font-size: clamp(54px, 9vw, 120px); line-height: .9; letter-spacing: -.05em; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; text-shadow: 0 10px 40px rgba(214, 77, 169, .3); }
.count span { font-size: 14px; color: var(--soft); }
.date { font-size: clamp(16px, 2vw, 24px); font-weight: 700; letter-spacing: .02em; min-height: 1.3em; }
.prog { width: min(300px, 60vw); height: 4px; margin-top: 8px; border-radius: 2px; background: rgba(120, 110, 200, .18); overflow: hidden; }
.prog i { display: block; width: 100%; height: 100%; border-radius: 2px; background: linear-gradient(90deg, #ff9fd6, #6fc3ff); transform: scaleX(0); transform-origin: 0 50%; }

.card { position: absolute; z-index: 7; left: clamp(18px, 4vw, 64px); top: 112px; width: min(430px, 40vw); padding: 20px 24px; background: rgba(255, 255, 255, .82); backdrop-filter: blur(10px); border: 1px solid #fff; border-radius: 24px; box-shadow: 0 24px 60px rgba(100, 87, 170, .2); }
.card time { display: block; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--accent); font-weight: 700; min-height: 1.2em; }
.card h2 { margin: 8px 0 6px; font-size: clamp(20px, 2.2vw, 28px); line-height: 1.15; letter-spacing: -.02em; overflow: hidden; padding-bottom: .1em; }
.card p { margin: 0; font-size: 14px; line-height: 1.6; color: #6c70a8; }

.fin { position: absolute; z-index: 8; left: clamp(18px, 4vw, 64px); top: 112px; width: min(560px, 44vw); padding: 24px 28px; text-align: left; background: rgba(255, 255, 255, .86); backdrop-filter: blur(14px); border: 1px solid #fff; border-radius: 32px; box-shadow: 0 34px 90px rgba(100, 87, 170, .3); }
.fin ul { list-style: none; display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 12px 28px; margin: 0 0 20px; padding: 0; color: var(--soft); font-size: 13px; }
.fin b { display: block; font-size: clamp(30px, 5vw, 52px); letter-spacing: -.03em; color: var(--ink); font-weight: 800; font-variant-numeric: tabular-nums; }

@media (max-width: 800px) {
  .top .brand .sub, .nav a { display: none; }
  .nav { gap: 8px; }
  .jump { padding: 7px 11px; }
  .card { top: auto; bottom: 18px; left: 14px; right: 14px; width: auto; padding: 14px 18px; }
  .card p { font-size: 13px; }
  .fin { top: auto; bottom: 18px; left: 14px; right: 14px; width: auto; padding: 16px 18px; }
  .fin ul { gap: 8px 18px; margin-bottom: 14px; }
  .hud { right: 14px; bottom: auto; top: 76px; }
  .count b { font-size: 48px; }
  .chart { inset: 120px 0 150px 0; height: auto; }
}
</style>
