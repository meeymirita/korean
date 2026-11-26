<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DISTRICTS, DISTRICT_BY_ID, PLACES, districtStat, mapIndex, type PlaceVlog } from '@/data/korean/vlog-map'
import { ICON_DEFS } from '@/data/korean/vlog-map-art'
import { PLACE_AT, SCENE_H, SCENE_W, districtCenter } from '@/data/korean/vlog-map-scene'
import VlogMapScene from './VlogMapScene.vue'
import { STUDY_VLOGS } from '@/data/korean/vlog-study'
import { useRoute } from 'vue-router'
import { useVlogWatched } from '@/composables/useVlogWatched'

/**
 * «Карта мест»: один большой остров, районы-территории и места из влогов. Наведи на место или район: подсказка, какие там влоги; нажми: панель с влогами и фразами.
 * Масштаб и перемещение: колесо, щипок и перетаскивание (`@panzoom/panzoom`), анимации на GSAP (грузятся лениво, при «уменьшить движение» выключены).
 * Только справка: ничего не записывается и не засчитывается.
 */
const { watched, loadWatched } = useVlogWatched()
const view = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const full = ref(false)
const hoverId = ref('')
const selId = ref('')
const tipOn = ref(false)
const tipEl = ref<HTMLElement>()
const panning = ref(false)
/** Конец последнего перетаскивания: нажатие сразу после него не считается выбором места. */
let dragEnd = 0
let ptr = { x: 0, y: 0 }
let raf = 0
const mode = ref<'all' | 'unseen'>('all')
const q = ref('')
const scale = ref(0.5)

/** Размер холста сцены (картинки нарезаны из набора владельца, `VlogMapScene`). */
const W = SCENE_W
const H = SCENE_H

const idx = computed(() => (import.meta.client ? mapIndex() : new Map()))

const seenYt = computed(() => new Set(watched.value))
const unseenOf = (id: string) => (idx.value.get(id)?.vlogs ?? []).filter((v: PlaceVlog) => !seenYt.value.has(v.yt)).length
const countOf = (id: string) => idx.value.get(id)?.vlogs.length ?? 0
const ql = computed(() => q.value.trim().toLowerCase())
const matches = (p: (typeof PLACES)[number]) => !ql.value || p.ko.includes(ql.value) || p.ru.toLowerCase().includes(ql.value)
const faded = (p: (typeof PLACES)[number]) => (mode.value === 'unseen' && !unseenOf(p.id)) || !matches(p)

const activeDistrict = computed(() => {
  const id = hoverId.value || selId.value
  if (id.startsWith('d:')) return id.slice(2)
  return PLACES.find(p => p.id === id)?.district ?? ''
})

// ——— подсказка и панель ———
const place = computed(() => PLACES.find(p => p.id === (hoverId.value || ''))) // подсказка о месте
const tipDistrict = computed(() => (hoverId.value.startsWith('d:') ? DISTRICT_BY_ID.get(hoverId.value.slice(2)) : undefined))
const tipVlogs = computed(() => (place.value ? (idx.value.get(place.value.id)?.vlogs ?? []).slice(0, 3) : tipDistrict.value ? districtStat(tipDistrict.value.id).vlogs.slice(0, 3) : []))
const tipTotals = computed(() => {
  if (place.value) return { vlogs: countOf(place.value.id), phrases: idx.value.get(place.value.id)?.total ?? 0 }
  if (tipDistrict.value) {
    const s = districtStat(tipDistrict.value.id)
    return { vlogs: s.vlogs.length, phrases: s.total }
  }
  return { vlogs: 0, phrases: 0 }
})
const selPlace = computed(() => PLACES.find(p => p.id === selId.value))
const selDistrict = computed(() => (selId.value.startsWith('d:') ? DISTRICTS.find(d => d.id === selId.value.slice(2)) : undefined))
const selStat = computed(() => {
  if (selPlace.value) {
    const s = idx.value.get(selPlace.value.id)
    return { vlogs: s?.vlogs ?? [], phrases: s?.phrases ?? [], total: s?.total ?? 0, places: [] as typeof PLACES }
  }
  if (selDistrict.value) {
    const s = districtStat(selDistrict.value.id)
    return { vlogs: s.vlogs, phrases: [], total: s.total, places: s.places }
  }
  return null
})
const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c)
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const cover = (yt: string) => `/api/video/vlog-cover/${yt}`
function coverFallback(e: Event, yt: string) {
  const img = e.target as HTMLImageElement
  if (img.dataset.f) return
  img.dataset.f = '1'
  img.src = `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`
}

