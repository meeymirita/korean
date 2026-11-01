<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import BlockBgLayer from '@/components/korean/BlockBgLayer.vue'
import { BG_ZOOM, fileToDataUrl, useBlockBg, type BlockBg } from '@/composables/useBlockBg'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ id: string; title: string; veil?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useBlockBg(props.id)
const toast = useToastStore()
const draft = ref<BlockBg | null>(store.bg ? { ...store.bg } : null)
const url = ref('')
const busy = ref(false)
const file = ref<HTMLInputElement | null>(null)

function setSrc(src: string) {
  draft.value = { src, x: 50, y: 50, zoom: 1 }
}

/** Ссылку проверяем загрузкой: картинка должна открыться, иначе плашка с ошибкой. */
function applyUrl() {
  const u = url.value.trim()
  if (!/^https?:\/\//i.test(u)) return toast.error('Вставь ссылку на картинку, она начинается с https://')
  busy.value = true
  const img = new Image()
  img.onload = () => {
    busy.value = false
    setSrc(u)
    url.value = ''
  }
  img.onerror = () => {
    busy.value = false
    toast.error('По этой ссылке картинка не открылась')
  }
  img.src = u
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  busy.value = true
  try {
    setSrc(await fileToDataUrl(f))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Не удалось загрузить картинку')
  }
  busy.value = false
}

/* двигаем картинку мышью или пальцем прямо в окне предпросмотра */
const stage = ref<HTMLElement | null>(null)
let drag: { px: number; py: number; x: number; y: number } | null = null
function down(e: PointerEvent) {
  if (!draft.value) return
  drag = { px: e.clientX, py: e.clientY, x: draft.value.x, y: draft.value.y }
  stage.value?.setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (!drag || !draft.value || !stage.value) return
  const r = stage.value.getBoundingClientRect()
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  draft.value = { ...draft.value, x: clamp(drag.x - ((e.clientX - drag.px) / r.width) * 100), y: clamp(drag.y - ((e.clientY - drag.py) / r.height) * 100) }
}
function up() {
  drag = null
}

function save() {
  if (!draft.value) return clearBg()
  if (!store.save(draft.value)) return toast.error('Не хватило места в браузере: возьми картинку поменьше или вставь ссылку')
  toast.ok('Фон блока сохранён (только на этом устройстве)')
  emit('close')
}
function clearBg() {
  store.clear()
  toast.ok('Фон убран')
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="bgm-back" @mousedown.self="emit('close')">
      <div class="bgm" role="dialog" aria-modal="true" :aria-label="`Фон блока «${title}»`">
        <header>
          <h3>Фон блока «{{ title }}»</h3>
          <button class="x" title="Закрыть" aria-label="Закрыть" @click="emit('close')">✕</button>
        </header>

        <div ref="stage" class="stage" :class="{ has: !!draft }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <BlockBgLayer :bg="draft" :veil="veil" />
          <span v-if="!draft" class="hint">Здесь появится картинка</span>
          <span v-else class="hint grab">Тяни картинку, чтобы подвинуть</span>
        </div>

        <div v-if="draft" class="zoom">
          <label for="bgm-zoom">Приближение</label>
          <input id="bgm-zoom" v-model.number="draft.zoom" type="range" :min="BG_ZOOM.min" :max="BG_ZOOM.max" step="0.05" />
        </div>

        <div class="row">
          <input v-model="url" type="url" inputmode="url" placeholder="Ссылка на картинку: https://…" autocomplete="off" @keydown.enter.prevent="applyUrl" />
          <button class="btn" :disabled="busy || !url.trim()" @click="applyUrl">Вставить</button>
        </div>
        <div class="row">
          <input ref="file" type="file" accept="image/*" hidden @change="onFile" />
          <button class="btn wide" :disabled="busy" @click="file?.click()">Загрузить картинку с устройства</button>
        </div>
        <p class="note">Картинка остаётся только в этом браузере и никуда не отправляется.</p>

        <footer>
          <button class="btn ghost" :disabled="!store.bg && !draft" @click="clearBg">Убрать фон</button>
          <span></span>
          <button class="btn ghost" @click="emit('close')">Отмена</button>
          <button class="btn main" :disabled="!draft" @click="save">Сохранить</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bgm-back { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(60, 50, 110, .38); backdrop-filter: blur(3px); }
.bgm { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; display: grid; gap: 14px; padding: 20px; border-radius: 24px; background: #fff; color: #2c2a55; box-shadow: 0 24px 60px rgba(70, 60, 140, .35); }
header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
h3 { margin: 0; font-size: 17px; }
.x { border: 0; background: #f3efff; color: #6a5bc0; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font: inherit; }
.stage { position: relative; height: 190px; border-radius: 18px; overflow: hidden; background: repeating-linear-gradient(45deg, #f6f1ff, #f6f1ff 10px, #efe9ff 10px, #efe9ff 20px); border: 1px dashed #c9bff3; touch-action: none; }
.stage.has { cursor: grab; border-style: solid; }
.stage.has:active { cursor: grabbing; }
.hint { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 2; padding: 4px 12px; border-radius: 99px; background: rgba(255, 255, 255, .85); color: #6a5bc0; font-size: 12px; pointer-events: none; white-space: nowrap; }
.stage:not(.has) .hint { top: 50%; bottom: auto; transform: translate(-50%, -50%); }
.zoom { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; font-size: 13px; color: #6c6a9a; }
.zoom input { width: 100%; accent-color: #8c78da; }
.row { display: flex; gap: 8px; }
.row input[type='url'] { flex: 1; min-width: 0; padding: 11px 14px; border: 1px solid #ddd6f7; border-radius: 14px; font: inherit; font-size: 14px; color: inherit; background: #faf8ff; }
.btn { padding: 10px 16px; border: 1px solid #ddd6f7; border-radius: 14px; background: #f6f2ff; color: #5b4fb3; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn:hover:not(:disabled) { background: #ede7ff; }
.btn:disabled { opacity: .5; cursor: default; }
.btn.wide { flex: 1; }
.btn.main { border: 0; color: #fff; background: linear-gradient(100deg, #b79bf0, #7fb2f5); }
.btn.ghost { background: none; }
.note { margin: 0; font-size: 12px; color: #8a88b4; }
footer { display: flex; gap: 8px; align-items: center; }
footer span { flex: 1; }
@media (max-width: 480px) { footer { flex-wrap: wrap; } footer span { display: none; } }
</style>
