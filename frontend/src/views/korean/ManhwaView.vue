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
type Status = 'reading' | 'done' | 'want'
interface Mark { c: number; p: number; note: string }
interface State { read: number[]; pos: Record<string, number>; at?: number; status?: Status; seen?: number; marks?: Mark[] }

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

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.value))
  } catch {
    /* хранилище недоступно */
  }
}
/** Прогресс живёт и в браузере (быстро, без сети), и на сервере (одинаков на всех устройствах): при каждом изменении ждём секунду и отправляем состояние манхвы. */
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()
async function push(s: string) {
  pushTimers.delete(s)
  const st = store.value[s]
  if (!st) return
  try {
    const res = await fetchT(`/api/manhwa/_state/${encodeURIComponent(s)}`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: st.read, pos: st.pos, at: st.at ?? 0, status: st.status, seen: st.seen, marks: st.marks ?? [] }),
    }, 20_000)
    if (!res.ok) return
    const server = (await res.json()) as State
    // на сервере оказалось свежее (читали на другом устройстве): берём его
    if ((server.at ?? 0) > (st.at ?? 0)) {
      store.value = { ...store.value, [s]: server }
      saveLocal()
    }
  } catch {
    /* нет сети: состояние осталось в браузере, уйдёт при следующем изменении */
  }
}
function schedulePush(s: string) {
  if (!s) return
  clearTimeout(pushTimers.get(s))
  pushTimers.set(s, setTimeout(() => void push(s), 1000))
}
/** сразу отправить всё, что ждёт (вкладку закрывают или прячут) */
function flushPush() {
  for (const s of [...pushTimers.keys()]) {
    clearTimeout(pushTimers.get(s))
    void push(s)
  }
}
/** при открытии страницы: берём с сервера то, что свежее, а что свежее у нас, отправляем */
async function syncFromServer() {
  try {
    const res = await fetchT('/api/manhwa/_state', { headers: headers() }, 20_000)
    if (!res.ok) return
    const remote = (await res.json()) as Record<string, State>
    const merged: Record<string, State> = { ...store.value }
    for (const [s, r] of Object.entries(remote)) {
      const l = merged[s]
      if (!l || (r.at ?? 0) > (l.at ?? 0)) merged[s] = { ...r, seen: r.seen ?? l?.seen }
    }
    store.value = merged
    // открытая сейчас манхва: список глав уже видели
    const open = merged[slug.value]
    if (open && chapters.value.length && open.seen !== chapters.value.length) open.seen = chapters.value.length
    saveLocal()
    for (const [s, l] of Object.entries(merged)) {
      const r = remote[s]
      if (!r || (l.at ?? 0) > (r.at ?? 0)) schedulePush(s)
    }
  } catch {
    /* нет сети или сервер недоступен: работаем с тем, что в браузере */
  }
}
function save() {
  saveLocal()
  schedulePush(slug.value)
}
/** запись состояния нужной манхвы (создаётся при первой отметке) */
function mut(): State {
  return (store.value[slug.value] ??= { read: [], pos: {} })
}

