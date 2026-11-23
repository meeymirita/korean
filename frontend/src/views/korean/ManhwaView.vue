<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/**
 * Манхва: полка (карточка на каждую манхву), список глав и читалка лентой. Картинки лежат на Яндекс.Диске (`korean_manhwa/<манхва>/`,
 * кладут `scripts/manhwa-import.mjs` и `manhwa-upload.mjs`), сервер отдаёт полку (`GET /api/manhwa`) и главы со ссылками на страницы (`GET /api/manhwa/<манхва>`),
 * только владелец. Прочитанные главы и место, где остановился, хранятся в браузере отдельно для каждой манхвы.
 */
interface Page { u: string; w: number; h: number }
interface Chapter { n: number; cv?: string; pages: Page[] }
interface Book { slug: string; title: string; chapters: number[]; cover: string | null; ownCover?: boolean }
interface State { read: number[]; pos: Record<string, number> }

const KEY = 'manhwa_v2'
const progress = useProgressStore()
const route = useRoute()
const router = useRouter()
const headers = () => ({ Authorization: `Bearer ${progress.bearer}` })

const books = ref<Book[]>([])
const chapters = ref<Chapter[]>([])
const loaded = ref(false)
const failed = ref(false)
const chaptersLoading = ref(false)
const store = ref<Record<string, State>>({})
const filter = ref<'all' | 'todo' | 'read'>('all')

/** открытая манхва (?b=папка), глава (?c=номер) */
const slug = computed(() => (typeof route.query.b === 'string' ? route.query.b : ''))
const openN = computed(() => {
  // без параметра c читалка закрыта (-1): у некоторых манхв есть глава с номером 0, её нельзя путать с «главы не выбрано»
  const raw = route.query.c
  const v = typeof raw === 'string' && raw !== '' ? Number(raw) : NaN
  return Number.isInteger(v) ? v : -1
})
const book = computed(() => books.value.find(b => b.slug === slug.value))
const title = computed(() => book.value?.title ?? 'Манхва')
const stateOf = (s: string): State => store.value[s] ?? { read: [], pos: {} }
const state = computed(() => stateOf(slug.value))
const chapter = computed(() => (slug.value ? chapters.value.find(c => c.n === openN.value) : undefined))
const idx = computed(() => chapters.value.findIndex(c => c.n === openN.value))
const prev = computed(() => chapters.value[idx.value - 1])
const next = computed(() => chapters.value[idx.value + 1])
/** обложка главы: вторая страница (на первой обычно реклама и пустое поле) */
const cover = (c: Chapter) => c.cv ?? (c.pages[1] ?? c.pages[0]!).u
const isRead = (n: number) => state.value.read.includes(n)

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.value))
  } catch {
    /* хранилище недоступно */
  }
}
/** запись состояния нужной манхвы (создаётся при первой отметке) */
function mut(): State {
  return (store.value[slug.value] ??= { read: [], pos: {} })
}

function toggleRead(n: number) {
  const st = mut()
  st.read = st.read.includes(n) ? st.read.filter(x => x !== n) : [...st.read, n].sort((a, b) => a - b)
  save()
}

/** сколько страниц прочитано в главе (в процентах) */
function percent(c: Chapter) {
  if (isRead(c.n)) return 100
  const p = state.value.pos[c.n]
  return p === undefined ? 0 : Math.min(99, Math.round(((p + 1) / c.pages.length) * 100))
}

const readCount = computed(() => chapters.value.filter(c => isRead(c.n)).length)
const total = computed(() => chapters.value.length)
const resume = computed(() => {
  const started = chapters.value.find(c => !isRead(c.n) && state.value.pos[c.n] !== undefined)
  return started ?? chapters.value.find(c => !isRead(c.n))
})
const shown = computed(() => chapters.value.filter(c => (filter.value === 'all' ? true : filter.value === 'read' ? isRead(c.n) : !isRead(c.n))))

