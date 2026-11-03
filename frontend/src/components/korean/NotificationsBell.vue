<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { computeNotices, dismissNotice, type Notice } from '@/composables/useNotices'
import { useProgressStore } from '@/stores/progress'

/** Колокольчик в шапке раздела: короткие напоминания, которые не вписываются в тосты (не разовое событие, а состояние — «давно не открывал», «скоро истечёт»). */
const progress = useProgressStore()
const route = useRoute()
const notices = ref<Notice[]>([])
const open = ref(false)

function refresh() {
  notices.value = computeNotices(progress)
}
onMounted(refresh)
watch(() => route.fullPath, refresh)

function dismiss(n: Notice) {
  dismissNotice(n.id)
  refresh()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="nb">
    <button type="button" class="nb-btn" :aria-label="`Уведомления${notices.length ? `, новых: ${notices.length}` : ''}`" @click="open = !open">
      <Icon name="bell" />
      <span v-if="notices.length" class="nb-dot">{{ notices.length }}</span>
    </button>
    <Teleport to="body">
      <div v-if="open" class="nb-bg" @click="open = false">
        <div class="nb-panel" role="dialog" aria-label="Уведомления" @click.stop>
          <p v-if="!notices.length" class="nb-empty">Новых напоминаний нет.</p>
          <RouterLink v-for="n in notices" :key="n.id" :to="n.to" class="nb-item" @click="open = false">
            <span>{{ n.text }}</span>
            <button type="button" class="nb-x" aria-label="Скрыть напоминание" @click.stop.prevent="dismiss(n)">✕</button>
          </RouterLink>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
.nb { position: relative; }
.study.sky .nb-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; padding: 0; font: inherit;
  color: var(--ink); background: rgba(255, 255, 255, .92); border: 1px solid #fff; border-radius: 50%; box-shadow: 0 8px 22px rgba(100, 87, 170, .2); cursor: pointer; transition: .2s; }
.study.sky .nb-btn:hover { transform: translateY(-1px); color: var(--pink); }
.nb-dot { position: absolute; top: -3px; right: -3px; min-width: 16px; height: 16px; padding: 0 3px; display: grid; place-items: center; border-radius: 999px;
  background: var(--pink); color: #fff; font-size: 10px; font-weight: 700; line-height: 1; box-shadow: 0 0 0 2px #fff; }
.nb-bg { position: fixed; inset: 0; z-index: 46; background: transparent; }
.nb-panel { position: fixed; top: 60px; right: 18px; z-index: 46; width: min(340px, calc(100vw - 36px)); max-height: 60vh; overflow-y: auto; padding: 8px;
  background: #fff; border: 1px solid rgba(255, 255, 255, .9); border-radius: 20px; box-shadow: 0 24px 60px -16px rgba(60, 50, 130, .35); }
.nb-empty { margin: 0; padding: 14px 10px; font-size: 13px; color: var(--muted); text-align: center; }
.nb-item { display: flex; align-items: flex-start; gap: 8px; padding: 10px 10px; border-radius: 14px; font-size: 13px; line-height: 1.4; color: var(--ink); }
.nb-item:hover { background: rgba(143, 124, 240, .08); }
.nb-item span { flex: 1; }
.nb-x { flex: none; width: 22px; height: 22px; border: 0; border-radius: 50%; background: rgba(143, 124, 240, .12); color: var(--muted); font-size: 11px; cursor: pointer; }
.nb-x:hover { background: rgba(214, 77, 169, .18); color: var(--pink); }
@media (max-width: 860px) { .nb-panel { top: auto; bottom: 68px; right: auto; left: 18px; } }
</style>
