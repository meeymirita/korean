<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import getStroke from 'perfect-freehand'
import AuthGate from '@/components/AuthGate.vue'
import catSleep from '@/assets/game/cat-sleep.webp'
import { askConfirm } from '@/composables/useConfirm'
import { usePersisted } from '@/composables/usePersisted'
import { errText } from '@/lib/http'
import { MAX_NB_NAME, packStrokes, useNotebookStore } from '@/stores/notebook'
import type { NbItem, NbSheet, Stroke, Tpl } from '@/stores/notebook'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Значки «Тетради» (src/assets/notebook/ic-<имя>.webp). */
const ICONS = import.meta.glob('../assets/notebook/ic-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const ic = (name: string) => ICONS[`../assets/notebook/ic-${name}.webp`] ?? ''

const progress = useProgressStore()
const nb = useNotebookStore()
const toast = useToastStore()

/** Больше места для рисунка: «Во весь экран» прячет шапку и меню (пока открыт лист), панель страниц включается кнопкой. */
const focus = usePersisted('nb_focus', false, v => typeof v === 'boolean')
const showPages = usePersisted('nb_pages', false, v => typeof v === 'boolean')
const full = computed(() => focus.value && !!sheet.value)

const cur = ref<string | null>(null) // папка, куда создаются новые листы и папки
const sheet = ref<NbSheet | null>(null) // открытый лист
const nav = ref<'notebooks' | 'all' | 'recent' | 'fav'>('notebooks')
const q = ref('')
const expanded = ref(new Set<string>())

/* ---------- список слева ---------- */
interface Row { id: string; kind: 'folder' | 'sheet'; name: string; depth: number; count?: number; note: string; open?: boolean }
const DAY = 86400000
function fmtDate(t: number) {
  const d = new Date(t), n = new Date()
  const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY)
  if (diff <= 0) return 'Сегодня'
  if (diff === 1) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const byName = (a: NbItem, b: NbItem) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ru') : a.kind === 'folder' ? -1 : 1)
const childCount = (id: string) => nb.items.filter(i => i.parent === id).length
const sheets = computed(() => nb.items.filter(i => i.kind === 'sheet'))
const rows = computed<Row[]>(() => {
  const term = q.value.trim().toLowerCase()
  const flat = (list: NbItem[]): Row[] => list.map(i => ({ id: i.id, kind: i.kind, name: i.name, depth: 0, note: i.kind === 'sheet' ? fmtDate(i.updated) : String(childCount(i.id)) }))
  if (term) return flat(nb.items.filter(i => i.name.toLowerCase().includes(term)).sort(byName))
  if (nav.value === 'all') return flat([...sheets.value].sort(byName))
  if (nav.value === 'recent') return flat([...sheets.value].sort((a, b) => b.updated - a.updated).slice(0, 30))
  if (nav.value === 'fav') return flat(nb.items.filter(i => i.fav).sort(byName))
  const out: Row[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const i of nb.items.filter(x => x.parent === parent).sort(byName)) {
      const open = expanded.value.has(i.id)
      out.push({ id: i.id, kind: i.kind, name: i.name, depth, count: i.kind === 'folder' ? childCount(i.id) : undefined, note: i.kind === 'sheet' ? fmtDate(i.updated) : '', open })
      if (i.kind === 'folder' && open) walk(i.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})
const counts = computed(() => ({ all: sheets.value.length, notebooks: nb.items.filter(i => i.kind === 'folder' && !i.parent).length, fav: nb.items.filter(i => i.fav).length }))
const listTitle = computed(() => (q.value.trim() ? 'Поиск' : { notebooks: 'Тетради', all: 'Все файлы', recent: 'Недавние', fav: 'Избранное' }[nav.value]))
const folders = computed(() => nb.items.filter(i => i.kind === 'folder'))
/** Путь папок листа: «Корейский язык › Практика». */
const crumbs = computed(() => {
  const out: NbItem[] = []
  let id = sheet.value?.parent ?? null
  for (let n = 0; id && n < 50; n++) {
    const f = nb.items.find(i => i.id === id)
    if (!f) break
    out.unshift(f)
    id = f.parent
  }
  return out
})
const favNow = computed(() => nb.items.find(i => i.id === sheet.value?.id)?.fav === 1)

async function boot() {
  try { await nb.load() } catch (e) { toast.error(`Тетрадь не загрузилась: ${errText(e)}`) }
}
onMounted(() => { if (progress.unlocked) boot() })
watch(() => progress.unlocked, u => { if (u && !nb.loaded) boot() })

function clickRow(r: Row) {
  if (justDragged) return
  if (r.kind === 'folder') {
    cur.value = r.id
    if (nav.value === 'notebooks' && !q.value.trim()) {
      const e = new Set(expanded.value)
      e.has(r.id) ? e.delete(r.id) : e.add(r.id)
      expanded.value = e
    }
  } else openSheet(r.id)
}
/** Раскрыт ли блок с тетрадями в боковом меню: нажатие на уже выбранный пункт сворачивает его и отдаёт место листу. */
const listOpen = ref(true)
function pickNav(n: typeof nav.value) {
  if (nav.value === n && listOpen.value && !q.value) { listOpen.value = false; return }
  nav.value = n
  q.value = ''
  listOpen.value = true
}
watch(q, v => { if (v.trim()) listOpen.value = true })

/* ---------- меню и окна ---------- */
const menu = ref<'' | 'create' | 'export' | 'more'>('')
const toggleMenu = (m: typeof menu.value) => (menu.value = menu.value === m ? '' : m)
const closeMenu = () => (menu.value = '')
const nameDlg = ref<{ title: string; value: string; ok: string; run: (v: string) => Promise<void> } | null>(null)
const nameBusy = ref(false)
function askName(title: string, value: string, ok: string, run: (v: string) => Promise<void>) {
  closeMenu()
  nameDlg.value = { title, value, ok, run }
}
async function submitName() {
  const d = nameDlg.value
  const v = d?.value.trim()
  if (!d || !v || nameBusy.value) return
  nameBusy.value = true
  try { await d.run(v); nameDlg.value = null } catch (e) { toast.error(errText(e)) } finally { nameBusy.value = false }
}
const addFolder = () => askName('Новая папка', '', 'Создать', async v => {
  const f = await nb.create('folder', v, cur.value)
  if (cur.value) expanded.value = new Set(expanded.value).add(cur.value)
  cur.value = f.id
})
const renameItem = (it: { id: string; name: string }) => askName('Переименовать', it.name, 'Сохранить', v => nb.update(it.id, { name: v }))

async function removeItem(id: string, name: string, kind: 'folder' | 'sheet') {
  closeMenu()
  const ok = await askConfirm({ title: `Удалить «${name}»?`, text: kind === 'folder' ? 'Папка удалится вместе со всеми листами и папками внутри.' : 'Лист удалится насовсем.', ok: 'Удалить', danger: true })
  if (!ok) return
  try {
    if (sheet.value?.id === id) { await flush(); sheet.value = null }
    await nb.remove(id)
    if (cur.value === id) cur.value = null
    toast.ok('Удалено')
  } catch (e) { toast.error(errText(e)) }
}

const picking = ref(false)
function startSheet() { closeMenu(); picking.value = true }
async function addSheet(tpl: Tpl) {
  picking.value = false
  try {
    const it = await nb.create('sheet', 'Новый лист', cur.value, tpl)
    if (cur.value) expanded.value = new Set(expanded.value).add(cur.value)
    await show(it)
  } catch (e) { toast.error(`Лист не создался: ${errText(e)}`) }
}
async function openSheet(id: string) {
  await flush()
  try { await show(await nb.openSheet(id)) } catch (e) { toast.error(`Лист не открылся: ${errText(e)}`) }
}
async function show(it: NbSheet) {
  sheet.value = reactive(it) as NbSheet
  cur.value = it.parent
  undo.length = redo.length = 0
  strokesDirty = false
  dirty = false
  state.value = 'saved'
  savedAt.value = Date.now()
  zoom.value = 100
  textOpen.value = !!it.text
  await nextTick()
  paint()
  thumb()
}
async function closeSheet() { await flush(); sheet.value = null }

/* ---------- автосохранение листа ---------- */
const state = ref<'saved' | 'saving' | 'error'>('saved')
const savedAt = ref(Date.now())
const now = ref(Date.now())
const savedText = computed(() => {
  if (state.value === 'saving') return 'Сохраняю…'
  if (state.value === 'error') return 'Не сохранилось'
  const m = Math.floor((now.value - savedAt.value) / 60000)
  return m < 1 ? 'Сохранено только что' : `Сохранено ${m} мин. назад`
})
let strokesDirty = false
let timer: ReturnType<typeof setTimeout> | undefined
let tick: ReturnType<typeof setInterval> | undefined
let dirty = false
function touch() { dirty = true; state.value = 'saving'; clearTimeout(timer); timer = setTimeout(flush, 700) }
async function flush() {
  clearTimeout(timer)
  const sh = sheet.value
  if (!sh || !dirty) return
  dirty = false
  const sendStrokes = strokesDirty
  strokesDirty = false
  state.value = 'saving'
  try {
    await nb.update(sh.id, { name: sh.name.trim() || 'Без названия', parent: sh.parent, tpl: sh.tpl, text: sh.text, ...(sendStrokes ? { strokes: packStrokes(sh.strokes) } : {}) })
    if (!dirty) { state.value = 'saved'; savedAt.value = Date.now() }
  } catch (e) {
    dirty = true
    strokesDirty ||= sendStrokes
    state.value = 'error'
    toast.error(`Не сохранилось: ${errText(e)}`)
  }
}
async function saveNow() {
  dirty = dirty || state.value === 'error'
  await flush()
  if (state.value === 'saved') toast.ok('Сохранено')
}
watch(() => sheet.value && [sheet.value.name, sheet.value.text, sheet.value.tpl, sheet.value.parent], (v, old) => { if (v && old && sheet.value?.id) touch() })
async function toggleFav() {
  if (!sheet.value) return
  try { await nb.update(sheet.value.id, { fav: !favNow.value }) } catch (e) { toast.error(errText(e)) }
}

/* ---------- перетаскивание: мышью, пальцем (после удержания) и пером ---------- */
const drag = reactive({ id: '', x: 0, y: 0, label: '' })
const over = ref<string | null>(null)
let pend: { it: { id: string; name: string; kind: string }; sx: number; sy: number; touch: boolean; timer?: ReturnType<typeof setTimeout> } | null = null
let justDragged = false

function rowDown(e: PointerEvent, r: Row) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
  pend = { it: r, sx: e.clientX, sy: e.clientY, touch: e.pointerType !== 'mouse' }
  if (pend.touch) pend.timer = setTimeout(() => { if (pend) begin(e.clientX, e.clientY) }, 320)
}
function begin(x: number, y: number) {
  if (!pend) return
  clearTimeout(pend.timer)
  Object.assign(drag, { id: pend.it.id, x, y, label: pend.it.name })
  navigator.vibrate?.(15)
}
function dragMove(e: PointerEvent) {
  if (!pend) return
  if (!drag.id) {
    const far = Math.hypot(e.clientX - pend.sx, e.clientY - pend.sy) > (pend.touch ? 10 : 6)
    if (!far) return
    if (pend.touch) { clearTimeout(pend.timer); pend = null; return } // палец поехал до удержания: это прокрутка
    begin(e.clientX, e.clientY)
  }
  drag.x = e.clientX
  drag.y = e.clientY
  const t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
  over.value = t && canDrop(t) ? t : null
}
function canDrop(target: string) {
  const it = nb.items.find(i => i.id === drag.id)
  if (!it) return false
  const parent = target === 'root' ? null : target
  if (it.parent === parent) return false
  return !(it.kind === 'folder' && parent && nb.isInside(parent, it.id))
}
async function dragEnd() {
  if (pend) clearTimeout(pend.timer)
  const id = drag.id
  const target = over.value
  pend = null
  drag.id = ''
  over.value = null
  if (!id) return
  justDragged = true
  setTimeout(() => (justDragged = false), 60)
  if (!target) return
  try {
    await nb.update(id, { parent: target === 'root' ? null : target })
    if (target !== 'root') expanded.value = new Set(expanded.value).add(target)
    if (sheet.value?.id === id) sheet.value.parent = target === 'root' ? null : target
  } catch (e) { toast.error(errText(e)) }
}
/** Пока карточка в руке, страница под пальцем не прокручивается. */
function stopScroll(e: TouchEvent) { if (drag.id) e.preventDefault() }
function outside(e: MouseEvent) { if (menu.value && !(e.target as HTMLElement).closest('.nb-menu-wrap')) closeMenu() }
onMounted(() => {
  window.addEventListener('pointermove', dragMove)
  window.addEventListener('pointerup', dragEnd)
  window.addEventListener('pointercancel', dragEnd)
  window.addEventListener('touchmove', stopScroll, { passive: false })
  window.addEventListener('click', outside)
  tick = setInterval(() => (now.value = Date.now()), 30000)
})
onBeforeUnmount(() => {
  flush()
  clearInterval(tick)
  window.removeEventListener('pointermove', dragMove)
  window.removeEventListener('pointerup', dragEnd)
  window.removeEventListener('pointercancel', dragEnd)
  window.removeEventListener('touchmove', stopScroll)
  window.removeEventListener('click', outside)
})

/* ---------- холст: лист A4 (210 × 297) ---------- */
const W = 840, H = 1188
const cv = ref<HTMLCanvasElement>()
const th = ref<HTMLCanvasElement>()
const tool = ref<'pen' | 'eraser'>('pen')
const COLORS = ['#1f1b2e', '#a97ae6', '#f9a5cd', '#6aa3f0', '#6fe0cc']
const color = ref(COLORS[0]!)
const size = ref(2)
const SIZES = [2, 4, 6, 10]
const zoom = ref(100)
const textOpen = ref(false)
let drawing: Stroke | null = null
let erasing = false
const undo: Stroke[][] = []
const redo: Stroke[][] = []

const TPLS: { id: Tpl; name: string }[] = [
  { id: 'blank', name: 'Чистый лист' },
  { id: 'grid', name: 'Клетка' },
  { id: 'lines', name: 'Линейка' },
  { id: 'dots', name: 'Точки' },
  { id: 'hangul', name: 'Пропись хангыля' },
]
function drawTpl(g: CanvasRenderingContext2D, t: Tpl) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H)
  g.strokeStyle = '#d3daf3'; g.fillStyle = '#d3daf3'; g.lineWidth = 1; g.setLineDash([])
  const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke() }
  if (t === 'grid') { for (let x = 0; x <= W; x += 28) line(x, 0, x, H); for (let y = 0; y <= H; y += 28) line(0, y, W, y) }
  if (t === 'lines') {
    for (let y = 84; y < H; y += 34) line(0, y, W, y)
    g.strokeStyle = '#f3a6cf'; g.lineWidth = 2; line(92, 0, 92, H)
  }
  if (t === 'dots') for (let x = 28; x < W; x += 28) for (let y = 28; y < H; y += 28) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill() }
  if (t === 'hangul') {
    const n = 96
    for (let x = 24; x + n <= W; x += n + 12) for (let y = 24; y + n <= H; y += n + 12) {
      g.setLineDash([]); g.strokeStyle = '#a9b6e6'; g.strokeRect(x, y, n, n)
      g.setLineDash([5, 5]); g.strokeStyle = '#d3daf3'; line(x + n / 2, y, x + n / 2, y + n); line(x, y + n / 2, x + n, y + n / 2)
    }
    g.setLineDash([])
  }
}
const thumbs = ref<Partial<Record<Tpl, string>>>({})
function makeThumbs() {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  for (const t of TPLS) { drawTpl(g, t.id); thumbs.value[t.id] = c.toDataURL('image/jpeg', 0.5) }
}