/** Подсказка стоит у курсора; позицию пишем прямо в стиль (не через состояние), чтобы карта не перерисовывалась на каждое движение мыши. */
function placeTip() {
  const el = tipEl.value
  const r = view.value?.getBoundingClientRect()
  if (!el || !r) return
  el.style.left = `${Math.min(r.width - 300, ptr.x - r.left + 18)}px`
  el.style.top = `${Math.min(r.height - 210, Math.max(8, ptr.y - r.top + 14))}px`
}
function moveTip(e: MouseEvent) {
  if (panning.value) return
  ptr = { x: e.clientX, y: e.clientY }
  if (!raf) raf = requestAnimationFrame(() => ((raf = 0), placeTip()))
}
function hover(id: string, e: MouseEvent | FocusEvent) {
  if (panning.value) return
  hoverId.value = id
  if (e instanceof MouseEvent) {
    ptr = { x: e.clientX, y: e.clientY }
    tipOn.value = true
    void nextTick(placeTip)
  } else tipOn.value = false
}
function leave() {
  hoverId.value = ''
  tipOn.value = false
}
const justDragged = () => Date.now() - dragEnd < 180
function select(id: string) {
  if (justDragged()) return
  selId.value = selId.value === id ? '' : id
  tipOn.value = false
  hoverId.value = ''
  if (selId.value) void focusOn(selId.value)
}
function closePanel() {
  if (justDragged()) return
  selId.value = ''
}
function randomPlace() {
  const pool = PLACES.filter(p => unseenOf(p.id) > 0)
  const list = pool.length ? pool : PLACES.filter(p => countOf(p.id) > 0)
  select(list[Math.floor(Math.random() * list.length)]!.id)
}

// ——— масштаб и перемещение ———
type Pan = import('@panzoom/panzoom').PanzoomObject
let pz: Pan | null = null
let stop = () => {}
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function fitScale() {
  const c = view.value
  return c ? Math.min(c.clientWidth / W, c.clientHeight / H) : 0.5
}
/** Начальный масштаб: вся карта; на узком экране крупнее, иначе подписи не прочитать (карту двигают пальцем). */
const startScale = () => (typeof window !== 'undefined' && window.innerWidth < 760 ? Math.max(fitScale(), 0.3) : fitScale())
function fit(animate = true) {
  if (!pz) return
  const sc = startScale()
  pz.zoom(sc, { animate: animate && !reduced(), force: true })
  pz.pan(0, 0, { animate: animate && !reduced(), force: true })
}
async function focusOn(id: string) {
  if (!pz) return
  const p = PLACES.find(x => x.id === id)
  const d = DISTRICTS.find(x => `d:${x.id}` === id)
  const at = p ? PLACE_AT[p.id] : d ? districtCenter(d.id, PLACES) : undefined
  const cx = at ? at.x : W / 2
  const cy = at ? at.y : H / 2
  const sc = Math.max(fitScale() * 1.9, p ? 0.9 : 0.75)
  const panelShift = (view.value?.clientWidth ?? 1200) > 900 ? 190 : 0
  pz.zoom(sc, { animate: !reduced(), force: true })
  await nextTick()
  pz.pan(W / 2 - cx - panelShift / sc, H / 2 - cy, { animate: !reduced(), force: true })
}
const zoomIn = () => pz?.zoomIn({ animate: !reduced() })
const zoomOut = () => pz?.zoomOut({ animate: !reduced() })

async function setup() {
  const el = stage.value
  const box = view.value
  if (!el || !box) return
  const { default: Panzoom } = await import('@panzoom/panzoom')
  if (stage.value !== el) return
  pz = Panzoom(el, { maxScale: 3.4, minScale: 0.18, cursor: 'grab', step: 0.28, canvas: false, startScale: startScale() })
  pz.zoom(startScale(), { animate: false, force: true })
  const wheel = (e: WheelEvent) => pz?.zoomWithWheel(e)
  box.addEventListener('wheel', wheel, { passive: false })
  const onZoom = () => (scale.value = pz?.getScale() ?? scale.value)
  el.addEventListener('panzoomzoom', onZoom)
  let from = { x: 0, y: 0 }
  const onStart = () => ((from = pz?.getPan() ?? from), (panning.value = false))
  const onPan = () => {
    const now = pz?.getPan() ?? from
    if (!panning.value && Math.abs(now.x - from.x) + Math.abs(now.y - from.y) > 6) {
      panning.value = true
      leave()
    }
  }
  const onEnd = () => {
    if (panning.value) dragEnd = Date.now()
    panning.value = false
  }
  el.addEventListener('panzoomstart', onStart)
  el.addEventListener('panzoompan', onPan)
  el.addEventListener('panzoomend', onEnd)
  const onResize = () => fit(false)
  window.addEventListener('resize', onResize)
  stop = () => {
    box.removeEventListener('wheel', wheel)
    el.removeEventListener('panzoomzoom', onZoom)
    el.removeEventListener('panzoomstart', onStart)
    el.removeEventListener('panzoompan', onPan)
    el.removeEventListener('panzoomend', onEnd)
    window.removeEventListener('resize', onResize)
    pz?.destroy()
    pz = null
  }
}

