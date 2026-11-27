<script setup lang="ts">
import { useVoiceAvailable, useVoiceStore } from '@/stores/voice'

/**
 * Кнопка голосового собеседника: круглая, 38 px, как кнопка музыки и колокольчик. Стоит левее музыки: в шапке раздела, в шапке игр
 * (`variant="game"`) и закреплена справа вверху на остальных страницах (`variant="fixed"`, `app.vue`). Окно: `VoicePanel.vue`. Только владельцу.
 */
withDefaults(defineProps<{ variant?: 'bar' | 'game' | 'fixed' }>(), { variant: 'bar' })
const store = useVoiceStore()
const available = useVoiceAvailable()
</script>

<template>
  <button v-if="available" type="button" class="vc-fab" :class="[`vc-fab-${variant}`, { on: store.live, open: store.open }, variant === 'game' ? 'gx-round' : '']" :aria-label="store.open ? 'Закрыть голосовой разговор' : 'Открыть голосовой разговор'" :aria-expanded="store.open" title="Говорить по-корейски" @click="store.open = !store.open">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  </button>
</template>

<style>
/* размер колокольчика (38 px); в игре размер задаёт её собственный класс gx-round */
.vc-fab { display: inline-grid; place-items: center; flex: none; width: 38px; height: 38px; padding: 0; cursor: pointer; color: var(--ink, #20265c);
  background: rgba(255, 255, 255, .92); border: 1px solid #fff; border-radius: 50%; box-shadow: 0 8px 22px rgba(100, 87, 170, .2); transition: transform .2s, box-shadow .2s, background .2s; }
.vc-fab:hover { transform: translateY(-1px); box-shadow: 0 0 0 3px rgba(232, 107, 192, .35), 0 8px 22px rgba(100, 87, 170, .25); }
.vc-fab.on { color: #fff; background: linear-gradient(140deg, #f7a6dc, #d64da9); animation: vc-pulse 1.6s ease-in-out infinite; }
.vc-fab-fixed { position: fixed; top: 14px; right: 64px; z-index: 41; }
.vc-fab-game svg { width: 26px; height: 26px; }
@keyframes vc-pulse { 50% { box-shadow: 0 0 0 6px rgba(232, 107, 192, .25), 0 8px 22px rgba(214, 77, 169, .4); } }
@media (prefers-reduced-motion: reduce) { .vc-fab { transition: none; } .vc-fab.on { animation: none; } }
</style>