function pathOf(st: Stroke) {
  const pts = getStroke(st.p, { size: st.w, thinning: 0.5, smoothing: 0.6, streamline: 0.5 })
  const d = new Path2D()
  pts.forEach(([x, y], i) => (i ? d.lineTo(x!, y!) : d.moveTo(x!, y!)))
  d.closePath()
  return d
}
function paint() {
  const c = cv.value; const sh = sheet.value
  if (!c || !sh) return
  const g = c.getContext('2d')!
  drawTpl(g, sh.tpl)
  for (const st of [...sh.strokes, ...(drawing ? [drawing] : [])]) { g.fillStyle = st.c; g.fill(pathOf(st)) }
}
/** Маленькая копия листа в панели «Страницы». */
function thumb() {
  const t = th.value; const c = cv.value
  if (t && c) t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height)
}
function pos(e: PointerEvent): [number, number, number] {
  const r = cv.value!.getBoundingClientRect()
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, e.pressure || 0.5]
}
const changed = () => { strokesDirty = true; touch() }
function snapshot() { undo.push([...sheet.value!.strokes]); redo.length = 0 }
/** Ластик стирает штрихи целиком, до которых дотронулся: фон листа остаётся. */
function erase(x: number, y: number) {
  const sh = sheet.value!
  const r = size.value * 2 + 8
  const keep = sh.strokes.filter(st => !st.p.some(([px, py]) => Math.hypot(px - x, py - y) < r + st.w))
  if (keep.length !== sh.strokes.length) { sh.strokes = keep; changed(); paint() }
}
function down(e: PointerEvent) {
  if (!sheet.value) return
  cv.value!.setPointerCapture(e.pointerId)
  const p = pos(e)
  snapshot()
  if (tool.value === 'eraser') { erasing = true; erase(p[0], p[1]); return }
  drawing = { c: color.value, w: size.value + 1, p: [p] }
}
function move(e: PointerEvent) {
  if (erasing) { const p = pos(e); erase(p[0], p[1]); return }
  if (!drawing) return
  drawing.p.push(pos(e)); paint()
}
function up() {
  erasing = false
  if (drawing && sheet.value) { sheet.value.strokes.push(drawing); drawing = null; changed(); paint() }
  const top = undo[undo.length - 1]
  if (top && sheet.value && top.length === sheet.value.strokes.length && top.every((s, i) => s === sheet.value!.strokes[i])) undo.pop() // ничего не изменилось
  thumb()
}
function stepBack() { const prev = undo.pop(); if (prev && sheet.value) { redo.push([...sheet.value.strokes]); sheet.value.strokes = prev; changed(); paint(); thumb() } }
function stepForward() { const next = redo.pop(); if (next && sheet.value) { undo.push([...sheet.value.strokes]); sheet.value.strokes = next; changed(); paint(); thumb() } }
/** Картинка листа для экспорта: сам лист, котик в углу (как на экране) и внизу полоса с названием, путём и датой. */
async function exportCanvas(): Promise<HTMLCanvasElement> {
  const sh = sheet.value!
  const FOOT = 52
  const out = document.createElement('canvas')
  out.width = W
  out.height = H + FOOT
  const g = out.getContext('2d')!
  g.drawImage(cv.value!, 0, 0)
  // котик: та же картинка и обрезка, что в углу листа на экране (правая лапа соседнего рисунка срезается)
  try {
    const img = new Image()
    img.src = catSleep
    await img.decode()
    const sw = img.naturalWidth * 0.88
    const w = 150
    const h = (w / sw) * img.naturalHeight
    g.drawImage(img, 0, 0, sw, img.naturalHeight, W - w - 14, H - h - 8, w, h)
  } catch {
    /* без котика экспорт всё равно получится */
  }
  // нижняя полоса: водяной знак и дата
  g.fillStyle = '#f7f2ff'
  g.fillRect(0, H, W, FOOT)
  g.fillStyle = '#d9cdf5'
  g.fillRect(0, H, W, 2)
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const when = new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  g.textBaseline = 'middle'
  g.fillStyle = '#6b55c4'
  g.font = `600 17px ${family}`
  g.textAlign = 'left'
  g.fillText('My Note ♡', 20, H + FOOT / 2)
  const mark = g.measureText('My Note ♡').width
  g.fillStyle = '#8a82a6'
  g.font = `400 15px ${family}`
  const where = `${nb.folderPath(sh.parent)} / ${sh.name}`
  const room = W - 40 - mark - 24 - 230
  let label = where
  while (label.length > 4 && g.measureText(label).width > room) label = label.slice(1)
  g.fillText(`${label === where ? '' : '…'}${label}`, 20 + mark + 18, H + FOOT / 2)
  g.textAlign = 'right'
  g.fillText(when, W - 20, H + FOOT / 2)
  return out
}
async function download(type: 'png' | 'jpeg') {
  closeMenu()
  try {
    const c = await exportCanvas()
    const a = document.createElement('a')
    a.href = c.toDataURL(`image/${type}`, 0.92)
    a.download = `${sheet.value!.name}.${type === 'png' ? 'png' : 'jpg'}`
    a.click()
  } catch (e) {
    toast.error(`Не получилось сохранить картинку: ${errText(e)}`)
  }
}
async function clearAll() {
  closeMenu()
  if (!sheet.value?.strokes.length) return
  if (!(await askConfirm({ title: 'Очистить рисунок?', text: 'Все штрихи на листе сотрутся. Отменить можно кнопкой ↶.', ok: 'Очистить', danger: true }))) return
  snapshot(); sheet.value.strokes = []; changed(); paint(); thumb()
}
function setTpl(e: Event) { if (sheet.value) { sheet.value.tpl = (e.target as HTMLSelectElement).value as Tpl; paint(); thumb() } }
function moveTo(e: Event) { if (sheet.value) sheet.value.parent = (e.target as HTMLSelectElement).value || null }
const zoomBy = (d: number) => (zoom.value = Math.min(200, Math.max(50, zoom.value + d)))
const titleEl = ref<HTMLInputElement>()
onMounted(makeThumbs)
</script>

