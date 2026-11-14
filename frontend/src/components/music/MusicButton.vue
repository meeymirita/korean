<script setup lang="ts">
import { PLAYER_IMG as IMG } from '@/components/music/playerAssets'
import { useMusicAvailable, useMusicStore } from '@/stores/music'

/**
 * Кнопка открытия плеера: круглая, того же размера, что колокольчик уведомлений (38 px). Стоит в шапке раздела рядом с колокольчиком,
 * в шапке игр рядом с её кнопками (`variant="game"`) и закреплена в правом верхнем углу на остальных страницах (`variant="fixed"`, `app.vue`).
 * Само окно плеера и мини-плеер: `MusicPlayer.vue`; песни: `stores/music.ts`. Только владельцу.
 */
withDefaults(defineProps<{ variant?: 'bar' | 'game' | 'fixed' }>(), { variant: 'bar' })
const store = useMusicStore()
const available = useMusicAvailable()
</script>

<template>
  <button v-if="available" type="button" class="mp-fab" :class="[`mp-fab-${variant}`, { on: store.playing, open: store.open }, variant === 'game' ? 'gx-round' : '']" :aria-label="store.open ? 'Закрыть плеер' : 'Открыть плеер'" :aria-expanded="store.open" title="Музыка" @click="store.open = !store.open">
    <img v-if="store.playing" class="mp-fab-eq" :src="IMG.equalizer" alt="" draggable="false" />
    <img v-else :src="IMG.note" alt="" draggable="false" />
  </button>
</template>

<style>
/* кнопка плеера: размер колокольчика (38 px); в игре размер задаёт её собственный класс gx-round */
.mp-fab { display: inline-grid; place-items: center; flex: none; width: 38px; height: 38px; padding: 0; cursor: pointer; color: var(--ink, #20265c);
  background: rgba(255, 255, 255, .92); border: 1px solid #fff; border-radius: 50%; box-shadow: 0 8px 22px rgba(100, 87, 170, .2); transition: transform .2s, box-shadow .2s, background .2s; }
.mp-fab img { width: 24px; height: 24px; object-fit: contain; pointer-events: none; }
.mp-fab:hover { transform: translateY(-1px); box-shadow: 0 0 0 3px rgba(232, 107, 192, .35), 0 8px 22px rgba(100, 87, 170, .25); }
.mp-fab.on { background: linear-gradient(140deg, #f7a6dc, #d64da9); }
.mp-fab.on:hover { box-shadow: 0 0 0 3px rgba(255, 255, 255, .6), 0 8px 22px rgba(214, 77, 169, .45); }
.mp-fab-fixed { position: fixed; top: 14px; right: 18px; z-index: 41; }
.mp-fab-game img { width: 28px; height: 28px; }
.mp-fab-eq { animation: mp-eq 1s ease-in-out infinite alternate; }
@keyframes mp-eq { from { transform: scaleY(.7); } to { transform: scaleY(1.05); } }
html[data-theme='dark'] .mp-fab { background: rgba(43, 36, 80, .95); border-color: #3b3866; }
html[data-theme='dark'] .mp-fab.on { background: linear-gradient(140deg, #b8509a, #7d6bf0); }
@media (prefers-reduced-motion: reduce) { .mp-fab { transition: none; } .mp-fab-eq { animation: none; } }
</style>