function toggleRead(n: number) {
  const st = mut()
  st.read = st.read.includes(n) ? st.read.filter(x => x !== n) : [...st.read, n].sort((a, b) => a - b)
  st.at = Date.now()
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
const filtered = computed(() => chapters.value.filter(c => (filter.value === 'all' ? true : filter.value === 'read' ? isRead(c.n) : !isRead(c.n))))
/** Список глав выводится рядами: сначала два ряда, дальше по кнопке «Загрузить ещё» (по два ряда). Колонок до 7, их число считается по ширине сетки. */
const ROWS_STEP = 2
const cols = ref(7)
const rows = ref(ROWS_STEP)
const gridEl = ref<HTMLElement | null>(null)
const shown = computed(() => filtered.value.slice(0, rows.value * cols.value))
const hasMore = computed(() => filtered.value.length > shown.value.length)
let gridObs: ResizeObserver | null = null
watch(gridEl, el => {
  gridObs?.disconnect()
  if (!el || typeof ResizeObserver === 'undefined') return
  gridObs = new ResizeObserver(() => {
    cols.value = Math.max(2, Math.min(7, Math.floor((el.clientWidth + 14) / (128 + 14))))
  })
  gridObs.observe(el)
})
watch(filter, () => (rows.value = ROWS_STEP))
watch(slug, () => (rows.value = ROWS_STEP))

/** сводка по карточке на полке: сколько прочитано и с какой главы продолжить (страницы глав на полке не грузятся) */
function summary(b: Book) {
  const st = stateOf(b.slug)
  const read = b.chapters.filter(n => st.read.includes(n)).length
  const started = b.chapters.find(n => !st.read.includes(n) && st.pos[n] !== undefined)
  const nextN = started ?? b.chapters.find(n => !st.read.includes(n))
  return { read, nextN, started: started !== undefined }
}

/** Статус манхвы: выбранный вручную, иначе по прочитанному («Закончено», если прочитано всё; «Читаю», если что-то начато) */
const STATUS_LABEL: Record<Status, string> = { reading: 'Читаю', done: 'Закончено', want: 'Хочу прочитать' }
function statusOf(b: Book): Status | undefined {
  const st = stateOf(b.slug)
  if (st.status) return st.status
  const s = summary(b)
  if (b.chapters.length && s.read === b.chapters.length) return 'done'
  if (s.read || s.started) return 'reading'
  return undefined
}
function setStatus(v: Status | undefined) {
  const st = mut()
  st.status = v
  st.at = Date.now()
  save()
}
/** новые главы: сколько глав добавилось с последнего открытия списка глав (у ни разу не открытой манхвы метки нет) */
function newChapters(b: Book) {
  const seen = stateOf(b.slug).seen
  return seen === undefined ? 0 : Math.max(0, b.chapters.length - seen)
}
/** закладки: страница главы с заметкой */
const marks = computed(() => [...(state.value.marks ?? [])].sort((a, b) => a.c - b.c || a.p - b.p))
const hasMark = computed(() => !!chapter.value && (state.value.marks ?? []).some(m => m.c === chapter.value!.n && m.p === current.value))
function toggleMark() {
  const c = chapter.value
  if (!c) return
  const st = mut()
  const list = st.marks ?? []
  const at = list.findIndex(m => m.c === c.n && m.p === current.value)
  st.marks = at >= 0 ? list.filter((_, i) => i !== at) : [...list, { c: c.n, p: current.value, note: '' }].slice(-200)
  st.at = Date.now()
  save()
}
function setNote(m: Mark, note: string) {
  const st = mut()
  const cur = (st.marks ?? []).find(x => x.c === m.c && x.p === m.p)
  if (!cur) return
  cur.note = note.slice(0, 300)
  st.at = Date.now()
  save()
}
function dropMark(m: Mark) {
  const st = mut()
  st.marks = (st.marks ?? []).filter(x => !(x.c === m.c && x.p === m.p))
  st.at = Date.now()
  save()
}
/** с какой страницы открыть главу (закладка); сбрасывается после входа */
let jump: number | null = null
function openMark(m: Mark) {
  jump = m.p
  openChapter(m.c)
}

/** Настройки вида (помнятся в браузере, читаются в onMounted): размытие обложек, порядок полки, две страницы в читалке */
const blurUnread = ref(true)
const shelfSort = ref<'recent' | 'title'>('recent')
const shelfQuery = ref('')
const two = ref(false)
const wide = ref(false)
function pref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* без хранилища */
  }
}
function setBlur(v: boolean) {
  blurUnread.value = v
  pref('manhwa_blur', v ? '1' : '0')
}
function setSort(v: 'recent' | 'title') {
  shelfSort.value = v
  pref('manhwa_sort', v)
}
function setTwo() {
  const keep = current.value
  two.value = !two.value
  pref('manhwa_two', two.value ? '1' : '0')
  void nextTick(() => pageEls.value[keep]?.scrollIntoView({ block: 'start' }))
}
const twoOn = computed(() => two.value && wide.value)

/** полка: поиск по названию и порядок («Недавние» по времени последнего чтения, потом по названию) */
const shelfStatus = ref<'all' | Status>('all')
const shelfBooks = computed(() => {
  const q = shelfQuery.value.trim().toLowerCase()
  const list = books.value.filter(b => (!q || b.title.toLowerCase().includes(q)) && (shelfStatus.value === 'all' || statusOf(b) === shelfStatus.value))
  const byTitle = (a: Book, b: Book) => a.title.localeCompare(b.title, 'ru')
  return [...list].sort(shelfSort.value === 'title' ? byTitle : (a, b) => (stateOf(b.slug).at ?? 0) - (stateOf(a.slug).at ?? 0) || byTitle(a, b))
})
/** строка «Продолжить» над полкой: манхва, которую читали последней и ещё не дочитали */
const continueBook = computed(() =>
  [...books.value]
    .filter(b => (stateOf(b.slug).at ?? 0) > 0 && summary(b).nextN !== undefined)
    .sort((a, b) => (stateOf(b.slug).at ?? 0) - (stateOf(a.slug).at ?? 0))[0],
)