<template>
  <div :class="['nb', { full }]">
    <AuthGate v-if="!progress.unlocked" />
    <template v-else>
      <!-- верхняя полоса -->
      <div :class="['nb-main', { 'has-sheet': sheet, full }]">
        <!-- меню -->
        <aside v-if="!full" class="nb-side">
          <div class="nb-card nb-nav">
            <RouterLink to="/korean/home" class="nb-logo" title="На сайт">
              <img :src="ic('notebook')" alt="" />
              <span><b>My Note ♡</b><small>цифровые тетради</small></span>
            </RouterLink>
            <div class="nb-menu-wrap">
              <button class="nb-create" @click.stop="toggleMenu('create')">
                <b class="plus">+</b><span>Создать</span><i class="chev" />
              </button>
              <div v-if="menu === 'create'" class="nb-pop">
                <button @click="startSheet"><img :src="ic('file')" alt="" />Новый лист</button>
                <button @click="addFolder"><img :src="ic('folder')" alt="" />Новая папка</button>
              </div>
            </div>
            <button :class="['nb-link', { on: nav === 'all' && !q }]" @click="pickNav('all')"><img :src="ic('file')" alt="" /><span>Все файлы</span><em>{{ counts.all }}</em></button>
            <button :class="['nb-link', { on: nav === 'notebooks' && !q }]" @click="pickNav('notebooks')"><img :src="ic('notebook')" alt="" /><span>Тетради</span><em>{{ counts.notebooks }}</em></button>
            <button :class="['nb-link', { on: nav === 'recent' && !q }]" @click="pickNav('recent')"><img :src="ic('clock')" alt="" /><span>Недавние</span></button>
            <button :class="['nb-link', { on: nav === 'fav' && !q }]" @click="pickNav('fav')"><img :src="ic('star')" alt="" /><span>Избранное</span><em v-if="counts.fav">{{ counts.fav }}</em></button>
            <button class="nb-link" disabled title="Скоро"><img :src="ic('trash')" alt="" /><span>Корзина</span></button>
            <!-- блок тетрадей: раскрывается и сворачивается прямо в меню -->
            <div v-if="listOpen" class="nb-list" :data-drop="nav === 'notebooks' && !q ? 'root' : undefined">
          <div :class="['nb-list-head', { over: over === 'root' }]">
            <h2>{{ listTitle }}</h2>
            <button class="nb-sq" title="Новая папка" @click="addFolder"><img :src="ic('folder')" alt="" /></button>
            <button class="nb-sq" title="Свернуть" @click="listOpen = false"><i class="up" /></button>
          </div>
          <div class="nb-rows">
            <p v-if="!nb.loaded" class="nb-empty">Загружаю…</p>
            <p v-else-if="!rows.length" class="nb-empty">{{ q ? 'Ничего не найдено.' : nav === 'fav' ? 'Отметь лист звёздочкой, и он появится здесь.' : 'Пока пусто. Создай папку или лист кнопкой «Создать». Строку можно зажать и перетащить в папку.' }}</p>
            <div v-for="r in rows" :key="r.id"
              :class="['nb-row', r.kind, { on: sheet?.id === r.id, cur: r.kind === 'folder' && cur === r.id, over: over === r.id, drag: drag.id === r.id }]"
              :style="{ paddingLeft: 12 + r.depth * 22 + 'px' }" :data-drop="r.kind === 'folder' ? r.id : undefined"
              @pointerdown="rowDown($event, r)" @click="clickRow(r)" @contextmenu.prevent>
              <span v-if="r.kind === 'folder'" :class="['tw', { open: r.open }]">›</span><span v-else class="tw" />
              <img :src="ic(r.kind === 'folder' ? 'folder' : 'file')" alt="" />
              <span class="nm">{{ r.name }}</span>
              <span v-if="r.kind === 'folder' && r.count !== undefined" class="ct">{{ r.count }}</span>
              <span v-else class="dt">{{ r.note }}</span>
              <button v-if="r.kind === 'folder'" class="nb-rx" title="Переименовать" @click.stop="renameItem(r)">✎</button>
              <button class="nb-rx" title="Удалить" @click.stop="removeItem(r.id, r.name, r.kind)">×</button>
            </div>
          </div>
            </div>

            <div class="nb-store">
              <img :src="ic('cloud')" alt="" />
              <div><b>Хранилище</b><small>{{ nb.items.length }} из 2000</small></div>
              <i><u :style="{ width: Math.max(2, nb.items.length / 20) + '%' }" /></i>
            </div>
          </div>
        </aside>

        <!-- редактор -->
        <section class="nb-card nb-edit">
          <div v-if="!sheet" class="nb-blank">
            <img :src="catSleep" alt="" />
            <h3>Выбери лист слева</h3>
            <p>или создай новый, чтобы рисовать и писать.</p>
            <button class="nb-btn main" @click="startSheet">+ Новый лист</button>
          </div>
          <template v-else>
            <div class="nb-crumbs">
              <button class="nb-back" title="К списку" @click="closeSheet">‹</button>
              <img :src="ic('folder')" alt="" />
              <template v-for="f in crumbs" :key="f.id"><span>{{ f.name }}</span><i>›</i></template>
              <img :src="ic('file')" alt="" /><b>{{ sheet.name }}</b>
              <label class="nb-pill where" title="Куда сохранить лист">
                <img :src="ic('folder')" alt="" />
                <select :value="sheet.parent ?? ''" @change="moveTo">
                  <option value="">Тетради (без папки)</option>
                  <option v-for="f in folders" :key="f.id" :value="f.id">{{ nb.folderPath(f.id) }}</option>
                </select>
              </label>
            </div>
            <div class="nb-headline">
              <input ref="titleEl" v-model="sheet.name" class="nb-title" :maxlength="MAX_NB_NAME" aria-label="Название листа" />
              <button class="nb-pen" title="Переименовать" @click="titleEl?.focus()"><img :src="ic('pencil')" alt="" /></button>
              <span :class="['nb-state', state]"><img :src="ic('checklist')" alt="" />{{ savedText }}</span>
              <button :class="['nb-sq', { fav: favNow }]" title="В избранное" @click="toggleFav"><img :src="ic('star')" alt="" /></button>
              <button class="nb-sq" title="Скачать PNG" @click="download('png')"><img :src="ic('cloud-up')" alt="" /></button>
              <div class="nb-menu-wrap">
                <button class="nb-sq" title="Ещё" @click.stop="toggleMenu('more')"><img :src="ic('dots')" alt="" /></button>
                <div v-if="menu === 'more'" class="nb-pop right">
                  <button @click="clearAll">Очистить рисунок</button>
                  <button class="danger" @click="removeItem(sheet.id, sheet.name, 'sheet')"><img :src="ic('trash')" alt="" />Удалить лист</button>
                </div>
              </div>
            </div>

            <div class="nb-bar">
              <button :class="['nb-sq', { on: showPages }]" title="Панель страниц" @click="showPages = !showPages"><img :src="ic('cards')" alt="" /></button>
              <button class="nb-sq" title="Отменить" @click="stepBack"><img :src="ic('undo')" alt="" /></button>
              <button class="nb-sq" title="Вернуть" @click="stepForward"><img :src="ic('redo')" alt="" /></button>
              <span class="nb-colors">
                <button v-for="c in COLORS" :key="c" :class="{ on: color === c && tool !== 'eraser' }" :style="{ background: c }" :aria-label="`Цвет ${c}`" @click="color = c; if (tool === 'eraser') tool = 'pen'" />
              </span>
              <label class="nb-pill">
                <svg viewBox="0 0 40 14" width="36" height="14"><path d="M2 8c4-8 8 6 12-1s8 5 12-1 8 2 12-1" fill="none" stroke="#3a3350" stroke-width="2" stroke-linecap="round" /></svg>
                <select v-model.number="size"><option v-for="n in SIZES" :key="n" :value="n">{{ n }} px</option></select>
              </label>
              <label class="nb-pill a4"><select disabled><option>A4 (210 × 297 мм)</option></select></label>
              <label class="nb-pill">
                <img :src="ic('select')" alt="" />
                <select :value="sheet.tpl" @change="setTpl"><option v-for="t in TPLS" :key="t.id" :value="t.id">{{ t.name }}</option></select>
              </label>
            </div>

            <div :class="['nb-work', { 'no-pages': !showPages }]">
              <div class="nb-tools">
                <button :class="{ on: tool === 'pen' }" title="Ручка" @click="tool = 'pen'"><img :src="ic('pen')" alt="" /></button>
                <button :class="{ on: tool === 'eraser' }" title="Ластик" @click="tool = 'eraser'"><img :src="ic('eraser')" alt="" /></button>
                <button :class="{ on: textOpen }" title="Текст к листу" @click="textOpen = !textOpen"><img :src="ic('text')" alt="" /></button>
              </div>
              <div class="nb-paper">
                <div class="nb-scroll">
                  <canvas ref="cv" class="nb-canvas" :width="W" :height="H" :style="{ width: zoom + '%' }"
                    @pointerdown.prevent="down" @pointermove="move" @pointerup="up" @pointercancel="up" />
                </div>
                <img :src="catSleep" class="nb-paper-cat" alt="" />
              </div>
              <div v-if="showPages" class="nb-pages">
                <div class="nb-pages-head"><b>Страницы</b><span>1 / 1</span><button disabled title="Скоро"><img :src="ic('plus')" alt="" /></button></div>
                <div class="nb-page on"><canvas ref="th" width="140" height="198" /><i>1</i></div>
              </div>
            </div>

            <textarea v-if="textOpen" v-model="sheet.text" class="nb-text" rows="3" placeholder="Текст к листу…" maxlength="20000" />

            <div class="nb-foot">
              <span class="nb-zoom">
                <button aria-label="Меньше" @click="zoomBy(-10)">−</button><b class="nb-zoom-v" title="Вернуть 100%" @click="zoom = 100">{{ zoom }}%</b><button aria-label="Больше" @click="zoomBy(10)">+</button>
              </span>
              <button :class="['nb-sq', { on: full }]" :title="full ? 'Вернуть боковое меню' : 'Спрятать боковое меню: только лист для рисования'" @click="focus = !focus"><img :src="ic('fullscreen')" alt="" /></button>
              <span class="grow" />
              <div class="nb-menu-wrap">
                <button class="nb-pill btn" @click.stop="toggleMenu('export')"><img :src="ic('cloud-down')" alt="" />Экспорт<img :src="ic('chevron')" class="chev" alt="" /></button>
                <div v-if="menu === 'export'" class="nb-pop up right">
                  <button @click="download('png')">Картинка PNG</button>
                  <button @click="download('jpeg')">Картинка JPG</button>
                </div>
              </div>
              <button class="nb-save" @click="saveNow">✓ Сохранить</button>
            </div>
          </template>
        </section>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="drag.id" class="nb-ghost" :style="{ left: drag.x + 'px', top: drag.y + 'px' }">{{ drag.label }}</div>

      <div v-if="picking" class="nb-ov" @click.self="picking = false">
        <div class="nb-modal" role="dialog" aria-label="Выбор шаблона">
          <h2>На чём рисовать?</h2>
          <div class="nb-tpls">
            <button v-for="t in TPLS" :key="t.id" class="nb-tpl" @click="addSheet(t.id)">
              <img :src="thumbs[t.id]" :alt="t.name" />
              <span>{{ t.name }}</span>
            </button>
          </div>
          <button class="nb-btn" @click="picking = false">Отмена</button>
        </div>
      </div>

      <div v-if="nameDlg" class="nb-ov" @click.self="nameDlg = null">
        <form class="nb-modal nb-small" role="dialog" :aria-label="nameDlg.title" @submit.prevent="submitName">
          <h2>{{ nameDlg.title }}</h2>
          <input v-model="nameDlg.value" class="nb-input" placeholder="Название" :maxlength="MAX_NB_NAME" @vue:mounted="($event.el as HTMLInputElement).focus()" />
          <div class="nb-row2">
            <button type="button" class="nb-btn" @click="nameDlg = null">Отмена</button>
            <button type="submit" class="nb-btn main" :disabled="!nameDlg.value.trim() || nameBusy">{{ nameDlg.ok }}</button>
          </div>
        </form>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.nb { --ink: #3a3350; --mute: #8a82a6; --vio: #8f6fe0; --pink: #ee6fa9; --line: rgba(143, 111, 224, .16);
  min-height: 100vh; height: 100dvh; box-sizing: border-box; padding: 12px 22px 20px; display: flex; flex-direction: column; gap: 12px; color: var(--ink);
  background: linear-gradient(rgba(255, 255, 255, .2), rgba(255, 255, 255, .2)), linear-gradient(to bottom, transparent 70%, #f1dff7 98%), url('@/assets/game/bg.webp') center top / cover no-repeat, #f1dff7; overflow: hidden; }
.nb button { font: inherit; color: inherit; cursor: pointer; }
.nb button:disabled { cursor: default; opacity: .5; }
.nb img { -webkit-user-drag: none; }

/* логотип в меню */
.nb-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; margin: 0 0 10px; }
.nb-logo img { width: 46px; height: 46px; object-fit: contain; }
.nb-logo b { display: block; font-size: 21px; font-weight: 600; color: #5a3fb0; line-height: 1.1; }
.nb-logo small { color: var(--mute); font-size: 12px; }

/* колонки */
.nb-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 14px; }
.nb-card { background: rgba(255, 255, 255, .74); backdrop-filter: blur(14px); border: 1px solid rgba(255, 255, 255, .9); border-radius: 26px; box-shadow: 0 10px 30px rgba(130, 100, 200, .14); min-height: 0; }
.nb-side { display: flex; flex-direction: column; min-height: 0; position: relative; }
.nb-nav { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.nb-menu-wrap { position: relative; }
.nb-create { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 6px 14px; margin-bottom: 6px; color: #fff; font-size: 15px; font-weight: 600;
  background: linear-gradient(135deg, #9d7cf0, #d78be8); box-shadow: 0 6px 16px rgba(150, 100, 230, .35); }
.nb-create .plus { font-size: 22px; font-weight: 400; line-height: 1; width: 20px; text-align: center; }
.nb-create .chev { margin-left: auto; width: 9px; height: 9px; border: solid #fff; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg) translateY(-3px); margin-right: 6px; }
.nb-pop { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; min-width: 190px; background: #fff; border-radius: 16px; padding: 6px; box-shadow: 0 14px 34px rgba(80, 60, 150, .25); display: flex; flex-direction: column; }
.nb-pop.right { left: auto; right: 0; }
.nb-pop.up { top: auto; bottom: calc(100% + 6px); }
.nb-pop button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; border-radius: 10px; padding: 9px 12px; text-align: left; font-size: 15px; }
.nb-pop button:hover { background: #f1eaff; }
.nb-pop button.danger { color: #c0392b; }
.nb-pop img { width: 22px; height: 22px; object-fit: contain; }
.nb-link { display: flex; align-items: center; gap: 12px; border: 0; background: transparent; border-radius: 14px; padding: 9px 12px; font-size: 16px; text-align: left; }
.nb-link img { width: 26px; height: 26px; object-fit: contain; }
.nb-link span { flex: 1; }
.nb-link em { font-style: normal; font-size: 13px; background: rgba(143, 111, 224, .14); color: var(--mute); border-radius: 999px; padding: 1px 9px; }
.nb-link.on { background: linear-gradient(135deg, #ecdcfb, #f5dcf0); font-weight: 600; }
.nb-store { margin-top: auto; flex-shrink: 0; padding: 12px; border-radius: 16px; background: rgba(240, 232, 255, .7); display: grid; grid-template-columns: 38px 1fr; gap: 2px 10px; align-items: center; }
.nb-store img { width: 38px; height: 38px; object-fit: contain; grid-row: span 2; }
.nb-store b { font-size: 15px; display: block; } .nb-store small { color: var(--mute); font-size: 12px; }
.nb-store i { grid-column: 1 / -1; height: 6px; border-radius: 6px; background: #e3d9fa; overflow: hidden; margin-top: 6px; }
.nb-store u { display: block; height: 100%; background: linear-gradient(90deg, #9d7cf0, #d78be8); border-radius: 6px; }

/* список */
.nb-list { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; margin: 8px -8px 10px; border-top: 1px solid var(--line); }
.nb-sq .up { width: 9px; height: 9px; border: solid var(--ink); border-width: 2.5px 0 0 2.5px; transform: rotate(45deg) translate(2px, 2px); }
.nb-list-head { display: flex; align-items: center; gap: 8px; padding: 12px 10px 6px; }
.nb-list-head.over { outline: 2px dashed var(--pink); outline-offset: -4px; }
.nb-list-head h2 { margin: 0 auto 0 0; font-size: 18px; font-weight: 600; }
.nb-list-head .nb-sq { width: 34px; height: 34px; }
.nb-sq { border: 0; background: #f1eaff; border-radius: 12px; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; flex-shrink: 0; }
.nb-sq:hover:not(:disabled) { background: #e6d9fc; }
.nb-sq img { width: 26px; height: 26px; object-fit: contain; }
.nb-sq.fav { background: #fff2c8; }
.nb-sq.on { background: #f9d6ea; box-shadow: inset 0 0 0 1px #f4aacb; }
.nb-rows { overflow: auto; padding: 4px 10px 14px; flex: 1; }
.nb-empty { color: var(--mute); padding: 10px 12px; font-size: 14px; }
.nb-row { position: relative; display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 14px; cursor: pointer; user-select: none; -webkit-touch-callout: none; touch-action: pan-y; font-size: 16px; }
.nb-row:hover { background: rgba(143, 111, 224, .08); }
.nb-row.folder { font-weight: 600; }
.nb-row.cur { background: rgba(143, 111, 224, .1); }
.nb-row.on { background: linear-gradient(135deg, #f8d9ee, #ead9fb); }
.nb-row.over { outline: 2px dashed var(--pink); background: rgba(238, 111, 169, .12); }
.nb-row.drag { opacity: .4; }
.nb-row img { width: 30px; height: 30px; object-fit: contain; flex-shrink: 0; }
.nb-row .tw { width: 12px; color: var(--mute); transition: transform .15s; flex-shrink: 0; text-align: center; }
.nb-row .tw.open { transform: rotate(90deg); }
.nb-row .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-row .ct { font-size: 13px; color: var(--mute); background: rgba(143, 111, 224, .12); border-radius: 999px; padding: 1px 9px; }
.nb-row .dt { font-size: 13px; color: var(--mute); font-weight: 400; }
.nb-rx { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: #fff; border-radius: 8px; width: 26px; height: 26px; opacity: 0; color: var(--mute); }
.nb-rx + .nb-rx { right: 36px; }
.nb-row:hover .nb-rx { opacity: 1; }
@media (hover: none) { .nb-rx { opacity: .6; } }

/* редактор */
.nb-edit { display: flex; flex-direction: column; padding: 14px 18px 14px; gap: 10px; overflow: hidden; }
.nb-blank { margin: auto; text-align: center; color: var(--mute); }
.nb-blank img { width: 220px; clip-path: inset(0 12% 0 0); }
.nb-blank h3 { margin: 6px 0 4px; color: var(--ink); font-size: 20px; font-weight: 600; }
.nb-blank p { margin: 0 0 14px; }
.nb-crumbs { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--mute); flex-wrap: wrap; }
.nb-crumbs img { width: 22px; height: 22px; object-fit: contain; }
.nb-crumbs i { font-style: normal; }
.nb-crumbs b { color: var(--ink); font-weight: 600; }
.nb-back { border: 0; background: #f1eaff; border-radius: 8px; width: 24px; height: 24px; line-height: 1; font-size: 18px; padding: 0; }
.nb-headline { display: flex; align-items: center; gap: 8px; }
.nb-title { flex: 1 1 120px; min-width: 0; max-width: 420px; border: 0; background: transparent; font: inherit; font-size: 26px; font-weight: 600; color: var(--ink); outline: 0; border-radius: 10px; padding: 2px 6px; }
.nb-title:focus { background: #f6f0ff; }
.nb-pen { border: 0; background: transparent; padding: 0; }
.nb-pen img { width: 22px; height: 22px; object-fit: contain; }
.nb-state { margin-left: auto; white-space: nowrap; display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--mute); }
.nb-state img { width: 22px; height: 22px; object-fit: contain; }
.nb-state.error { color: #c0392b; }
.nb-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.nb-colors { display: flex; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #f6f0ff; }
.nb-colors button { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; padding: 0; box-shadow: 0 0 0 1px rgba(0, 0, 0, .12); }
.nb-colors button.on { box-shadow: 0 0 0 2.5px var(--vio); }
.nb-pill { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 999px; background: #f6f0ff; border: 1px solid var(--line); font-size: 15px; }
.nb-pill img { width: 24px; height: 24px; object-fit: contain; }
.nb-pill select { border: 0; background: transparent; font: inherit; color: inherit; outline: 0; max-width: 170px; }
.nb-pill.where { margin-left: auto; height: 34px; font-size: 14px; }
.nb-pill.btn { border: 1px solid var(--line); background: #fff; }
.nb-pill .chev { width: 18px; height: 18px; }
.nb.full { padding: 8px 10px 10px; }
.nb-main.full { grid-template-columns: minmax(0, 1fr); }
.nb-work.no-pages { grid-template-columns: 62px minmax(0, 1fr); }
.nb-work { flex: 1; min-height: 0; display: grid; grid-template-columns: 62px minmax(0, 1fr) 150px; grid-template-rows: minmax(0, 1fr); gap: 12px; }
.nb-tools { display: flex; flex-direction: column; gap: 6px; padding: 8px 6px; border-radius: 22px; background: rgba(246, 240, 255, .9); align-self: start; max-height: 100%; overflow-y: auto; }
.nb-tools button { border: 0; background: transparent; border-radius: 14px; width: 48px; height: 48px; display: grid; place-items: center; padding: 0; }
.nb-tools button.on { background: #f9d6ea; box-shadow: inset 0 0 0 1px #f4aacb; }
.nb-tools img { width: 30px; height: 30px; object-fit: contain; }
.nb-paper { position: relative; min-height: 0; border-radius: 16px; background: #fff; border: 1px solid rgba(143, 111, 224, .25); box-shadow: 0 6px 20px rgba(130, 100, 200, .12); overflow: hidden; }
.nb-scroll { height: 100%; overflow: auto; }
.nb-canvas { display: block; touch-action: none; cursor: crosshair; background: #fff; }
.nb-paper-cat { clip-path: inset(0 12% 0 0); position: absolute; right: 14px; bottom: 8px; width: 120px; pointer-events: none; }
.nb-pages { display: flex; flex-direction: column; gap: 8px; align-self: start; padding: 10px; border-radius: 18px; background: rgba(246, 240, 255, .6); }
.nb-pages-head { display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.nb-pages-head span { color: var(--mute); font-size: 13px; margin-right: auto; }
.nb-pages-head button { border: 0; background: transparent; padding: 0; width: 26px; height: 26px; }
.nb-pages-head img { width: 24px; height: 24px; object-fit: contain; }
.nb-page { position: relative; border-radius: 10px; overflow: hidden; border: 2px solid transparent; }
.nb-page.on { border-color: #f08ac0; }
.nb-page canvas { display: block; width: 100%; height: auto; background: #fff; }
.nb-page i { position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%); font-style: normal; font-size: 11px; color: #fff; background: #ee6fa9; border-radius: 999px; padding: 0 7px; }
.nb-text { font: inherit; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255, 255, 255, .85); color: inherit; resize: vertical; }
.nb-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.nb-foot .grow { flex: 1; }
.nb-zoom { display: flex; align-items: center; gap: 4px; height: 40px; padding: 0 6px; border-radius: 999px; background: #f6f0ff; font-size: 15px; }
.nb-zoom button { border: 0; background: transparent; width: 30px; height: 30px; font-size: 20px; border-radius: 50%; padding: 0; }
.nb-zoom .nb-zoom-v { cursor: pointer; }
.nb-zoom b { min-width: 52px; text-align: center; font-weight: 500; }
.nb-save { border: 0; border-radius: 999px; padding: 0 28px; height: 44px; color: #fff; font-size: 17px; font-weight: 600; background: linear-gradient(135deg, #f58fc0, #ee6fa9); box-shadow: 0 6px 16px rgba(238, 111, 169, .4); }

/* окна */
.nb-btn { text-decoration: none; display: inline-block; border: 1px solid rgba(120, 130, 200, .3); background: #fff8; border-radius: 12px; padding: 7px 14px; font-size: 14px; }
.nb-btn.main { background: linear-gradient(135deg, #f7b7d2, #b9c8f5); border-color: transparent; }
.nb-btn:disabled { opacity: .4; }
.nb-ov { position: fixed; inset: 0; z-index: 50; background: rgba(40, 40, 70, .35); display: flex; align-items: center; justify-content: center; padding: 16px; }
.nb-modal { background: #fdfcff; border-radius: 22px; padding: 22px; max-width: 640px; width: 100%; max-height: 90vh; overflow: auto; display: flex; flex-direction: column; gap: 14px; color: #3a3350; }
.nb-modal h2 { margin: 0; font-size: 19px; font-weight: 600; }
.nb-small { max-width: 380px; }
.nb-input { font: inherit; font-size: 16px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(120, 130, 200, .35); background: #fff; color: inherit; }
.nb-row2 { display: flex; gap: 8px; justify-content: flex-end; }
.nb-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.nb-tpl { border: 1px solid rgba(120, 130, 200, .3); background: #fff; border-radius: 14px; padding: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; font: inherit; font-size: 14px; color: inherit; transition: transform .15s, box-shadow .15s; }
.nb-tpl:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(120, 130, 200, .25); border-color: #ee6fa9; }
.nb-tpl img { width: 100%; aspect-ratio: 840 / 1188; object-fit: cover; object-position: top; max-height: 150px; border-radius: 8px; border: 1px solid rgba(120, 130, 200, .2); }
.nb-ghost { position: fixed; z-index: 400; transform: translate(-50%, -60%) rotate(-3deg); pointer-events: none; padding: 10px 16px; border-radius: 14px; font-size: 14px;
  background: linear-gradient(135deg, #f7b7d2, #b9c8f5); color: #3a3350; box-shadow: 0 10px 26px rgba(80, 80, 140, .3); max-width: 70vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* узкие экраны: одна колонка, список или лист */
@media (max-width: 1620px) { .a4 { display: none; } }
@media (max-width: 1180px) {
  .nb-main { grid-template-columns: 250px minmax(0, 1fr); }
    .nb-edit { min-width: 0; }
  .nb-headline { flex-wrap: wrap; }
  .nb-title { flex-basis: 100%; max-width: none; order: -1; }
  .nb-state { margin-left: 0; }
  .nb-work { grid-template-columns: 56px minmax(0, 1fr); }
  .nb-pages { display: none; }
}
@media (max-width: 900px) {
  .nb { height: auto; min-height: 100dvh; overflow: visible; padding: 10px 12px 16px; }
  .nb-main { grid-template-columns: minmax(0, 1fr); }
  .nb-side { order: 0; }
    .nb-nav { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .nb-nav .nb-menu-wrap { width: 100%; }
  .nb-link { padding: 6px 10px; font-size: 14px; }
  .nb-link img { width: 22px; height: 22px; }
  .nb-store { display: none; }
  .nb-nav { flex: none; }
  .nb-list { flex: none; max-height: 55vh; }
  .nb-main.has-sheet .nb-side { display: none; }
  .nb-main:not(.has-sheet) .nb-edit { display: none; }
  .nb-edit { min-height: 80vh; }
  .nb-headline { flex-wrap: wrap; }
  .nb-title { max-width: 100%; width: 100%; order: -1; }
  .nb-state { margin-left: 0; }
  .nb-paper-cat { width: 70px; }
}
</style>