/** сводка по карточке на полке: сколько прочитано и с какой главы продолжить (страницы глав на полке не грузятся) */
function summary(b: Book) {
  const st = stateOf(b.slug)
  const read = b.chapters.filter(n => st.read.includes(n)).length
  const started = b.chapters.find(n => !st.read.includes(n) && st.pos[n] !== undefined)
  const nextN = started ?? b.chapters.find(n => !st.read.includes(n))
  return { read, nextN, started: started !== undefined }
}

function openBook(s: string) {
  void router.push({ query: { b: s } })
}
function openChapter(n: number) {
  void router.push({ query: { b: slug.value, c: String(n) } })
}
/** из читалки назад к главам, из глав на полку */
function closeChapter() {
  void router.push({ query: { b: slug.value } })
}
function closeBook() {
  void router.push({ query: {} })
}

/** главы открытой манхвы со ссылками на страницы */
async function loadBook(s: string) {
  chapters.value = []
  if (!s) return
  chaptersLoading.value = true
  try {
    const res = await fetchT(`/api/manhwa/${encodeURIComponent(s)}`, { headers: headers() }, 30_000)
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { chapters: Chapter[] }
    if (s === slug.value) chapters.value = data.chapters
  } catch {
    if (s === slug.value) failed.value = true
  } finally {
    chaptersLoading.value = false
  }
}

/** своя обложка манхвы: файл с компьютера открывается в редакторе (приближение и сдвиг рамки 3:4), обрезанная картинка уходит на сервер и на Яндекс.Диск рядом с главами */
const coverBusy = ref(false)
const crop = ref<{ img: HTMLImageElement; url: string } | null>(null)
const zoomK = ref(1)
const shiftX = ref(0.5)
const shiftY = ref(0)
const cropCanvas = ref<HTMLCanvasElement | null>(null)

/** область исходной картинки, попавшая в рамку 3:4 */
function cropRect() {
  const img = crop.value!.img
  const w = img.naturalWidth
  const h = img.naturalHeight
  const baseW = w / h >= 3 / 4 ? (h * 3) / 4 : w
  const cw = baseW / zoomK.value
  const ch = (cw * 4) / 3
  return { x: (w - cw) * shiftX.value, y: (h - ch) * shiftY.value, w: cw, h: ch }
}
function drawCrop(canvas: HTMLCanvasElement, outW: number) {
  const r = cropRect()
  canvas.width = outW
  canvas.height = Math.round((outW * 4) / 3)
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.drawImage(crop.value!.img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
}
watch([crop, zoomK, shiftX, shiftY], async () => {
  await nextTick()
  if (crop.value && cropCanvas.value) drawCrop(cropCanvas.value, 300)
})
function closeCrop() {
  if (crop.value) URL.revokeObjectURL(crop.value.url)
  crop.value = null
}
function pickCover(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !book.value) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    zoomK.value = 1
    shiftX.value = 0.5
    shiftY.value = 0
    crop.value = { img, url }
  }
  img.onerror = () => {
    URL.revokeObjectURL(url)
    useToastStore().error('Не удалось открыть картинку: нужен jpg, png или webp')
  }
  img.src = url
}
async function saveCover() {
  if (!crop.value || !book.value || coverBusy.value) return
  const toast = useToastStore()
  coverBusy.value = true
  try {
    const canvas = document.createElement('canvas')
    drawCrop(canvas, 600)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9))
    if (!blob) throw new Error('картинка не собралась')
    const form = new FormData()
    form.append('file', blob, 'cover.jpg')
    const res = await fetchT(`/api/manhwa/${encodeURIComponent(book.value.slug)}/cover`, { method: 'POST', headers: headers(), body: form }, 120_000)
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? String(res.status))
    const { cover } = (await res.json()) as { cover: string }
    book.value.cover = cover
    book.value.ownCover = true
    closeCrop()
    toast.ok('Обложка загружена')
  } catch (err) {
    toast.error(`Не получилось загрузить обложку: ${err instanceof Error ? err.message : 'ошибка'}`)
  } finally {
    coverBusy.value = false
  }
}

