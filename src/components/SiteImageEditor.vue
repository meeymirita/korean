<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cutoutBackground } from '@/lib/cutout'
import { ZOOM, dragPlacement, type Placement } from '@/lib/siteImages'
import { useSiteImagesStore } from '@/stores/siteImages'
import { useToastStore } from '@/stores/toast'

/** Режим редактирования картинок: шестерёнка у картинки под курсором и боковая панель, где правка видна на странице сразу. */
const store = useSiteImagesStore()
const toast = useToastStore()

interface Hit {
  key: string
  r: { left: number; top: number; width: number; height: number }
}
const hover = ref<Hit | null>(null)
const target = ref<Hit | null>(null)
const url = ref('')
const urlBusy = ref(false)
const file = ref<HTMLInputElement | null>(null)

const side = ref<'left' | 'right'>('right')
const flip = () => (side.value = side.value === 'right' ? 'left' : 'right')

const imgs = (key?: string) => [...document.querySelectorAll<HTMLImageElement>(key ? `img[data-si-key="${key}"]` : 'img[data-si-key]')].filter(i => i.dataset.siOwn === undefined || !!key)
function rectOf(el: Element): Hit['r'] {
  const b = el.getBoundingClientRect()
  return { left: b.left, top: b.top, width: b.width, height: b.height }
}
const inside = (r: Hit['r'], x: number, y: number) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height

/** Картинка под курсором: считаем по рамкам, потому что у многих картинок pointer-events: none. Из совпавших берём самую маленькую. */
function pick(x: number, y: number): Hit | null {
  let best: Hit | null = null
  for (const i of imgs()) {
    if (i.closest('[data-si-skip]')) continue
    const r = rectOf(i)
    if (r.width < 24 || r.height < 24 || !inside(r, x, y) || getComputedStyle(i).visibility === 'hidden') continue
    if (!best || r.width * r.height < best.r.width * best.r.height) best = { key: i.dataset.siKey!, r }
  }
  return best
}

let raf = 0
function onMove(e: PointerEvent) {
  if (!store.editMode || store.draft || (e.target as Element | null)?.closest?.('.sie-gear, .sie-panel')) return
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => (hover.value = pick(e.clientX, e.clientY)))
}

function refresh() {
  const d = store.draft
  if (d) {
    const el = imgs(d.key)[0]
    target.value = el ? { key: d.key, r: rectOf(el) } : null
  } else target.value = null
  if (hover.value && !store.draft) {
    const el = imgs(hover.value.key).find(i => i.dataset.siOwn === undefined)
    if (el) hover.value = { key: hover.value.key, r: rectOf(el) }
  }
}
let tick = 0
function loop() {
  refresh()
  tick = requestAnimationFrame(loop)
}

