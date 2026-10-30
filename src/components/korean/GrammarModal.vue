<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { F, blk } from '@/data/korean/render'

const { current, close, prev, next } = useGrammarModal()

function onKey(e: KeyboardEvent) {
  if (!current.value) return
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
watch(current, g => (document.body.style.overflow = g ? 'hidden' : ''))
</script>

<template>
  <div v-if="current" class="study sky study-modal" @click.self="close">
    <div class="gp" role="dialog" aria-modal="true">
      <div class="gh">
        <div class="tt">
          <h2 v-html="F(current.ko)"></h2>
          <div class="rn">{{ current.ru }}</div>
          <div class="pl">
            <span class="pill">{{ current.s }}</span>
            <span v-if="current.l" class="pill l">{{ current.l }}</span>
            <span class="pill" :class="current.st === 'ok' ? 's' : 'n'">
              {{ current.st === 'ok' ? 'пройдено' : 'ещё рано' }}
            </span>
          </div>
        </div>
        <button title="Предыдущая" @click="prev">←</button>
        <button title="Следующая" @click="next">→</button>
        <button title="Закрыть" @click="close">✕</button>
      </div>
      <div :key="current.id" class="gb rich" v-html="current.b.map(blk).join('')"></div>
    </div>
  </div>
</template>
