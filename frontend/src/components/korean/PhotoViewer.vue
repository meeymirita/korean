<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** Просмотр фото на весь экран. Слой 300 (выше окна грамматики 50); Esc закрывает только фото, а не окно под ним. */
defineProps<{ src: string | null; alt?: string }>()
const emit = defineEmits<{ close: [] }>()
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopImmediatePropagation()
  emit('close')
}

/** Размер фото в процентах от окна: ползунок сбоку, значение помнится в браузере. */
const KEY = 'photo_view_size'
const MIN = 20
const MAX = 100
const size = ref(50)
watch(size, v => {
  try { localStorage.setItem(KEY, String(v)) } catch { /* без хранилища размер просто не запомнится */ }
})
onMounted(() => {
  try {
    const v = Number(localStorage.getItem(KEY))
    if (Number.isFinite(v) && v >= MIN && v <= MAX) size.value = v
  } catch { /* хранилища нет */ }
  window.addEventListener('keydown', onKey, true)
})
const step = (d: number) => (size.value = Math.min(MAX, Math.max(MIN, size.value + d)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="src" class="pv-back" role="dialog" aria-modal="true" :aria-label="alt || 'Фото'" @click="emit('close')">
      <img :src="src" :alt="alt || ''" class="pv-img" :style="{ '--pv-size': size }" @click.stop />
      <div class="pv-size" role="group" aria-label="Размер фото" @click.stop>
        <button type="button" aria-label="Крупнее" :disabled="size >= MAX" @click="step(10)">+</button>
        <span class="pv-rail"><input v-model.number="size" type="range" :min="MIN" :max="MAX" step="5" aria-label="Размер фото" /></span>
        <button type="button" aria-label="Мельче" :disabled="size <= MIN" @click="step(-10)">−</button>
        <small>{{ size }}%</small>
      </div>
      <button type="button" class="pv-x" aria-label="Закрыть фото" @click.stop="emit('close')">✕</button>
    </div>
  </Teleport>
</template>

<style>
.pv-back { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 24px; background: rgba(32, 38, 92, .6); backdrop-filter: blur(8px); cursor: zoom-out; }
.pv-img { --pv-size: 50; max-width: calc(var(--pv-size) * 1vw - 24px); max-height: 100%; object-fit: contain; border-radius: 18px; box-shadow: 0 30px 80px rgba(30, 36, 100, .45); cursor: default; }
.pv-x { position: absolute; top: 18px; right: 18px; width: 40px; height: 40px; font: inherit; color: #1e2350; background: #fff; border: 0; border-radius: 50%; box-shadow: 0 6px 18px rgba(30, 36, 100, .25); cursor: pointer; }
@media (max-width: 760px) { .pv-img { max-width: calc(var(--pv-size) * 1vw + 40px); } }
.pv-size { position: absolute; top: 50%; right: 18px; transform: translateY(-50%); display: grid; justify-items: center; gap: 8px; padding: 10px 6px; color: #1e2350; background: rgba(255, 255, 255, .92); border-radius: 22px; box-shadow: 0 6px 18px rgba(30, 36, 100, .25); cursor: default; }
.pv-size button { width: 30px; height: 30px; font: inherit; font-size: 18px; line-height: 1; color: #1e2350; background: #f1eefc; border: 0; border-radius: 50%; cursor: pointer; transition: background .15s; }
.pv-size button:hover:not(:disabled) { background: #e2dcfa; }
.pv-size button:disabled { opacity: .4; cursor: default; }
.pv-size small { font-size: 12px; font-weight: 700; }
.pv-rail { display: block; width: 28px; height: 150px; }
.pv-rail input { width: 150px; height: 28px; margin: 0; transform-origin: 0 0; transform: translate(0, 150px) rotate(-90deg); accent-color: #8f7cf0; cursor: pointer; }
</style>
