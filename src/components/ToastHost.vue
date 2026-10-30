<script setup lang="ts">
import { watch } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const progress = useProgressStore()
const notes = useNotesStore()

/* события входа и связи с сервером показываем плашками, чтобы они не терялись в тексте на странице */
watch(() => progress.unlocked, (now, was) => {
  if (now && !was) toast.ok(progress.isGuest ? 'Гостевой вход выполнен' : 'Вход выполнен')
  else if (!now && was) toast.info('Вы вышли')
})
watch(() => progress.sync, (now, was) => {
  if (now === 'error' && was !== 'error' && progress.unlocked) toast.error(`Нет связи с сервером: ${progress.syncMessage}. Ответы сохранены в браузере`)
  else if (now === 'ok' && was === 'error') toast.ok('Связь с сервером восстановлена')
})
watch(() => notes.status, (now, was) => {
  if (now === 'error' && was !== 'error') toast.error(`Заметки не сохранились: ${notes.message}`)
})

const icon = { ok: '✓', info: '✳', error: '!' } as const
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="tst" tag="div" class="tst" role="status" aria-live="polite">
      <button v-for="t in toast.items" :key="t.id" class="tst-item" :class="t.kind" @click="toast.dismiss(t.id)">
        <span class="ic">{{ icon[t.kind] }}</span>
        <span class="tx">{{ t.text }}</span>
      </button>
    </TransitionGroup>
  </Teleport>
</template>

<style>
.tst { position: fixed; right: 22px; top: 76px; z-index: 600; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: none;
  font-family: 'Archivo', 'Noto Sans KR', sans-serif; }
.tst-item { pointer-events: auto; display: inline-flex; align-items: center; gap: 14px; width: max-content; max-width: min(460px, calc(100vw - 44px)); padding: 18px 28px 18px 18px;
  font: inherit; font-size: 16px; font-weight: 600; line-height: 1.4; text-align: left; color: #37378f; border: 1px solid #fff; border-radius: 24px; cursor: pointer;
  background: linear-gradient(100deg, #f8b9e9, #9de4ff); box-shadow: 0 18px 44px rgba(100, 87, 170, .34); }
.tst-item.info { background: rgba(255, 255, 255, .96); color: #20265c; }
.tst-item.error { background: #ffe5f0; color: #8f2f4f; border-color: #f4a7c8; }
.tst-item .ic { flex: none; display: grid; place-items: center; width: 32px; height: 32px; font-size: 16px; font-weight: 800; border-radius: 50%; background: rgba(255, 255, 255, .78); }
.tst-item.error .ic { background: #c4503f; color: #fff; }
.tst-item .tx { overflow-wrap: anywhere; }
.tst-enter-active { transition: transform .4s cubic-bezier(.2, 1.3, .4, 1), opacity .25s; }
.tst-leave-active { transition: transform .28s ease, opacity .25s ease; position: absolute; right: 0; }
.tst-enter-from { opacity: 0; transform: translateX(60px) scale(.92); }
.tst-leave-to { opacity: 0; transform: translateX(40px) scale(.96); }
.tst-move { transition: transform .3s ease; }
@media (prefers-reduced-motion: reduce) { .tst-enter-active, .tst-leave-active, .tst-move { transition: opacity .2s; } .tst-enter-from, .tst-leave-to { transform: none; } }
@media (max-width: 560px) { .tst { right: 10px; top: 66px; } .tst-item { padding: 14px 20px 14px 14px; font-size: 15px; } }
</style>