function openBook(s: string) {
  void router.push({ query: { b: s } })
}
function openAt(s: string, n: number) {
  void router.push({ query: { b: s, c: String(n) } })
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
    if (s === slug.value) {
      chapters.value = data.chapters
      // список глав открыт: запоминаем, сколько глав видели (метка «новые главы» на полке)
      const st = store.value[s]
      if (st && st.seen !== data.chapters.length) {
        st.seen = data.chapters.length
        save()
      } else if (!st) {
        store.value = { ...store.value, [s]: { read: [], pos: {}, at: 0, seen: data.chapters.length } }
        save()
      }
    }
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
/** ширина ленты: выбранная ступень, в режиме двух страниц вдвое шире (но не шире окна) */
const stripWidth = computed(() => (twoOn.value ? `min(${ZOOMS[zoom.value]! * 2}px, 100vw)` : `${ZOOMS[zoom.value]}px`))
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
  const st = mut()
  st.pos[c.n] = k
  st.at = Date.now()
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
  const p = jump ?? state.value.pos[c.n]
  const forced = jump !== null
  jump = null
  if (p && (forced || !isRead(c.n)) && pageEls.value[p]) pageEls.value[p]!.scrollIntoView({ block: 'start' })
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
  wide.value = window.innerWidth >= 1100
  blurUnread.value = localStorage.getItem('manhwa_blur') !== '0'
  shelfSort.value = localStorage.getItem('manhwa_sort') === 'title' ? 'title' : 'recent'
  two.value = localStorage.getItem('manhwa_two') === '1'
  const zs = localStorage.getItem('manhwa_zoom') // без записи остаётся обычная ширина (Number(null) дал бы 0, самую узкую)
  const z = zs === null ? NaN : Number(zs)
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
  window.addEventListener('visibilitychange', onVisible)
  if (slug.value) {
    await loadBook(slug.value)
    if (chapter.value) await enter()
  }
  await syncFromServer()
})
function onVisible() {
  if (document.visibilityState === 'hidden') flushPush()
}
/**
 * Клавиши читалки: Esc выход к главам; пробел (с Shift вверх) листает почти на экран, стрелки вверх и вниз на две пятых экрана;
 * стрелка вправо и J следующая глава, стрелка влево и K предыдущая (на русской раскладке О и Л). В полях ввода и с Ctrl, Cmd, Alt не срабатывает.
 */