/* --- читалка: текущая страница по прокрутке --- */
const current = ref(0)
const pageEls = ref<HTMLElement[]>([])
/** сам лист: читалка занимает весь экран и листается внутри себя, без фона сайта */
const scroller = ref<HTMLElement | null>(null)
/** боковое меню глав в читалке: на широком экране открыто сразу, на узком по кнопке */
const tocOpen = ref(false)
/** ширина ленты в пикселях: кнопки «приблизить / отдалить» в нижней панели, выбор помнится в браузере */
const ZOOMS = [400, 560, 680, 800, 960, 1120, 1320]
const zoom = ref(3)
function setZoom(d: number) {
  const z = Math.min(ZOOMS.length - 1, Math.max(0, zoom.value + d))
  if (z === zoom.value) return
  const keep = current.value
  zoom.value = z
  try { localStorage.setItem('manhwa_zoom', String(z)) } catch { /* без хранилища */ }
  void nextTick(() => pageEls.value[keep]?.scrollIntoView({ block: 'start' }))
}
const tocEl = ref<HTMLElement | null>(null)
function tocToCurrent() {
  void nextTick(() => tocEl.value?.querySelector('.on')?.scrollIntoView({ block: 'center' }))
}
let raf = 0

function measure() {
  raf = 0
  const els = pageEls.value
  if (!els.length) return
  const mid = window.innerHeight * 0.35
  let k = 0
  for (let i = 0; i < els.length; i++) {
    if (els[i]!.getBoundingClientRect().top <= mid) k = i
    else break
  }
  current.value = k
  const c = chapter.value
  if (!c) return
  mut().pos[c.n] = k
  const sc = scroller.value
  const atEnd = !!sc && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 40
  if (atEnd && k === c.pages.length - 1 && !isRead(c.n)) toggleRead(c.n)
  else save()
}
function onScroll() {
  if (!raf) raf = requestAnimationFrame(measure)
}

async function enter() {
  current.value = 0
  await nextTick()
  const c = chapter.value
  if (!c) return
  const p = state.value.pos[c.n]
  if (p && !isRead(c.n) && pageEls.value[p]) pageEls.value[p]!.scrollIntoView({ block: 'start' })
  else scroller.value?.scrollTo(0, 0)
  measure()
  tocToCurrent()
}

watch(slug, async s => {
  failed.value = false
  await loadBook(s)
  if (chapter.value) await enter()
})
watch(tocOpen, v => v && tocToCurrent())
watch(openN, async () => {
  tocToCurrent()
  pageEls.value = []
  if (chapter.value) await enter()
})