watch(full, async () => {
  await nextTick()
  fit(false)
})
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (selId.value) selId.value = ''
  else if (full.value) full.value = false
}
onMounted(() => {
  // `?full=1`: открыть карту сразу на весь экран
  if (useRoute().query.full === '1') full.value = true
  void loadWatched()
  // карта работает и без масштабирования и анимаций: если библиотеки не загрузились, остаётся неподвижная карта
  void setup().catch(() => undefined)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stop()
})
</script>

<template>
  <Teleport to="body" :disabled="!full">
    <section class="vm" :class="{ full }" aria-label="Карта мест из влогов">
      <svg class="vm-defs" width="0" height="0" aria-hidden="true"><defs v-html="ICON_DEFS" /></svg>

      <header class="vm-bar">
        <div class="vm-chips" role="group" aria-label="Показать">
          <button type="button" class="vm-chip" :class="{ on: mode === 'all' }" :aria-pressed="mode === 'all'" @click="mode = 'all'">Все места</button>
          <button type="button" class="vm-chip" :class="{ on: mode === 'unseen' }" :aria-pressed="mode === 'unseen'" @click="mode = 'unseen'">Где есть непросмотренные</button>
        </div>
        <input v-model="q" class="vm-q" type="search" placeholder="Найти место: кафе, 병원…" aria-label="Найти место" />
        <div class="vm-tools">
          <button type="button" class="vm-ico" title="Случайное место" aria-label="Случайное место" @click="randomPlace">🎲</button>
          <button type="button" class="vm-ico" title="Приблизить" aria-label="Приблизить" @click="zoomIn">＋</button>
          <button type="button" class="vm-ico" title="Отдалить" aria-label="Отдалить" @click="zoomOut">－</button>
          <button type="button" class="vm-ico" title="Показать всю карту" aria-label="Показать всю карту" @click="fit()">⟲</button>
          <button type="button" class="vm-ico" :title="full ? 'Свернуть' : 'На весь экран'" :aria-label="full ? 'Свернуть' : 'На весь экран'" @click="full = !full">{{ full ? '✕' : '⛶' }}</button>
        </div>
      </header>

      <div ref="view" class="vm-view" :class="{ 'has-hover': !!activeDistrict, panning }" @click="closePanel">
        <div ref="stage" class="vm-stage"             :style="{ width: `${W}px`, height: `${H}px` }">
          <VlogMapScene :hover-id="hoverId" :sel-id="selId" :count="countOf" :faded="faded" @hover="hover" @move="moveTip" @leave="leave" @select="select" />
        </div>

        <div v-if="tipOn && (place || tipDistrict)" ref="tipEl" class="vm-tip" role="tooltip">
          <b lang="ko">{{ place?.ko ?? tipDistrict?.ko }}</b> <span>{{ place?.ru ?? tipDistrict?.ru }}</span>
          <p v-if="tipTotals.vlogs">{{ tipTotals.vlogs }} {{ plural(tipTotals.vlogs, 'влог', 'влога', 'влогов') }}, {{ tipTotals.phrases }} {{ plural(tipTotals.phrases, 'фраза', 'фразы', 'фраз') }}</p>
          <p v-else class="vm-dim">Пока ни в одном влоге.</p>
          <ul v-if="tipVlogs.length"><li v-for="v in tipVlogs" :key="v.id"><img :src="cover(v.yt)" alt="" loading="lazy" referrerpolicy="no-referrer" @error="coverFallback($event, v.yt)" /><span>{{ v.title }}</span></li></ul>
          <small>Нажми, чтобы открыть список</small>
        </div>
        <div class="vm-zoom" aria-hidden="true">{{ Math.round(scale * 100) }}%</div>
        <p class="vm-hint" aria-hidden="true">Двигай карту и приближай колесом или щипком. Наведи на место, нажми, чтобы увидеть влоги.</p>
      </div>

      <aside class="vm-panel" :class="{ open: !!selStat }" aria-live="polite" @click.stop>
        <template v-if="selStat">
          <button type="button" class="vm-x" aria-label="Закрыть" @click="closePanel">✕</button>
          <div class="vm-ph">
            <svg v-if="selPlace" class="vm-pic" viewBox="0 0 120 120" aria-hidden="true"><use :href="`#vm-${selPlace.icon}`" :style="{ '--ic': selPlace.color }" /></svg>
            <div>
              <h3 lang="ko">{{ selPlace?.ko ?? selDistrict?.ko }}</h3>
              <p class="vm-ru">{{ selPlace?.ru ?? selDistrict?.ru }}</p>
            </div>
          </div>
          <p v-if="selPlace" class="vm-note">{{ selPlace.note }}</p>
          <p class="vm-sum">{{ selStat.vlogs.length }} {{ plural(selStat.vlogs.length, 'влог', 'влога', 'влогов') }}, {{ selStat.total }} {{ plural(selStat.total, 'фраза', 'фразы', 'фраз') }}</p>

          <div v-if="selStat.places.length" class="vm-pl">
            <button v-for="p in selStat.places" :key="p.id" type="button" class="vm-chip" @click="select(p.id)">{{ p.ko }} <small>{{ countOf(p.id) }}</small></button>
          </div>

          <h4>Влоги</h4>
          <ul class="vm-vl">
            <li v-for="v in selStat.vlogs" :key="v.id" :class="{ seen: seenYt.has(v.yt) }">
              <img :src="cover(v.yt)" alt="" loading="lazy" referrerpolicy="no-referrer" @error="coverFallback($event, v.yt)" />
              <div>
                <b>{{ v.title }}</b>
                <small>{{ v.channel }} · {{ v.count }} {{ plural(v.count, 'фраза', 'фразы', 'фраз') }}<template v-if="seenYt.has(v.yt)"> · просмотрено</template></small>
                <span class="vm-links">
                  <NuxtLink :to="`/korean/vlog?v=${v.id}&t=${Math.floor(v.firstS)}`">смотреть с {{ clock(v.firstS) }}</NuxtLink>
                  <NuxtLink v-if="STUDY_VLOGS.includes(v.id)" :to="`/korean/vlog-study?v=${v.id}`">разбор</NuxtLink>
                </span>
              </div>
            </li>
          </ul>
          <p v-if="!selStat.vlogs.length" class="vm-dim">Об этом месте пока нет влогов.</p>

          <template v-if="selStat.phrases.length">
            <h4>Фразы об этом месте</h4>
            <ul class="vm-ph2">
              <li v-for="h in selStat.phrases" :key="`${h.id}-${h.i}`">
                <span lang="ko">{{ h.ko }}</span><br />{{ h.ru }}
                <NuxtLink :to="`/korean/vlog?v=${h.id}&t=${Math.floor(h.s)}`">{{ h.title }}, {{ clock(h.s) }}</NuxtLink>
              </li>
            </ul>
          </template>
        </template>
      </aside>
    </section>
  </Teleport>