function onKey(e: KeyboardEvent) {
  if (!chapter.value || crop.value || e.defaultPrevented) return
  if (e.key === 'Escape') return closeChapter()
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target as HTMLElement | null
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
  const sc = scroller.value
  const by = (k: number) => sc?.scrollBy({ top: k * sc.clientHeight, behavior: 'smooth' })
  const key = e.key
  if (key === ' ') by(e.shiftKey ? -0.85 : 0.85)
  else if (key === 'ArrowDown') by(0.4)
  else if (key === 'ArrowUp') by(-0.4)
  else if (key === 'ArrowRight' || key === 'j' || key === 'J' || key === 'о' || key === 'О') {
    if (next.value) openChapter(next.value.n)
  } else if (key === 'ArrowLeft' || key === 'k' || key === 'K' || key === 'л' || key === 'Л') {
    if (prev.value) openChapter(prev.value.n)
  } else return
  e.preventDefault()
  if (t && t.tagName === 'BUTTON') t.blur() // иначе следующий пробел «нажмёт» кнопку, на которой остался фокус
}
const onResize = () => (wide.value = window.innerWidth >= 1100)
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  gridObs?.disconnect()
  flushPush()
  window.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div v-if="!slug" class="wrap mh">
    <SectionHead id="manhwa" sub="выбери манхву: внутри главы, отметки «прочитано» и продолжение с того места, где остановился" />
    <p v-if="!loaded" class="note">Загружаю…</p>
    <p v-else-if="failed" class="note">Манхвы пока нет: на Яндекс.Диске нет папки <code>korean_manhwa</code> с манхвой внутри (или сервер её не видит). Положи туда главы: <code>node scripts/manhwa-import.mjs &lt;папка&gt; love-quest "Love Quest"</code>, потом <code>node scripts/manhwa-upload.mjs love-quest</code>.</p>
    <template v-else>
    <button v-if="continueBook" class="cont" @click="openAt(continueBook.slug, summary(continueBook).nextN!)">
      <span class="cont-cover" :class="{ blur: blurUnread && !continueBook.ownCover }"><img v-if="continueBook.cover" :src="continueBook.cover" :alt="continueBook.title" decoding="async" /></span>
      <span class="cont-text">
        <small>Продолжить</small>
        <b>{{ continueBook.title }}</b>
        <span>глава {{ summary(continueBook).nextN }}<template v-if="stateOf(continueBook.slug).pos[summary(continueBook).nextN!] !== undefined"> · страница {{ stateOf(continueBook.slug).pos[summary(continueBook).nextN!]! + 1 }}</template></span>
      </span>
      <span class="cont-go">Открыть →</span>
    </button>
    <div class="tools">
      <input v-model="shelfQuery" class="search" type="search" placeholder="Поиск по названию" aria-label="Поиск по названию" />
      <div class="seg" role="group" aria-label="Порядок">
        <button :class="{ on: shelfSort === 'recent' }" @click="setSort('recent')">Недавние</button>
        <button :class="{ on: shelfSort === 'title' }" @click="setSort('title')">По названию</button>
      </div>
      <div class="seg" role="group" aria-label="Статус">
        <button v-for="f in [['all', 'Все'], ['reading', 'Читаю'], ['want', 'Хочу'], ['done', 'Закончено']] as const" :key="f[0]" :class="{ on: shelfStatus === f[0] }" @click="shelfStatus = f[0]">{{ f[1] }}</button>
      </div>
      <button class="ghost" :class="{ on: blurUnread }" :aria-pressed="blurUnread" @click="setBlur(!blurUnread)">Размывать непрочитанное</button>
    </div>
    <ul class="shelf">
      <li v-for="b in shelfBooks" :key="b.slug">
        <a class="book" :href="`/korean/manhwa?b=${b.slug}`" @click.prevent="openBook(b.slug)">
          <span class="book-cover" :class="{ blur: blurUnread && !b.ownCover }"><img v-if="b.cover" :src="b.cover" :alt="b.title" loading="lazy" decoding="async" /></span>
          <span class="book-cap">
            <b>{{ b.title }}</b>
            <span v-if="statusOf(b) || newChapters(b)" class="chips">
              <span v-if="statusOf(b)" class="chip" :class="`st-${statusOf(b)}`">{{ STATUS_LABEL[statusOf(b)!] }}</span>
              <span v-if="newChapters(b)" class="chip st-new">+{{ newChapters(b) }} новых</span>
            </span>
            <small>{{ b.chapters.length }} глав · прочитано {{ summary(b).read }}</small>
            <span class="bar"><i :style="{ width: (b.chapters.length ? (summary(b).read / b.chapters.length) * 100 : 0) + '%' }"></i></span>
            <em v-if="summary(b).nextN !== undefined">{{ summary(b).started ? 'Продолжить' : 'Начать' }} · глава {{ summary(b).nextN }}</em>
            <em v-else>Всё прочитано</em>
          </span>
        </a>
      </li>
    </ul>
    <p v-if="!shelfBooks.length" class="note">Ничего не найдено.</p>
    </template>
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
          <img v-if="book?.cover" :class="{ blur: blurUnread && !book.ownCover }" :src="book.cover" :alt="title" />
          <span class="hero-up">Сменить обложку</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" @change="pickCover" />
        </label>
        <div class="hero-text">
          <h2>{{ title }}</h2>
          <p>{{ total }} глав · прочитано {{ readCount }}</p>
          <div class="bar big"><i :style="{ width: (total ? (readCount / total) * 100 : 0) + '%' }"></i></div>
          <div class="seg status-pick" role="group" aria-label="Статус манхвы">
            <button v-for="f in ([['reading', 'Читаю'], ['want', 'Хочу прочитать'], ['done', 'Закончено']] as const)" :key="f[0]" :class="{ on: state.status === f[0] }" @click="setStatus(state.status === f[0] ? undefined : f[0])">{{ f[1] }}</button>
          </div>
        </div>
        <button v-if="resume" class="go" @click="openChapter(resume.n)">
          {{ state.pos[resume.n] !== undefined ? 'Продолжить' : 'Начать' }} · глава {{ resume.n }}
        </button>
      </div>
      <details v-if="marks.length" class="marks">
        <summary>Закладки · {{ marks.length }}</summary>
        <ul>
          <li v-for="m in marks" :key="m.c + '-' + m.p">
            <button class="mk-go" @click="openMark(m)">Глава {{ m.c }} · стр. {{ m.p + 1 }}</button>
            <input class="mk-note" :value="m.note" maxlength="300" placeholder="Заметка" aria-label="Заметка к закладке" @change="setNote(m, ($event.target as HTMLInputElement).value)" />
            <button class="mk-del" title="Удалить закладку" aria-label="Удалить закладку" @click="dropMark(m)">✕</button>
          </li>
        </ul>
      </details>
      <div class="filters">
        <button v-for="f in [['all', 'Все'], ['todo', 'Не прочитано'], ['read', 'Прочитано']] as const" :key="f[0]" :class="{ on: filter === f[0] }" @click="filter = f[0]">{{ f[1] }}</button>
        <button class="blur-sw" :class="{ on: blurUnread }" :aria-pressed="blurUnread" title="Скрывать картинки глав, которые ещё не прочитаны" @click="setBlur(!blurUnread)">Размывать непрочитанное</button>
      </div>
      <ul ref="gridEl" class="grid" :style="{ '--cols': cols }">
        <li v-for="c in shown" :key="c.n">
          <a class="card" :class="{ done: isRead(c.n), blur: blurUnread && !isRead(c.n) }" :href="`/korean/manhwa?b=${slug}&c=${c.n}`" @click.prevent="openChapter(c.n)">
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
      <div v-if="hasMore" class="more">
        <button class="ghost" @click="rows += ROWS_STEP">Загрузить ещё · осталось {{ filtered.length - shown.length }}</button>
      </div>
    </template>
  </div>

  <Teleport v-else-if="chapter" to="body">
    <div ref="scroller" class="reader" @scroll.passive="onScroll">
      <div class="strip" :class="{ two: twoOn }" :style="{ maxWidth: stripWidth }">
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
      <div class="end" :style="{ maxWidth: stripWidth }">
        <p>Конец главы {{ chapter.n }}</p>
        <button v-if="next" class="next-big" @click="openChapter(next.n)">Следующая глава · {{ next.n }} →</button>
        <p v-else class="last">Это последняя глава</p>
        <div class="end-row">
          <button v-if="prev" class="ghost" @click="openChapter(prev.n)">← Глава {{ prev.n }}</button>
          <button class="ghost" @click="closeChapter">Все главы</button>
        </div>
        <p class="hint">Пробел и стрелки листают, J и K (или стрелки вправо и влево) переключают главы, Esc выходит к главам</p>
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
 <button class="dk-btn dk-mark" :class="{ on: hasMark }" :title="hasMark ? 'Убрать закладку с этой страницы' : 'Поставить закладку на этой странице'" @click="toggleMark">⚑</button>
      <button class="dk-btn dk-toc" :class="{ on: tocOpen }" title="Список глав" @click="tocOpen = !tocOpen">☰</button>
      <div class="dk-mid" role="progressbar" :aria-valuenow="current + 1" :aria-valuemax="chapter.pages.length">
        <span class="dk-ch">гл. {{ chapter.n }}</span>
        <b class="dk-cnt">{{ current + 1 }}<small> / {{ chapter.pages.length }}</small></b>
        <i class="dk-fill" :style="{ width: ((current + 1) / chapter.pages.length) * 100 + '%' }"></i>
      </div>
      <button class="dk-btn" title="Отдалить" :disabled="zoom === 0" @click="setZoom(-1)">−</button>
      <button class="dk-btn" title="Приблизить" :disabled="zoom === ZOOMS.length - 1" @click="setZoom(1)">+</button>
      <button v-if="wide" class="dk-btn dk-two" :class="{ on: two }" :aria-pressed="two" title="Две страницы рядом" @click="setTwo"><span class="two-ico"><i></i><i></i></span></button>
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
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 2px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 700; background: color-mix(in srgb, var(--gold) 16%, #fff); color: var(--gold); }
.chip.st-done { background: color-mix(in srgb, var(--ok) 16%, #fff); color: var(--ok); }
.chip.st-want { background: #eef0ff; color: #6a6adf; }
.chip.st-new { background: linear-gradient(135deg, #ff8fc0, #9a8cff); color: #fff; }
.status-pick { margin-top: 10px; }
.marks { margin: 14px 0; padding: 10px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.marks summary { cursor: pointer; font-weight: 700; }
.marks ul { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 4px; padding: 0; list-style: none; }
.marks li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mk-go { padding: 6px 12px; border: 1px solid var(--line); border-radius: 99px; background: var(--surface); color: inherit; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.mk-go:hover { border-color: var(--gold); }
.mk-note { flex: 1 1 200px; min-width: 0; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: inherit; font: inherit; font-size: 13.5px; }
.mk-del { width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.mk-del:hover { background: var(--line); }
.more { display: flex; justify-content: center; margin-top: 18px; }
.blur-sw { margin-left: auto; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: inherit; font: inherit; font-size: 13.5px; cursor: pointer; transition: border-color .15s; }
.blur-sw:hover { border-color: var(--gold); }
.blur-sw.on { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 16%, var(--surface)); }
.hero-cover img.blur { filter: blur(8px); transform: scale(1.18); }
.book-cover.blur img { filter: blur(11px) saturate(.9); transform: scale(1.18); }
.tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 16px 0 0; }
.search { flex: 1 1 200px; min-width: 0; padding: 8px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: inherit; font: inherit; font-size: 14px; outline: none; }
.search:focus { border-color: var(--gold); }
.seg { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); }
.seg button { padding: 5px 12px; border: 0; border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.seg button.on { background: color-mix(in srgb, var(--gold) 22%, var(--surface)); font-weight: 700; }
.cont { display: flex; align-items: center; gap: 16px; width: 100%; margin: 16px 0 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 14%, var(--surface)), var(--surface)); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s; }
.cont:hover { transform: translateY(-2px); border-color: var(--gold); }
.cont-cover { flex: none; width: 54px; height: 72px; overflow: hidden; border-radius: 10px; background: var(--line); box-shadow: 0 3px 10px rgba(0, 0, 0, .18); }
.cont-cover img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.cont-cover.blur img { filter: blur(6px); transform: scale(1.2); }
.cont-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.cont-text small { color: var(--gold); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.cont-text b { overflow: hidden; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
.cont-text span { color: var(--muted); font-size: 13.5px; }
.cont-go { flex: none; padding: 9px 18px; border-radius: 999px; background: var(--gold); color: #fff; font-size: 14px; font-weight: 700; }
.grid { display: grid; grid-template-columns: repeat(var(--cols, 7), minmax(0, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.card { position: relative; display: flex; flex-direction: column; height: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.card:hover { transform: translateY(-3px); border-color: var(--gold); }
.card.done { border-color: var(--ok); }
.cover { display: block; aspect-ratio: 3 / 4; overflow: hidden; background: var(--line); }
.cover img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.card.done .cover img { opacity: .55; }
/* обложки непрочитанных глав размыты, чтобы не спойлерили; прочитанные видны */
.card.blur .cover img { filter: blur(11px) saturate(.9); transform: scale(1.18); }
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
.dk-mark.on { background: linear-gradient(135deg, #ffd27a, #ff8fc0); box-shadow: 0 0 14px rgba(255, 190, 120, .6); }
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
.strip.two { display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
.strip img { display: block; width: 100%; height: auto; }
.end { max-width: 800px; margin: 0 auto; padding: 28px 16px 96px; text-align: center; color: #fff; }
.end p { margin: 0 0 14px; opacity: .7; }
.end .last { font-size: 17px; font-weight: 700; opacity: .9; }
.end .hint { margin: 18px 0 0; font-size: 12.5px; opacity: .45; }
.end .ghost { border-color: rgba(255, 255, 255, .25); background: rgba(255, 255, 255, .1); color: #fff; }
.end .ghost:hover { border-color: #ff8fc0; }
.next-big { display: block; margin: 4px auto 16px; padding: 17px 40px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ff8fc0, #9a8cff); color: #fff; font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; box-shadow: 0 10px 30px rgba(154, 140, 255, .45); transition: transform .15s, box-shadow .15s; }
.next-big:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(255, 143, 192, .55); }
.dk-two.on { background: rgba(255, 255, 255, .28); }
.two-ico { display: flex; gap: 3px; }
.two-ico i { display: block; width: 7px; height: 14px; border: 1.8px solid currentColor; border-radius: 2px; }
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