onMounted(async () => {
  tocOpen.value = window.innerWidth >= 1100
  const z = Number(localStorage.getItem('manhwa_zoom'))
  if (Number.isInteger(z) && z >= 0 && z < ZOOMS.length) zoom.value = z
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem('manhwa_v1') ?? 'null') as Record<string, State> | State | null
    // прежняя запись (одна манхва, `manhwa_v1`) принадлежит «love-quest»
    if (raw && Array.isArray((raw as State).read)) store.value = { 'love-quest': { read: (raw as State).read, pos: (raw as State).pos ?? {} } }
    else if (raw) store.value = raw as Record<string, State>
  } catch {
    /* повреждённая запись */
  }
  try {
    const res = await fetchT('/api/manhwa', { headers: headers() }, 30_000)
    if (!res.ok) throw new Error(String(res.status))
    books.value = ((await res.json()) as { books: Book[] }).books
    if (!books.value.length) failed.value = true
  } catch {
    failed.value = true
  }
  loaded.value = true
  if (slug.value) {
    await loadBook(slug.value)
    if (chapter.value) await enter()
  }
})
/** Esc выходит из читалки к списку глав (если открыто окно сайта поверх, оно закрывается своим Esc, читалку не трогаем) */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && chapter.value && !e.defaultPrevented) closeChapter()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="!slug" class="wrap mh">
    <SectionHead id="manhwa" sub="выбери манхву: внутри главы, отметки «прочитано» и продолжение с того места, где остановился" />
    <p v-if="!loaded" class="note">Загружаю…</p>
    <p v-else-if="failed" class="note">Манхвы пока нет: на Яндекс.Диске нет папки <code>korean_manhwa</code> с манхвой внутри (или сервер её не видит). Положи туда главы: <code>node scripts/manhwa-import.mjs &lt;папка&gt; love-quest "Love Quest"</code>, потом <code>node scripts/manhwa-upload.mjs love-quest</code>.</p>
    <ul v-else class="shelf">
      <li v-for="b in books" :key="b.slug">
        <a class="book" :href="`/korean/manhwa?b=${b.slug}`" @click.prevent="openBook(b.slug)">
          <span class="book-cover"><img v-if="b.cover" :src="b.cover" :alt="b.title" loading="lazy" decoding="async" /></span>
          <span class="book-cap">
            <b>{{ b.title }}</b>
            <small>{{ b.chapters.length }} глав · прочитано {{ summary(b).read }}</small>
            <span class="bar"><i :style="{ width: (b.chapters.length ? (summary(b).read / b.chapters.length) * 100 : 0) + '%' }"></i></span>
            <em v-if="summary(b).nextN !== undefined">{{ summary(b).started ? 'Продолжить' : 'Начать' }} · глава {{ summary(b).nextN }}</em>
            <em v-else>Всё прочитано</em>
          </span>
        </a>
      </li>
    </ul>
  </div>

  <div v-else-if="!chapter" class="wrap mh">
    <SectionHead id="manhwa" :big="total ? `${readCount}/${total}` : undefined" sub="главы лентой: листай, отмечай прочитанное, продолжай с того места, где остановился">
      <template #title-extra><button class="ghost" @click="closeBook">← Все манхвы</button></template>
    </SectionHead>
    <p v-if="!loaded || chaptersLoading" class="note">Загружаю главы…</p>
    <p v-else-if="failed" class="note">Не удалось открыть эту манхву: проверь, что в <code>korean_manhwa</code> на Диске есть её папка с <code>index.json</code>.</p>
    <template v-else>
      <div class="hero">
        <label class="hero-cover" title="Загрузить свою обложку (jpg, png, webp)">
          <img v-if="book?.cover" :src="book.cover" :alt="title" />
          <span class="hero-up">Сменить обложку</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" @change="pickCover" />
        </label>
        <div class="hero-text">
          <h2>{{ title }}</h2>
          <p>{{ total }} глав · прочитано {{ readCount }}</p>
          <div class="bar big"><i :style="{ width: (total ? (readCount / total) * 100 : 0) + '%' }"></i></div>
        </div>
        <button v-if="resume" class="go" @click="openChapter(resume.n)">
          {{ state.pos[resume.n] !== undefined ? 'Продолжить' : 'Начать' }} · глава {{ resume.n }}
        </button>
      </div>
      <div class="filters">
        <button v-for="f in [['all', 'Все'], ['todo', 'Не прочитано'], ['read', 'Прочитано']] as const" :key="f[0]" :class="{ on: filter === f[0] }" @click="filter = f[0]">{{ f[1] }}</button>
      </div>
      <ul class="grid">
        <li v-for="c in shown" :key="c.n">
          <a class="card" :class="{ done: isRead(c.n) }" :href="`/korean/manhwa?b=${slug}&c=${c.n}`" @click.prevent="openChapter(c.n)">
            <span class="cover"><img :src="cover(c)" :alt="`Глава ${c.n}`" loading="lazy" decoding="async" /></span>
            <span class="badge" v-if="isRead(c.n)">прочитано</span>
            <span class="cap">
              <b>Глава {{ c.n }}</b>
              <small>{{ c.pages.length }} стр.<template v-if="!isRead(c.n) && state.pos[c.n] !== undefined"> · на {{ state.pos[c.n]! + 1 }}-й</template></small>
              <span class="bar"><i :style="{ width: percent(c) + '%' }"></i></span>
            </span>
          </a>
        </li>
      </ul>
      <p v-if="!shown.length" class="note">В этом списке пока пусто.</p>
    </template>
  </div>

  <Teleport v-else-if="chapter" to="body">
    <div ref="scroller" class="reader" @scroll.passive="onScroll">
      <div class="strip" :style="{ maxWidth: ZOOMS[zoom] + 'px' }">
        <img
          v-for="(p, i) in chapter.pages"
          :key="chapter.n + '-' + i"
          :ref="el => { if (el) pageEls[i] = el as HTMLElement }"
          :src="p.u"
          :width="p.w"
          :height="p.h"
          :style="{ aspectRatio: `${p.w} / ${p.h}` }"
          :alt="`Глава ${chapter.n}, страница ${i + 1}`"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div class="end">
        <p>Конец главы {{ chapter.n }}</p>
        <div class="end-row">
          <button v-if="prev" class="ghost" @click="openChapter(prev.n)">← Глава {{ prev.n }}</button>
          <button class="ghost" @click="closeChapter">Все главы</button>
          <button v-if="next" class="go" @click="openChapter(next.n)">Глава {{ next.n }} →</button>
        </div>
      </div>
    </div>
    <button class="rd-close" title="Выйти из чтения (Esc)" aria-label="Выйти из чтения" @click="closeChapter">✕</button>
    <nav v-if="tocOpen" ref="tocEl" class="toc" aria-label="Главы">
      <button
        v-for="c in chapters"
        :key="c.n"
        class="toc-i"
        :class="{ on: c.n === chapter.n, done: isRead(c.n) }"
        :title="`Глава ${c.n}`"
        @click="openChapter(c.n)"
      >{{ c.n }}</button>
    </nav>
    <div class="dock" role="group" :aria-label="`${title}, глава ${chapter.n}`">
      <button class="dk-btn" title="К главам" @click="closeChapter">←</button>
      <button class="dk-btn dk-toc" :class="{ on: tocOpen }" title="Список глав" @click="tocOpen = !tocOpen">☰</button>
      <div class="dk-mid" role="progressbar" :aria-valuenow="current + 1" :aria-valuemax="chapter.pages.length">
        <span class="dk-ch">гл. {{ chapter.n }}</span>
        <b class="dk-cnt">{{ current + 1 }}<small> / {{ chapter.pages.length }}</small></b>
        <i class="dk-fill" :style="{ width: ((current + 1) / chapter.pages.length) * 100 + '%' }"></i>
      </div>
      <button class="dk-btn" title="Отдалить" :disabled="zoom === 0" @click="setZoom(-1)">−</button>
      <button class="dk-btn" title="Приблизить" :disabled="zoom === ZOOMS.length - 1" @click="setZoom(1)">+</button>
      <button class="dk-btn dk-read" :class="{ on: isRead(chapter.n) }" :title="isRead(chapter.n) ? 'Прочитано (нажми, чтобы снять)' : 'Отметить прочитанной'" @click="toggleRead(chapter.n)">✓</button>
    </div>
  </Teleport>

  <Teleport v-if="crop" to="body">
    <div class="crop-back" @click.self="closeCrop">
      <div class="crop" role="dialog" aria-modal="true" aria-label="Обложка манхвы">
        <h3>Обложка</h3>
        <canvas ref="cropCanvas" class="crop-view"></canvas>
        <label class="crop-row"><span>Приблизить</span><input v-model.number="zoomK" type="range" min="1" max="4" step="0.01" /></label>
        <label class="crop-row"><span>Влево — вправо</span><input v-model.number="shiftX" type="range" min="0" max="1" step="0.005" /></label>
        <label class="crop-row"><span>Вверх — вниз</span><input v-model.number="shiftY" type="range" min="0" max="1" step="0.005" /></label>
        <div class="crop-actions">
          <button class="ghost" :disabled="coverBusy" @click="closeCrop">Отмена</button>
          <button class="go" :disabled="coverBusy" @click="saveCover">{{ coverBusy ? 'Загружаю…' : 'Сохранить' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.note { margin: 16px 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); grid-auto-rows: 1fr; gap: 16px; margin: 18px 0 0; padding: 0; list-style: none; }
.shelf > li { display: flex; }
.book { display: flex; flex: 1; align-items: center; gap: 16px; min-height: 188px; padding: 14px; border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 6px 20px rgba(120, 90, 180, .08); background: var(--surface); color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.book:hover { transform: translateY(-3px); border-color: var(--gold); box-shadow: 0 12px 28px rgba(120, 90, 180, .16); }
.book-cover { flex: none; width: 120px; height: 160px; overflow: hidden; border-radius: 14px; background: var(--line); box-shadow: 0 4px 14px rgba(0, 0, 0, .18); }
.book-cover img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.book-cap { display: flex; flex-direction: column; justify-content: center; gap: 8px; min-width: 0; flex: 1; }
.book-cap b { display: -webkit-box; overflow: hidden; font-size: 20px; line-height: 1.2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.book-cap small { color: var(--muted); font-size: 13.5px; }
.book-cap em { font-style: normal; font-weight: 700; font-size: 14px; color: var(--gold); }
.hero { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin: 16px 0; padding: 18px 20px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); }
.hero-cover { position: relative; flex: 0 0 84px; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 12px; background: var(--line); cursor: pointer; }
.hero-cover img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.hero-cover input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.hero-up { position: absolute; inset: auto 0 0; padding: 14px 4px 5px; background: linear-gradient(transparent, rgba(0, 0, 0, .7)); color: #fff; font-size: 10.5px; font-weight: 600; text-align: center; opacity: 0; transition: opacity .15s; }
@media (hover: none) { .hero-up { opacity: 1; } }
.hero-cover:hover .hero-up, .hero-cover:focus-within .hero-up { opacity: 1; }
.hero-text { flex: 1 1 260px; }
.hero h2 { margin: 0 0 4px; font-size: 22px; }
.hero p { margin: 0 0 10px; color: var(--muted); font-size: 14px; }
.go { padding: 11px 20px; border: 0; border-radius: 999px; background: var(--gold); color: #fff; font: inherit; font-weight: 700; cursor: pointer; transition: transform .15s; }
.go:hover { transform: translateY(-2px); }
.bar { display: block; height: 5px; border-radius: 99px; background: var(--line); overflow: hidden; }
.bar.big { height: 8px; }
.bar i { display: block; height: 100%; border-radius: 99px; background: var(--gold); transition: width .3s; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 14px; }
.filters button, .ghost { padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: inherit; font: inherit; font-size: 13.5px; cursor: pointer; transition: border-color .15s; }
.filters button:hover, .ghost:hover { border-color: var(--gold); }
.filters button.on, .ghost.on { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 16%, var(--surface)); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 44%), 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.card { position: relative; display: flex; flex-direction: column; height: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.card:hover { transform: translateY(-3px); border-color: var(--gold); }
.card.done { border-color: var(--ok); }
.cover { display: block; aspect-ratio: 3 / 4; overflow: hidden; background: var(--line); }
.cover img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.card.done .cover img { opacity: .55; }
.badge { position: absolute; top: 8px; left: 8px; padding: 3px 9px; border-radius: 99px; background: var(--ok); color: #fff; font-size: 11.5px; font-weight: 700; }
.cap { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px 12px; }
.cap b { font-size: 15px; }
.cap small { color: var(--muted); font-size: 12.5px; }
.reader { position: fixed; inset: 0; z-index: 55; overflow-y: auto; overscroll-behavior: contain; background: #15131c; }
.dock { position: fixed; left: 50%; bottom: 16px; z-index: 56; display: flex; align-items: center; gap: 8px; padding: 6px; transform: translateX(-50%); border-radius: 999px; background: rgba(32, 28, 46, .82); backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0, 0, 0, .4), inset 0 0 0 1px rgba(255, 255, 255, .12); color: #fff; }
.dk-btn { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .12); color: #fff; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; transition: transform .15s, background .15s; }
.dk-btn:disabled { opacity: .35; cursor: default; transform: none; }
.dk-btn:hover:not(:disabled) { transform: scale(1.1); background: rgba(255, 255, 255, .24); }
.rd-close { position: fixed; top: 14px; right: 14px; z-index: 56; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(32, 28, 46, .82); backdrop-filter: blur(12px); box-shadow: 0 6px 20px rgba(0, 0, 0, .4), inset 0 0 0 1px rgba(255, 255, 255, .12); color: #fff; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; transition: transform .15s, background .15s; }
.rd-close:hover { transform: scale(1.1); background: rgba(255, 143, 192, .55); }
.dk-toc.on { background: rgba(255, 255, 255, .28); }
.toc { position: fixed; left: 12px; top: 50%; z-index: 56; display: flex; flex-direction: column; gap: 4px; max-height: 70vh; padding: 8px 6px; overflow-y: auto; transform: translateY(-50%); border-radius: 18px; background: rgba(32, 28, 46, .82); backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0, 0, 0, .4), inset 0 0 0 1px rgba(255, 255, 255, .12); scrollbar-width: none; }
.toc::-webkit-scrollbar { display: none; }
.toc-i { min-width: 38px; padding: 6px 4px; border: 0; border-radius: 10px; background: transparent; color: rgba(255, 255, 255, .55); font: inherit; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; transition: background .15s, color .15s; }
.toc-i:hover { background: rgba(255, 255, 255, .14); color: #fff; }
.toc-i.done { color: #ff8fc0; }
.toc-i.on { background: linear-gradient(135deg, #ff8fc0, #9a8cff); color: #fff; }
@media (max-width: 1099px) { .toc { left: 8px; top: auto; bottom: 70px; max-height: 50vh; transform: none; } }
.dk-read.on { background: linear-gradient(135deg, #ff8fc0, #9a8cff); box-shadow: 0 0 14px rgba(255, 143, 192, .6); }
.dk-mid { position: relative; display: flex; align-items: baseline; gap: 8px; min-width: 104px; padding: 4px 12px 8px; overflow: hidden; border-radius: 999px; font-variant-numeric: tabular-nums; }
.dk-ch { font-size: 11.5px; opacity: .65; }
.dk-cnt { font-size: 15px; }
.dk-cnt small { font-size: 11.5px; font-weight: 500; opacity: .65; }
.dk-fill { position: absolute; left: 0; bottom: 0; height: 3px; border-radius: 3px; background: linear-gradient(90deg, #ff8fc0, #9a8cff); transition: width .25s; }
.strip { max-width: 800px; margin: 0 auto; background: #222; }
.strip img { display: block; width: 100%; height: auto; }
.end { max-width: 800px; margin: 0 auto; padding: 28px 16px 96px; text-align: center; color: #fff; }
.end p { margin: 0 0 14px; opacity: .7; }
.end-row { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.crop-back { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 16px; background: rgba(20, 16, 32, .6); backdrop-filter: blur(4px); }
.crop { display: flex; flex-direction: column; gap: 12px; width: min(360px, 100%); max-height: 100%; overflow-y: auto; padding: 18px; border-radius: 22px; background: #fff; color: #2b2438; box-shadow: 0 20px 60px rgba(0, 0, 0, .35); }
.crop h3 { margin: 0; font-size: 18px; }
.crop-view { align-self: center; width: 210px; max-width: 100%; aspect-ratio: 3 / 4; border-radius: 14px; background: var(--line); box-shadow: 0 6px 18px rgba(0, 0, 0, .2); }
.crop-row { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #6a6580; }
.crop-row input { width: 100%; accent-color: var(--gold); }
.crop-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.crop-actions button:disabled { opacity: .6; cursor: default; }
.crop-actions .ghost { background: #fff; color: #2b2438; border-color: #d9d3e6; }
</style>