</template>

<style scoped>
.vm { position: relative; margin-top: 14px; border-radius: 22px; overflow: hidden; border: 1px solid var(--line); background: #72c15f; }
.vm.full { position: fixed; inset: 0; z-index: 55; margin: 0; border-radius: 0; border: 0; }
.vm-defs { position: absolute; width: 0; height: 0; }
.vm-bar { position: absolute; z-index: 6; top: 12px; left: 12px; right: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; pointer-events: none; }
.vm-bar > * { pointer-events: auto; }
.vm-chips { display: flex; gap: 6px; padding: 4px; border-radius: 999px; background: rgba(255, 255, 255, .82); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 6px 22px rgba(70, 90, 140, .18); }
.vm-chip { border: 0; border-radius: 999px; background: transparent; color: #4a3f6b; padding: 6px 14px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .2s; }
.vm-chip:hover { background: rgba(143, 124, 240, .14); }
.vm-chip.on { background: #fff; box-shadow: 0 2px 10px rgba(70, 90, 140, .22); color: #2b2250; }
.vm-q { flex: 1 1 180px; max-width: 280px; padding: 9px 16px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, .86); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); color: #2b2250; font: inherit; font-size: 14px; box-shadow: 0 6px 22px rgba(70, 90, 140, .18); }
.vm-q::placeholder { color: #8a82ad; }
.vm-tools { display: flex; gap: 6px; margin-left: auto; }
.vm-ico { width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .88); color: #3b2f5e; font-size: 18px; cursor: pointer; box-shadow: 0 6px 18px rgba(70, 90, 140, .2); transition: transform .2s; }
.vm-ico:hover { transform: translateY(-2px) scale(1.06); }

.vm-view { position: relative; display: flex; align-items: center; justify-content: center; height: calc(100dvh - 330px); min-height: 480px; overflow: hidden; cursor: grab; touch-action: none; }
.vm.full .vm-view { height: 100dvh; }
.vm-view:active { cursor: grabbing; }
.vm-stage { flex: none; will-change: transform; }
.vm-view.panning, .vm-view.panning * { cursor: grabbing !important; }

/* подсказка при наведении */
.vm-tip { position: absolute; z-index: 8; width: 280px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, .96); color: #2b2250; box-shadow: 0 16px 40px rgba(60, 50, 110, .3); pointer-events: none; animation: vm-pop .16s ease-out; }
.vm-tip b { font-size: 19px; }
.vm-tip span { color: #6a5a9a; font-size: 14px; margin-left: 4px; }
.vm-tip p { margin: 6px 0 0; font-size: 14px; }
.vm-tip ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
.vm-tip li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; line-height: 1.3; }
.vm-tip img { width: 52px; height: 30px; object-fit: cover; border-radius: 6px; flex: none; background: #e8e2f5; }
.vm-tip small { display: block; margin-top: 8px; color: #8a82ad; font-size: 12px; }
@keyframes vm-pop { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: none; } }
.vm-dim { color: #8a82ad; }
.vm-hint { position: absolute; z-index: 5; left: 50%; bottom: 10px; max-width: min(92%, 640px); margin: 0; padding: 5px 14px; border-radius: 999px; background: rgba(255, 255, 255, .78); color: #5d5388; font-size: 12px; text-align: center; transform: translateX(-50%); pointer-events: none; animation: vm-hint 9s ease forwards; }
@keyframes vm-hint { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
.vm-zoom { position: absolute; z-index: 5; left: 14px; bottom: 12px; padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, .8); color: #5d5388; font-size: 12px; }

/* панель справа */
.vm-panel { position: absolute; z-index: 9; top: 0; right: 0; bottom: 0; width: min(400px, 92vw); padding: 56px 18px 24px; overflow-y: auto; background: rgba(255, 255, 255, .97); color: #2b2250; box-shadow: -18px 0 50px rgba(60, 50, 110, .28); transform: translateX(104%); transition: transform .42s cubic-bezier(.2, .9, .25, 1); overscroll-behavior: contain; }
.vm-panel.open { transform: none; }
.vm-x { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: #efeafb; color: #3b2f5e; font-size: 16px; cursor: pointer; }
.vm-ph { display: flex; align-items: center; gap: 12px; }
.vm-pic { width: 76px; height: 76px; flex: none; }
.vm-ph h3 { margin: 0; font-size: 28px; }
.vm-ru { margin: 2px 0 0; color: #6a5a9a; font-size: 15px; }
.vm-note { margin: 12px 0 0; font-size: 14.5px; line-height: 1.5; }
.vm-sum { margin: 10px 0 0; padding: 6px 12px; border-radius: 12px; background: #f1ecfd; font-size: 14px; font-weight: 600; width: fit-content; }
.vm-pl { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.vm-pl .vm-chip { background: #f1ecfd; }
.vm-panel h4 { margin: 18px 0 8px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #8a82ad; }
.vm-vl, .vm-ph2 { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.vm-vl li { display: flex; gap: 10px; padding: 8px; border-radius: 14px; background: #faf8ff; border: 1px solid #ebe5fa; }
.vm-vl li.seen { border-color: #8ad0a8; }
.vm-vl img { width: 96px; height: 54px; object-fit: cover; border-radius: 10px; flex: none; background: #e8e2f5; }
.vm-vl b { display: block; font-size: 14px; line-height: 1.3; }
.vm-vl small { display: block; margin-top: 2px; color: #7a72a0; font-size: 12px; }
.vm-links { display: flex; gap: 12px; margin-top: 4px; }
.vm-links a, .vm-ph2 a { color: #6a4fe0; font-size: 12.5px; text-decoration: none; }
.vm-ph2 li { padding: 8px 12px; border-left: 3px solid #cdbff7; font-size: 15px; line-height: 1.5; }
.vm-ph2 a { display: block; }
@media (max-width: 760px) {
  .vm-view { height: calc(100dvh - 230px); min-height: 460px; }
  .vm-panel { top: auto; width: 100%; height: 62%; padding-top: 52px; border-radius: 22px 22px 0 0; transform: translateY(104%); box-shadow: 0 -18px 50px rgba(60, 50, 110, .28); }
  .vm-q { display: none; }
  .vm-chip { padding: 5px 10px; font-size: 12px; }
  .vm-ico { width: 36px; height: 36px; }
  .vm-tip, .vm-hint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .vm-panel { transition: none; }
}
</style>