function open(key: string, place?: Placement) {
  // панель встаёт на ту сторону экрана, где картинки нет, чтобы её было видно целиком
  const el = imgs(key)[0]
  if (el) {
    const r = rectOf(el)
    side.value = r.left + r.width / 2 > window.innerWidth / 2 ? 'left' : 'right'
  }
  store.begin(key, place)
  url.value = ''
  hover.value = null
  void nextTick(() => imgs(key)[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}
/** Ключ для шестерёнок, которые стоят прямо в блоках главной (у блока «Слова на сегодня» картинки может ещё не быть). */
function onOpenEvent(e: Event) {
  const d = (e as CustomEvent<{ key: string; place?: Placement }>).detail
  if (d?.key && store.editMode) open(d.key, d.place)
}

/* ---- тянуть картинку можно прямо на странице ---- */
let drag: { x: number; y: number; from: { x: number; y: number; zoom: number }; w: number; h: number } | null = null
function down(e: PointerEvent) {
  const d = store.draft
  if (!d || e.button !== 0 || (e.target as Element | null)?.closest?.('.sie-panel, .sie-bar')) return
  const el = imgs(d.key)[0]
  if (!el) return
  const r = rectOf(el)
  if (!inside(r, e.clientX, e.clientY)) return
  e.preventDefault()
  e.stopPropagation()
  drag = { x: e.clientX, y: e.clientY, from: { x: d.x, y: d.y, zoom: d.zoom }, w: r.width, h: r.height }
  document.body.classList.add('sie-dragging')
}
function dmove(e: PointerEvent) {
  const d = store.draft
  if (!drag || !d) return
  store.patch(dragPlacement(d.key, drag.from, e.clientX - drag.x, e.clientY - drag.y, drag.w, drag.h))
}
function dup() {
  drag = null
  document.body.classList.remove('sie-dragging')
}
/** Клики по ссылкам и кнопкам не срабатывают на картинке, которую правят. */
function eatClick(e: MouseEvent) {
  const d = store.draft
  if (!d || (e.target as Element | null)?.closest?.('.sie-panel, .sie-bar, .sie-gear')) return
  const el = imgs(d.key)[0]
  if (el && inside(rectOf(el), e.clientX, e.clientY)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.draft && !document.querySelector('.cf-back, [role="alertdialog"]')) store.cancel()
}

onMounted(() => {
  document.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerdown', down, true)
  window.addEventListener('pointermove', dmove)
  window.addEventListener('pointerup', dup)
  document.addEventListener('click', eatClick, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('site-image-edit', onOpenEvent)
  loop()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  cancelAnimationFrame(tick)
  document.removeEventListener('pointermove', onMove)
  document.removeEventListener('pointerdown', down, true)
  window.removeEventListener('pointermove', dmove)
  window.removeEventListener('pointerup', dup)
  document.removeEventListener('click', eatClick, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('site-image-edit', onOpenEvent)
})
watch(() => store.editMode, on => !on && (hover.value = null))

const d = computed(() => store.draft)
const shown = computed(() => {
  const dd = store.draft
  if (!dd) return ''
  return dd.src || imgs(dd.key)[0]?.dataset.siOrig || ''
})
const gear = computed(() => {
  const h = hover.value
  if (!h || store.draft) return null
  return { left: Math.min(window.innerWidth - 40, Math.max(4, h.r.left + h.r.width - 38)), top: Math.max(4, h.r.top + 6), key: h.key }
})

function applyUrl() {
  const u = url.value.trim()
  if (!/^https:\/\//i.test(u)) return toast.error('Вставь ссылку на картинку: она начинается с https://')
  urlBusy.value = true
  const img = new Image()
  img.onload = () => {
    urlBusy.value = false
    store.useUrl(u)
    url.value = ''
  }
  img.onerror = () => {
    urlBusy.value = false
    toast.error('По этой ссылке картинка не открылась')
  }
  img.src = u
}
function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!f.type.startsWith('image/')) return toast.error('Это не картинка')
  if (f.size > 12 * 1024 * 1024) return toast.error('Файл больше 12 МБ')
  store.useFile(f)
}
const pct = (n: number) => Math.round(n)

/** «Удалить фон»: вырезает белый фон и нарисованную шахматку (`lib/cutout.ts`), результат сразу виден на странице. */
const cutting = ref(false)
async function cutout() {
  const dd = store.draft
  if (!dd || cutting.value) return
  cutting.value = true
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = shown.value
    await img.decode()
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k))
    c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, c.width, c.height)
    let data: ImageData
    try {
      data = g.getImageData(0, 0, c.width, c.height)
    } catch {
      return void toast.error('Эту картинку по ссылке обработать нельзя: загрузи её файлом')
    }
    let clear = 0
    for (let i = 3; i < data.data.length; i += 4) if (data.data[i]! < 250) clear++
    if (clear / (c.width * c.height) > 0.02) return void toast.info('У картинки уже есть прозрачный фон')
    const removed = cutoutBackground(data.data, c.width, c.height)
    if (removed < 0.005) return void toast.info('Белого или шахматного фона по краям не нашёл')
    g.putImageData(data, 0, 0)
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'))
    if (!blob) return void toast.error('Не получилось вырезать фон')
    store.useFile(new File([blob], 'cutout.png', { type: 'image/png' }), true)
    toast.ok('Фон вырезан. Если что-то лишнее осталось, нажми «Отмена»; сохранится по «Сохранить»')
  } catch {
    toast.error('Не удалось открыть картинку, чтобы вырезать фон')
  } finally {
    cutting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <template v-if="store.editMode">
      <div v-if="target" class="sie-frame" :style="{ left: target.r.left + 'px', top: target.r.top + 'px', width: target.r.width + 'px', height: target.r.height + 'px' }" aria-hidden="true"></div>
      <div v-else-if="hover" class="sie-frame hov" :style="{ left: hover.r.left + 'px', top: hover.r.top + 'px', width: hover.r.width + 'px', height: hover.r.height + 'px' }" aria-hidden="true"></div>
      <button v-if="gear" class="sie-gear" :style="{ left: gear.left + 'px', top: gear.top + 'px' }" title="Заменить или подвинуть картинку" aria-label="Редактировать картинку" @click="open(gear.key)">⚙︎</button>

      <div v-if="!d" class="sie-bar">
        <span>✎ Режим редактирования: наведи на картинку, появится ⚙︎</span>
        <button type="button" @click="store.setEditMode(false)">Выключить</button>
      </div>

      <aside v-if="d" class="sie-panel" :class="side" role="dialog" aria-modal="false" aria-label="Редактирование картинки">
        <header>
          <h3>Картинка <code>{{ d.key }}</code></h3>
          <button class="ic" :title="side === 'right' ? 'Перенести влево' : 'Перенести вправо'" aria-label="Перенести панель" @click="flip">{{ side === 'right' ? '◀' : '▶' }}</button>
          <button class="ic" title="Закрыть без сохранения (Esc)" aria-label="Закрыть" @click="store.cancel()">✕</button>
        </header>
        <p class="live">Всё, что ты меняешь, сразу видно на странице. Картинку можно тянуть мышью прямо там. Сохранится, когда нажмёшь «Сохранить».</p>

        <div class="thumb"><img :src="shown" alt="" data-si-skip /></div>

        <div class="grp">
          <label>Влево – вправо <b>{{ pct(d.x) }}%</b><input type="range" min="0" max="100" step="0.5" :value="d.x" @input="store.patch({ x: +($event.target as HTMLInputElement).value })" /></label>
          <label>Вверх – вниз <b>{{ pct(d.y) }}%</b><input type="range" min="0" max="100" step="0.5" :value="d.y" @input="store.patch({ y: +($event.target as HTMLInputElement).value })" /></label>
          <label>Приближение <b>{{ Math.round(d.zoom * 100) }}%</b><input type="range" :min="ZOOM.min" :max="ZOOM.max" step="0.02" :value="d.zoom" @input="store.patch({ zoom: +($event.target as HTMLInputElement).value })" /></label>
          <button class="lnk" type="button" @click="store.patch({ x: 50, y: 50, zoom: 1 })">Сбросить положение</button>
        </div>

        <div class="grp">
          <h4>Заменить картинку</h4>
          <div class="row">
            <input v-model="url" type="url" inputmode="url" placeholder="Ссылка: https://…" autocomplete="off" @keydown.enter.prevent="applyUrl" />
            <button type="button" :disabled="urlBusy || !url.trim()" @click="applyUrl">Взять</button>
          </div>
          <input ref="file" type="file" accept="image/*" hidden @change="onFile" />
          <button class="wide" type="button" @click="file?.click()">Загрузить файл с устройства</button>
          <button class="wide" type="button" :disabled="cutting" title="Вырезает белый фон и нарисованную шахматку по краям картинки" @click="cutout()">{{ cutting ? 'Вырезаю…' : 'Удалить фон' }}</button>
          <p class="hint">Новая картинка целиком занимает место старой, у всех.</p>
        </div>

        <footer>
          <button class="main" type="button" :disabled="store.busy || !store.dirty" @click="store.save()">{{ store.busy ? 'Сохраняю…' : 'Сохранить' }}</button>
          <button type="button" :disabled="store.busy" @click="store.cancel()">Отмена</button>
          <button v-if="store.items[d.key]" class="lnk danger" type="button" :disabled="store.busy" @click="store.reset(d.key)">Вернуть исходную</button>
        </footer>
      </aside>
    </template>
  </Teleport>
</template>

<style scoped>
.sie-frame { position: fixed; z-index: 57; pointer-events: none; border: 2px dashed #b37be0; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(60, 50, 110, .08); }
.sie-frame.hov { box-shadow: none; border-color: rgba(179, 123, 224, .65); }
.sie-gear { position: fixed; z-index: 58; width: 34px; height: 34px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: #fff; color: #5b4fb3; font: inherit; font-size: 19px; line-height: 1;
  box-shadow: 0 6px 18px rgba(80, 60, 160, .35); cursor: pointer; }
.sie-gear:hover { transform: rotate(60deg); background: #f3edff; }
.sie-bar { position: fixed; z-index: 58; left: 14px; bottom: 14px; display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 28px); padding: 9px 10px 9px 16px; border-radius: 99px; background: #fff; color: #4d4a86; font-size: 13px; box-shadow: 0 8px 24px rgba(80, 60, 160, .28); }
.sie-bar button { padding: 6px 14px; border: 0; border-radius: 99px; background: #efe9ff; color: #5b4fb3; font: inherit; font-weight: 600; cursor: pointer; }
.sie-panel { position: fixed; z-index: 59; top: 12px; bottom: 12px; width: 310px; overflow-y: auto; display: grid; align-content: start; gap: 14px; padding: 16px; border-radius: 22px; background: #fff; color: #2c2a55;
  box-shadow: 0 18px 50px rgba(70, 60, 140, .35); border: 1px solid #ece6ff; font-size: 14px; }
.sie-panel.right { right: 12px; }
.sie-panel.left { left: 12px; }
header { display: flex; align-items: center; gap: 6px; }
h3 { flex: 1; margin: 0; font-size: 15px; min-width: 0; }
h3 code { display: block; margin-top: 2px; font-size: 12px; font-weight: 500; color: #8a88b4; overflow-wrap: anywhere; }
h4 { margin: 0 0 8px; font-size: 13px; }
.ic { width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: #f3efff; color: #6a5bc0; font: inherit; font-size: 12px; cursor: pointer; }
.live { margin: 0; padding: 9px 12px; border-radius: 14px; background: #f6f1ff; color: #5b4fb3; font-size: 12.5px; line-height: 1.45; }
.thumb { display: grid; place-items: center; height: 120px; border-radius: 16px; background: repeating-linear-gradient(45deg, #f6f1ff, #f6f1ff 10px, #efe9ff 10px, #efe9ff 20px); overflow: hidden; }
.thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.grp { display: grid; gap: 10px; }
label { display: grid; gap: 4px; font-size: 13px; color: #6c6a9a; }
label b { float: right; color: #2c2a55; font-weight: 600; }
input[type='range'] { width: 100%; accent-color: #8c78da; }
.row { display: flex; gap: 6px; }
.row input { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid #ddd6f7; border-radius: 12px; background: #faf8ff; font: inherit; font-size: 13px; color: inherit; }
.row button, .wide, footer button { padding: 9px 14px; border: 1px solid #ddd6f7; border-radius: 12px; background: #f6f2ff; color: #5b4fb3; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
button:disabled { opacity: .5; cursor: default; }
.wide { width: 100%; }
.main { border: 0 !important; color: #fff !important; background: linear-gradient(100deg, #b79bf0, #7fb2f5) !important; }
.lnk { padding: 0 !important; border: 0 !important; background: none !important; color: #7371ed !important; font-weight: 500 !important; text-align: left; }
.lnk.danger { color: #d1456f !important; }
.hint { margin: 0; font-size: 12px; color: #8a88b4; }
footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 4px; }
footer .lnk { margin-left: auto; }
@media (max-width: 700px) {
  .sie-panel { top: auto; left: 8px !important; right: 8px !important; bottom: 8px; width: auto; max-height: 52vh; }
  .sie-bar { bottom: 8px; left: 8px; }
}
</style>

<style>
body.sie-dragging, body.sie-dragging * { cursor: grabbing !important; user-select: none !important; }
</style>
